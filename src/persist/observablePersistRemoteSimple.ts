import type {
    ObservablePersistRemote,
    ObservablePersistRemoteGetParams,
    ObservablePersistRemoteSaveParams,
    ObservablePersistRemoteSimple,
} from '@legendapp/state';

export function observablePersistRemoteSimple<T>({ get, set }: ObservablePersistRemoteSimple<T>) {
    const ret = {
        async get(params: ObservablePersistRemoteGetParams<T>) {
            const value = (await get(params)) as T;
            params.onChange({ value, dateModified: Date.now() });
            params.onLoad();
        },
    } as ObservablePersistRemote;

    if (set) {
        ret.save = async (params: ObservablePersistRemoteSaveParams<any>) => {
            return set?.(params);
        };
    }

    return ret;
}
