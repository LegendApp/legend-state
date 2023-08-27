import { ObservablePersistRemoteFunctions, isString, type ObservablePersistRemoteSetParams } from '@legendapp/state';

interface PersistFetchProps {
    get: string | RequestInfo;
    set?: string | RequestInfo;
    getInit?: RequestInit;
    setInit?: RequestInit;
    valueType?: 'arrayBuffer' | 'blob' | 'formData' | 'json' | 'text';
}

export function persistFetch({
    get,
    set,
    getInit,
    setInit,
    valueType,
}: PersistFetchProps): ObservablePersistRemoteFunctions {
    const ret: ObservablePersistRemoteFunctions = {
        get() {
            return fetch(get, getInit).then((response) => response[valueType || 'json']());
        },
    };

    if (set) {
        ret.set = async ({ value }: ObservablePersistRemoteSetParams<any>) => {
            const requestInfo = isString(set) ? ({ url: set } as RequestInfo) : set;
            await fetch(Object.assign({ method: 'POST' }, requestInfo, { body: JSON.stringify(value) }), setInit);
            // Return undefined to indicate no changes
        };
    }

    return ret;
}
