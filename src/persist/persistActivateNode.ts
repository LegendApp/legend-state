import type {
    ActivateParamsWithLookup,
    ListenerParams,
    NodeValue,
    ObservableOnChangeParams,
    ObservablePersistRemoteFunctions,
    ObservablePersistRemoteGetParams,
    ObservablePersistRemoteSetParams,
    UpdateFn,
} from '@legendapp/state';
import { getNodeValue, internal, isFunction, isPromise, mergeIntoObservable, whenReady } from '@legendapp/state';
import { persistObservable } from './persistObservable';
const { getProxy, globalState, runWithRetry, symbolActivated } = internal;

export function persistActivateNode() {
    globalState.activateNode = function activateNodePersist(
        node: NodeValue,
        refresh: () => void,
        wasPromise: boolean,
        newValue: any,
    ) {
        if (node.activationState) {
            const { get, initial, onSet, subscribe, cache, retry, offlineBehavior } =
                node.activationState! as ActivateParamsWithLookup;

            let onChange: UpdateFn | undefined = undefined;
            const pluginRemote: ObservablePersistRemoteFunctions = {};
            if (get) {
                pluginRemote.get = (params: ObservablePersistRemoteGetParams<any>) => {
                    onChange = params.onChange;
                    const updateLastSync = (lastSync: number) => (params.lastSync = lastSync);
                    const setMode = (mode: 'assign' | 'set') => (params.mode = mode);

                    const nodeValue = getNodeValue(node);
                    const value = runWithRetry(node, { attemptNum: 0 }, () => {
                        return get!({
                            value: isFunction(nodeValue) || nodeValue?.[symbolActivated] ? undefined : nodeValue,
                            lastSync: params.lastSync!,
                            updateLastSync,
                            setMode,
                            refresh,
                        });
                    });

                    return value;
                };
            }
            if (onSet) {
                // TODO: Work out these types better
                pluginRemote.set = async (params: ObservablePersistRemoteSetParams<any>) => {
                    if (node.state?.isLoaded.get()) {
                        return runWithRetry(node, { attemptNum: 0 }, async (retryEvent) => {
                            let changes = {};
                            let maxModified = 0;
                            if (!node.state!.isLoaded.peek()) {
                                await whenReady(node.state!.isLoaded);
                            }

                            const cancelRetry = () => {
                                retryEvent.cancel = true;
                            };

                            await onSet({
                                ...(params as unknown as ListenerParams),
                                node,
                                update: (params) => {
                                    const { value, lastSync } = params;
                                    maxModified = Math.max(lastSync || 0, maxModified);
                                    changes = mergeIntoObservable(changes, value);
                                },
                                cancelRetry,
                                refresh,
                                fromSubscribe: false,
                            });
                            return { changes, lastSync: maxModified || undefined };
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
            });

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
