import type { NodeInfo, UpdateFn } from '@legendapp/state';
import { internal, isFunction, isPromise } from '@legendapp/state';
import { syncObservable } from './syncObservable';
import type { SyncedGetParams, SyncedOptions } from './syncTypes';
const { getProxy, globalState, setNodeValue, getNodeValue } = internal;

export function enableActivateSyncedNode() {
    globalState.activateSyncedNode = function activateSyncedNode(node: NodeInfo, newValue: any) {
        const obs$ = getProxy(node);
        if (node.activationState) {
            // If it is a Synced
            const {
                get: getOrig,
                initial,
                set,
                onChange,
            } = node.activationState! as NodeInfo['activationState'] & SyncedOptions;

            let promiseReturn: any = undefined;

            const get = getOrig
                ? (((params: SyncedGetParams<any>) => {
                      return (promiseReturn = getOrig!(params as any));
                  }) as typeof getOrig)
                : undefined;

            const nodeVal = getNodeValue(node);
            if (promiseReturn !== undefined) {
                newValue = promiseReturn;
            } else if (nodeVal !== undefined && !isFunction(nodeVal)) {
                newValue = nodeVal;
            } else {
                newValue = initial;
            }
            setNodeValue(node, promiseReturn ? undefined : newValue);

            syncObservable(obs$, { ...node.activationState, get, set });

            return { update: onChange!, value: newValue };
        } else {
            // If it is not a Synced

            let update: UpdateFn | undefined = undefined;
            const get = async (params: SyncedGetParams<any>) => {
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
