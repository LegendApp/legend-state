import type {
    ActivateParamsWithLookup,
    ListenerParams,
    NodeValue,
    Observable,
    ObservableOnChangeParams,
    ObservablePersistRemoteFunctions,
    ObservablePersistRemoteGetParams,
    ObservablePersistRemoteSetParams,
    UpdateFn,
    WithState,
} from '@legendapp/state';
import { getNodeValue, internal, isFunction, isPromise, mergeIntoObservable, whenReady } from '@legendapp/state';
import { persistObservable } from './persistObservable';
const { getProxy, globalState, setupRetry, symbolActivated } = internal;

export function persistActivateNode() {
    globalState.activateNode = function activateNodePersist(
        node: NodeValue,
        refresh: () => void,
        wasPromise: boolean,
        newValue: any,
    ) {
        if (node.activationState) {
            const { get, initial, onSet, subscribe, cache, retry, waitFor, offlineBehavior } =
                node.activationState! as ActivateParamsWithLookup & { onError?: () => void };

            let onChange: UpdateFn | undefined = undefined;
            const pluginRemote: ObservablePersistRemoteFunctions = {};
            if (get) {
                pluginRemote.get = (params: ObservablePersistRemoteGetParams<any>) => {
                    onChange = params.onChange;
                    const updateLastSync = (lastSync: number) => (params.lastSync = lastSync);
                    let timeoutRetry: { current?: any } = {};
                    const attemptNum = { current: 0 };
                    let onError: (() => void) | undefined;
                    const setMode = (mode: 'assign' | 'set') => (params.mode = mode);

                    let value: any = undefined;
                    const nodeValue = getNodeValue(node);
                    const doGet = () => {
                        return (value = get!({
                            value: isFunction(nodeValue) || nodeValue?.[symbolActivated] ? undefined : nodeValue,
                            lastSync: params.lastSync!,
                            updateLastSync,
                            setMode,
                        }));
                    };

                    if (waitFor) {
                        value = whenReady(waitFor, doGet);
                    } else {
                        value = doGet();
                    }

                    if (isPromise(value)) {
                        return new Promise((resolve) => {
                            const run = async () => {
                                if (retry) {
                                    node.activationState!.persistedRetry = true;
                                    if (timeoutRetry?.current) {
                                        clearTimeout(timeoutRetry.current);
                                    }
                                    const { handleError, timeout } = setupRetry(
                                        retry,
                                        () => {
                                            value = undefined;
                                            run();
                                        },
                                        attemptNum,
                                    );
                                    onError = handleError;
                                    timeoutRetry = timeout;
                                }

                                try {
                                    if (value === undefined) {
                                        // This is a retry
                                        value = await doGet();
                                    } else {
                                        value = await value;
                                    }
                                    resolve(value);
                                } catch (err) {
                                    if (onError) {
                                        onError();
                                    } else {
                                        throw err;
                                    }
                                }
                            };
                            return run();
                        });
                    }

                    return value;
                };
            }
            if (onSet) {
                // TODO: Work out these types better
                let timeoutRetry: { current?: any };
                pluginRemote.set = async (params: ObservablePersistRemoteSetParams<any>) => {
                    if (node.state?.isLoaded.get()) {
                        return new Promise((resolve) => {
                            const attemptNum = { current: 0 };
                            const run = async () => {
                                let changes = {};
                                let maxModified = 0;
                                let didError = false;
                                let onError: () => void;
                                if (!node.state!.isLoaded.peek()) {
                                    await whenReady(node.state!.isLoaded);
                                }
                                if (retry) {
                                    if (timeoutRetry?.current) {
                                        clearTimeout(timeoutRetry.current);
                                    }
                                    const { handleError, timeout } = setupRetry(retry, run, attemptNum);
                                    onError = handleError;
                                    timeoutRetry = timeout;
                                }
                                await onSet(params as unknown as ListenerParams, {
                                    node,
                                    update: (params) => {
                                        const { value, lastSync } = params;
                                        maxModified = Math.max(lastSync || 0, maxModified);
                                        changes = mergeIntoObservable(changes, value);
                                    },
                                    onError: () => {
                                        didError = true;
                                        onError?.();
                                    },
                                    refresh,
                                    fromSubscribe: false,
                                });
                                if (!didError) {
                                    resolve({ changes, lastSync: maxModified || undefined });
                                }
                            };
                            run();
                        });
                    }
                };
            }
            if (subscribe) {
                subscribe({
                    node,
                    update: (params: ObservableOnChangeParams) => {
                        if (!onChange) {
                            // TODO: Make this message better
                            console.log('[legend-state] Cannot update immediately before the first return');
                        } else {
                            onChange(params);
                        }
                    },
                    refresh,
                });
            }
            persistObservable(getProxy(node), {
                pluginRemote,
                ...(cache || {}),
                remote: {
                    retry: retry,
                    offlineBehavior,
                },
            }) as unknown as Observable<WithState>;

            const nodeVal = getNodeValue(node);
            if (nodeVal !== undefined) {
                newValue = nodeVal;
            } else if (newValue === undefined) {
                newValue = initial;
            }

            return { update: onChange!, value: newValue };
        } else {
            let onChange: UpdateFn | undefined = undefined;
            const pluginRemote: ObservablePersistRemoteFunctions = {
                get: async (params: ObservablePersistRemoteGetParams<any>) => {
                    onChange = params.onChange;
                    if (isPromise(newValue)) {
                        try {
                            newValue = await newValue;
                            // eslint-disable-next-line no-empty
                        } catch {}
                    }
                    return newValue;
                },
            };

            persistObservable(getProxy(node), {
                pluginRemote,
            });

            return { update: onChange!, value: newValue };
        }
    };
}
