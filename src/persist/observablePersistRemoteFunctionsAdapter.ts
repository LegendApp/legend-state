import type {
    ObservablePersistRemoteClass,
    ObservablePersistRemoteFunctions,
    ObservablePersistRemoteGetParams,
} from '@legendapp/state';

export function observablePersistRemoteFunctionsAdapter<T = {}, TState = {}>({
    get,
    set,
}: ObservablePersistRemoteFunctions<T, TState>): ObservablePersistRemoteClass {
    const ret = {
        async get(params: ObservablePersistRemoteGetParams<T, TState>) {
            const value = (await get(params)) as T;
            params.onChange({ value, dateModified: Date.now() });
            params.onGet();
        },
    } as ObservablePersistRemoteClass;

    if (set) {
        ret.set = set as ObservablePersistRemoteClass['set'];
    }

    return ret;
}
