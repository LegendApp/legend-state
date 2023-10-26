import type {
    ObservablePersistRemoteClass,
    ObservablePersistRemoteFunctions,
    ObservablePersistRemoteGetParams,
} from '@legendapp/state';

export function observablePersistRemoteFunctionsAdapter<T = {}>({
    get,
    set,
}: ObservablePersistRemoteFunctions<T>): ObservablePersistRemoteClass {
    const ret: ObservablePersistRemoteClass = {};

    if (get) {
        ret.get = (async (params: ObservablePersistRemoteGetParams<T>) => {
            const value = (await get(params)) as T;
            params.onChange({ value, dateModified: params.dateModified || Date.now() });
            params.onGet();
        }) as ObservablePersistRemoteClass['get'];
    }

    if (set) {
        ret.set = set as ObservablePersistRemoteClass['set'];
    }

    return ret;
}
