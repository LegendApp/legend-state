import type {
    ListenerParams,
    NodeValue,
    ObservableOnChangeParams,
    ObservablePersistRemoteFunctions,
    ObservablePersistRemoteGetParams,
    ObservablePersistRemoteSetParams,
    UpdateFn,
} from '@legendapp/state';
import { internal, isPromise } from '@legendapp/state';
import { persistObservable } from './persistObservable';
const { getProxy, globalState } = internal;

export function persistActivateNode() {
    globalState.activateNode = function activateNodePersist(
        node: NodeValue,
        refresh: () => void,
        wasPromise: boolean,
        newValue: any,
    ) {
        const { onSetFn, subscriber, lastSync, cacheOptions, retryOptions } = node.activationState!;

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
                if (lastSync.value) {
                    params.dateModified = lastSync.value;
                }
                return newValue;
            },
        };
        if (onSetFn) {
            // TODO: Work out these types better
            pluginRemote.set = (params: ObservablePersistRemoteSetParams<any>) => {
                if (node.state?.isLoaded.get()) {
                    onSetFn(params as unknown as ListenerParams, {
                        update: onChange as UpdateFn,
                    });
                }
            };
        }
        if (subscriber) {
            subscriber({
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
            ...(cacheOptions || {}),
            remote: {
                retry: retryOptions,
            },
        });

        return { update: onChange! };
    };
}
