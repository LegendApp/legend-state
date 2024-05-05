import { isPromise } from '@legendapp/state';
import { ObservableSyncGetParams, SyncedOptions, type ObservableSyncClass } from '@legendapp/state/sync';

export function syncObservableAdapter<T = {}>({ get, set }: SyncedOptions<T>): ObservableSyncClass {
    const ret: ObservableSyncClass = {};

    if (get) {
        ret.get = (async (params: ObservableSyncGetParams<T>) => {
            try {
                let value = get(params as any);
                if (isPromise(value)) {
                    value = await value;
                }

                params.onChange({
                    value,
                    lastSync: params.lastSync,
                    mode: params.mode!,
                });
                params.onGet();
                // eslint-disable-next-line no-empty
            } catch {}
        }) as ObservableSyncClass['get'];
    }

    if (set) {
        ret.set = set as unknown as ObservableSyncClass['set'];
    }

    return ret;
}
