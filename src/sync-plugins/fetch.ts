import { Synced, SyncedOptions, SyncedSetParams, isString } from '@legendapp/state';
import { synced } from '@legendapp/state/sync';

export interface SyncedFetchProps extends Omit<SyncedOptions, 'get' | 'set'> {
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
    const ret: SyncedOptions = {
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
