import { Observable, Synced, SyncedParams, SyncedSetParams, isString, observable } from '@legendapp/state';
import { synced } from '@legendapp/state/persist';

export function observableFetch<T>(
    input: RequestInfo | URL,
    init?: RequestInit,
    valueType?: 'arrayBuffer' | 'blob' | 'formData' | 'json' | 'text',
): Observable<{
    data?: T;
    error?: any;
    errorStr?: string;
    loading: boolean;
}> {
    const obs: Observable<any> = observable({
        data: undefined,
        error: undefined,
        errorStr: undefined,
        loading: true,
    });

    fetch(input, init)
        .then((response) => response[valueType || 'json']())
        .then((value) => obs.set({ data: value, loading: false }))
        .catch((error) => obs.set({ loading: false, error, errorStr: error?.toString?.() }));

    return obs as any;
}

export interface SyncedFetchProps extends Omit<SyncedParams, 'get' | 'set'> {
    get: string | RequestInfo;
    set?: string | RequestInfo;
    getInit?: RequestInit;
    setInit?: RequestInit;
    valueType?: 'arrayBuffer' | 'blob' | 'formData' | 'json' | 'text';
    onSetValueType?: 'arrayBuffer' | 'blob' | 'formData' | 'json' | 'text';
    onSet?: (params: SyncedSetParams<any>) => void;
}

export function syncedFetch<T>({
    get,
    set,
    getInit,
    setInit,
    valueType,
    onSet,
    onSetValueType,
}: SyncedFetchProps): Synced<T> {
    const ret: SyncedParams = {
        get: () => fetch(get, getInit).then((response) => response[valueType || 'json']()),
    };

    if (set) {
        ret.set = async (params: SyncedSetParams<any>) => {
            const requestInfo = isString(set) ? ({ url: set } as RequestInfo) : set;
            const response = await fetch(
                Object.assign({ method: 'POST' }, requestInfo, { body: JSON.stringify(params.value) }),
                setInit,
            );
            if (onSet) {
                params.value = response[onSetValueType || valueType || 'json']();
                onSet(params);
            }
        };
    }

    return synced(ret);
}
