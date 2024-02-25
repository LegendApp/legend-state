import type {
    SyncedLookupParams,
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
    globalState.activateNodePersist = function activateNodePersist(
        node: NodeValue,
        refresh: () => void,
        wasPromise: boolean,
        newValue: any,
    ) {
        if (node.activationState) {
            // If it is a Synced
            const { get, initial, onSet, subscribe, cache, retry, offlineBehavior, waitForSet } =
                node.activationState! as SyncedLookupParams;

            let onChange: UpdateFn | undefined = undefined;
            const pluginRemote: ObservablePersistRemoteFunctions = {};
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
                    waitForSet,
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

            persistObservable(getProxy(node), {
                pluginRemote,
            });

            return { update: onChange!, value: newValue };
        }
    };
}
