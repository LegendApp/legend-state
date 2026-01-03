import { Selector, computeSelector, getNodeValue, isString } from '@legendapp/state';
import { type Synced, type SyncedOptions, type SyncedSetParams, synced } from '@legendapp/state/sync';

export interface SyncedFetchOnSavedParams<TRemote, TLocal = TRemote> {
    saved: TLocal;
    input: TRemote;
    currentValue: TLocal;
    props: SyncedFetchProps<TRemote, TLocal>;
}

export interface SyncedFetchProps<TRemote, TLocal = TRemote>
    extends Omit<SyncedOptions<TRemote, TLocal>, 'get' | 'set'> {
    get: Selector<string>;
    set?: Selector<string>;
    getInit?: RequestInit;
    setInit?: RequestInit;
    valueType?: 'arrayBuffer' | 'blob' | 'formData' | 'json' | 'text';
    onSavedValueType?: 'arrayBuffer' | 'blob' | 'formData' | 'json' | 'text';
    onSaved?: (params: SyncedFetchOnSavedParams<TRemote, TLocal>) => Partial<TLocal> | void;
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
        if (url && isString(url)) {
            const response = await fetch(url, getInit);

            if (!response.ok) {
                throw new Error(response.statusText);
            }

            let value = await response[valueType || 'json']();

            if (transform?.load) {
                value = transform?.load(value, 'get');
            }

            return value;
        } else {
            return null;
        }
    };

    let set: ((params: SyncedSetParams<TRemote>) => void | Promise<any>) | undefined = undefined;
    if (setParam) {
        set = async ({ value, node, update }: SyncedSetParams<any>) => {
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
                const currentValue = getNodeValue(node);
                const valueSave = onSaved({ input: value, saved: transformed, currentValue, props });
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
