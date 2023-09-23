import {
    ObservablePersistRemoteClass,
    ObservablePersistRemoteFunctions,
    ObservablePersistRemoteGetParams,
} from './types';

export function observablePersistRemoteFunctionsAdapter<T = {}, TState = {}>({
    get,
    set,
}: ObservablePersistRemoteFunctions<T, TState>): ObservablePersistRemoteClass {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore type too deep
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
