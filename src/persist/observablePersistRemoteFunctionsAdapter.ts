import {
    isPromise,
    type ObservablePersistRemoteClass,
    type ObservablePersistRemoteFunctions,
    type ObservablePersistRemoteGetParams,
} from '@legendapp/state';

export function observablePersistRemoteFunctionsAdapter<T = {}>({
    get,
    set,
}: ObservablePersistRemoteFunctions<T>): ObservablePersistRemoteClass {
    const ret: ObservablePersistRemoteClass = {};

    if (get) {
        ret.get = (async (params: ObservablePersistRemoteGetParams<T>) => {
            try {
                let value = get(params);
                if (isPromise(value)) {
                    value = await value;
                }

                params.onChange({ value, dateModified: params.dateModified, mode: params.mode });
                params.onGet();
                // eslint-disable-next-line no-empty
            } catch {}
        }) as ObservablePersistRemoteClass['get'];
    }

    if (set) {
        ret.set = set as ObservablePersistRemoteClass['set'];
    }

    return ret;
}
