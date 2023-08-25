import type {
    ObservablePersistRemote,
    ObservablePersistRemoteGetParams,
    ObservablePersistRemoteSaveParams,
    ObservablePersistRemoteSimple,
} from '@legendapp/state';

export function observablePersistRemoteSimple<T>({ get, set }: ObservablePersistRemoteSimple<T>) {
    return {
        async get({ dateModified, onChange, onLoad }: ObservablePersistRemoteGetParams<T>) {
            const value = (await get({ dateModified })) as T;
            onChange({ value, dateModified: Date.now() });
            onLoad();
        },
        async save({ valueAtPath, prevAtPath, path, pathTypes, value }: ObservablePersistRemoteSaveParams<T>) {
            return set ? set({ valueAtPath, path, pathTypes, prevAtPath, value }) : {};
        },
    } as ObservablePersistRemote;
}
