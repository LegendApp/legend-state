import type {
    ObservablePersistRemote,
    ObservablePersistRemoteGetParams,
    ObservablePersistRemoteSaveParams,
    ObservablePersistRemoteSimple,
} from '@legendapp/state';

export function observablePersistRemoteSimple<T>({ get, set }: ObservablePersistRemoteSimple<T>) {
    return {
        async get(params: ObservablePersistRemoteGetParams<T>) {
            const value = (await get(params)) as T;
            params.onChange({ value, dateModified: Date.now() });
            params.onLoad();
        },
        async save(params: ObservablePersistRemoteSaveParams<T>) {
            return set ? set(params) : {};
        },
    } as ObservablePersistRemote;
}
