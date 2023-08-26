import type {
    ObservablePersistRemoteClass,
    ObservablePersistRemoteFunctions,
    ObservablePersistRemoteGetParams,
    ObservablePersistRemoteSaveParams,
} from '@legendapp/state';

export function observablePersistRemoteFunctionsAdapter<T>({
    get,
    set,
}: ObservablePersistRemoteFunctions<T>): ObservablePersistRemoteClass {
    const ret = {
        async get(params: ObservablePersistRemoteGetParams<T>) {
            const value = (await get(params)) as T;
            params.onChange({ value, dateModified: Date.now() });
            params.onLoad();
        },
    } as ObservablePersistRemoteClass;

    if (set) {
        ret.set = async (params: ObservablePersistRemoteSaveParams<any>) => {
            return set?.(params);
        };
    }

    return ret;
}