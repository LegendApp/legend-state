import { ObservablePersistRemoteSimple, isString, type ObservablePersistRemoteSaveParams } from '@legendapp/state';

export function persistFetch(
    get: string | RequestInfo,
    set?: string | RequestInfo,
): ObservablePersistRemoteSimple<any> {
    const ret: ObservablePersistRemoteSimple<any> = {
        get() {
            return fetch(get);
        },
    };

    if (set) {
        ret.set = async ({ value }: ObservablePersistRemoteSaveParams<any>) => {
            const requestInfo = isString(set) ? ({ url: set } as RequestInfo) : set;
            await fetch(Object.assign({ method: 'POST' }, requestInfo, { body: JSON.stringify(value) }));
            // Return undefined to indicate no changes
        };
    }

    return ret;
}
