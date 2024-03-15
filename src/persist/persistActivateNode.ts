import type {
    ListenerParams,
    NodeValue,
    Observable,
    ObservableOnChangeParams,
    ObservablePersistRemoteFunctions,
    ObservablePersistRemoteGetParams,
    ObservablePersistRemoteSetParams,
    ObservablePersistState,
    UpdateFn,
} from '@legendapp/state';
import { getNodeValue, internal, isFunction, isPromise, mergeIntoObservable, when, whenReady } from '@legendapp/state';
import { persistObservable } from './persistObservable';
const { getProxy, globalState, runWithRetry, symbolActivated } = internal;

export function persistActivateNode() {
    globalState.activateNodePersist = function activateNodePersist(node: NodeValue, newValue: any) {
        const obs$ = getProxy(node);
        if (node.activationState) {
            // If it is a Synced
            const { get, initial, onSet, subscribe, cache, retry, offlineBehavior, waitForSet, saveTimeout } =
                node.activationState!;

            let onChange: UpdateFn | undefined = undefined;
            const pluginRemote: ObservablePersistRemoteFunctions = {};
            let promiseReturn: any = undefined;

            // Not sure why this disable is needed, but it's needed to make the linter happy
            // eslint-disable-next-line prefer-const
            let syncState: Observable<ObservablePersistState>;
            const refresh = () => syncState?.sync();

            if (get) {
                pluginRemote.get = (params: ObservablePersistRemoteGetParams<any>) => {
                    onChange = params.onChange;
                    const updateLastSync = (lastSync: number) => (params.lastSync = lastSync);
                    const setMode = (mode: 'assign' | 'set') => (params.mode = mode);

                    const existingValue = getNodeValue(node);
                    const value = runWithRetry(node, { attemptNum: 0 }, () => {
                        return get!({
                            value:
                                isFunction(existingValue) || existingValue?.[symbolActivated]
                                    ? undefined
                                    : existingValue,
                            lastSync: params.lastSync!,
                            updateLastSync,
                            setMode,
                            refresh,
                        });
                    });

                    promiseReturn = value;

                    return value;
                };
            }
            if (onSet) {
                // TODO: Work out these types better
                pluginRemote.set = async (params: ObservablePersistRemoteSetParams<any>) => {
                    if (node.state?.isLoaded.get()) {
                        const retryAttempts = { attemptNum: 0 };
                        return runWithRetry(node, retryAttempts, async (retryEvent) => {
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
                                retryNum: retryAttempts.attemptNum,
                                cancelRetry,
                                refresh,
                                fromSubscribe: false,
                            });
                            return { changes, lastSync: maxModified || undefined };
                        });
                    }
                };
            }

            syncState = persistObservable(obs$, {
                pluginRemote,
                ...(cache || {}),
                remote: {
                    retry,
                    offlineBehavior,
                    waitForSet,
                    saveTimeout,
                },
            });

            if (subscribe) {
                when(promiseReturn || true, () => {
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
                });
            }

            const nodeVal = getNodeValue(node);
            if (isFunction(nodeVal)) {
                newValue = promiseReturn;
                obs$.set(undefined);
            } else {
                if (nodeVal !== undefined) {
                    newValue = nodeVal;
                } else if (newValue === undefined) {
                    newValue = initial;
                }
                obs$.set(newValue);
            }

            return { update: onChange!, value: newValue };
        } else {
            // If it is not a Synced

            let onChange: UpdateFn | undefined = undefined;
            const pluginRemote: ObservablePersistRemoteFunctions = {
                get: async (params: ObservablePersistRemoteGetParams<any>) => {
                    onChange = params.onChange;
                    if (isPromise(newValue)) {
                        try {
                            newValue = await newValue;
                        } catch {
                            // TODO Once we have global retry settings this should retry
                        }
                    }
                    return newValue;
                },
            };

            persistObservable(obs$, {
                pluginRemote,
            });

            return { update: onChange!, value: newValue };
        }
    };
}
