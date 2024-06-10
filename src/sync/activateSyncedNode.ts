import type { NodeValue, Observable, ObservableSyncState, UpdateFn } from '@legendapp/state';
import { internal, isFunction, isPromise, whenReady } from '@legendapp/state';
import { syncObservable } from './syncObservable';
import type {
    ObservableSyncFunctions,
    ObservableSyncSetParams,
    SyncedGetParams,
    SyncedOptions,
    SyncedSetParams,
} from './syncTypes';
const { getProxy, globalState, runWithRetry, setNodeValue, getNodeValue } = internal;

export function enableActivateSyncedNode() {
    globalState.activateSyncedNode = function activateSyncedNode(node: NodeValue, newValue: any) {
        const obs$ = getProxy(node);
        if (node.activationState) {
            // If it is a Synced
            const {
                get: getOrig,
                initial,
                set,
                retry,
                onChange,
            } = node.activationState! as NodeValue['activationState'] & SyncedOptions;

            const pluginRemote: ObservableSyncFunctions = {};
            let promiseReturn: any = undefined;

            // Not sure why this disable is needed, but it's needed to make the linter happy
            // eslint-disable-next-line prefer-const
            let syncState: Observable<ObservableSyncState>;
            const refresh = () => syncState?.sync();

            const get = getOrig
                ? (((params: SyncedGetParams) => {
                      return (promiseReturn = getOrig!(params as any));
                  }) as typeof getOrig)
                : undefined;
            if (set) {
                // TODO: Work out these types better
                pluginRemote.set = async (params: ObservableSyncSetParams<any>) => {
                    if (node.state?.isLoaded.get()) {
                        const retryAttempts = { attemptNum: 0, retry: retry || params.options?.retry };
                        return runWithRetry(node, retryAttempts, async (retryEvent) => {
                            if (!node.state!.isLoaded.peek()) {
                                await whenReady(node.state!.isLoaded);
                            }

                            const cancelRetry = () => {
                                retryEvent.cancel = true;
                            };

                            return set({
                                ...(params as unknown as SyncedSetParams<any>),
                                node,
                                retryNum: retryAttempts.attemptNum,
                                cancelRetry,
                                refresh,
                                fromSubscribe: false,
                            });
                        });
                    }
                };
            }

            const nodeVal = getNodeValue(node);
            if (promiseReturn !== undefined) {
                newValue = promiseReturn;
            } else if (nodeVal !== undefined && !isFunction(nodeVal)) {
                newValue = nodeVal;
            } else {
                newValue = initial;
            }
            setNodeValue(node, promiseReturn ? undefined : newValue);

            syncState = syncObservable(obs$, { ...node.activationState, get, ...pluginRemote });

            return { update: onChange!, value: newValue };
        } else {
            // If it is not a Synced

            let update: UpdateFn | undefined = undefined;
            const get = async (params: SyncedGetParams) => {
                update = params.refresh;
                if (isPromise(newValue)) {
                    try {
                        newValue = await newValue;
                    } catch {
                        // TODO Once we have global retry settings this should retry
                    }
                }
                return newValue;
            };

            syncObservable(obs$, {
                get,
            });

            return { update: update!, value: newValue };
        }
    };
}
