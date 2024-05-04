import { Selector, SyncTransform, Synced, SyncedOptions, SyncedSetParams, computeSelector } from '@legendapp/state';
import { synced } from '@legendapp/state/sync';

export interface SyncedFetchProps<TRemote, TLocal> extends Omit<SyncedOptions, 'get' | 'set' | 'transform'> {
    get: Selector<string>;
    set?: Selector<string>;
    getInit?: RequestInit;
    setInit?: RequestInit;
    transform?: SyncTransform<TLocal, TRemote>;
    valueType?: 'arrayBuffer' | 'blob' | 'formData' | 'json' | 'text';
    onSavedValueType?: 'arrayBuffer' | 'blob' | 'formData' | 'json' | 'text';
    onSaved?(saved: TLocal, input: TRemote): Partial<TLocal> | void;
}

export function syncedFetch<TRemote, TLocal = TRemote>(props: SyncedFetchProps<TRemote, TLocal>): Synced<TLocal> {
    const {
        get: getParam,
        set: setParam,
        getInit,
        setInit,
        valueType,
        onSaved,
        onSavedValueType,
        transform,
        ...rest
    } = props;
    const get = async () => {
        const url = computeSelector(getParam);
        const response = await fetch(url, getInit);

        if (!response.ok) {
            throw new Error(response.statusText);
        }

        let value = await response[valueType || 'json']();

        if (transform?.load) {
            value = transform?.load(value, 'get');
        }

        return value;
    };

    let set: ((params: SyncedSetParams<TRemote>) => void | Promise<any>) | undefined = undefined;
    if (setParam) {
        set = async ({ value, update }: SyncedSetParams<any>) => {
            const url = computeSelector(setParam);

            const response = await fetch(
                url,
                Object.assign({ method: 'POST' }, setInit, { body: JSON.stringify(value) }),
            );
            if (!response.ok) {
                throw new Error(response.statusText);
            }
            if (onSaved) {
                const responseValue = await response[onSavedValueType || valueType || 'json']();
                const transformed = transform?.load ? await transform.load(responseValue, 'set') : responseValue;
                const valueSave = onSaved(transformed, value);
                update({
                    value: valueSave,
                });
            }
        };
    }

    return synced({
        ...rest,
        get,
        set,
    });
}
