import { observable } from '@legendapp/state';
import { configureObservableSync } from '@legendapp/state/sync';
import { syncedKeel } from '../src/sync-plugins/keel';
import { promiseTimeout } from './testglobals';

type APIError = { type: string; message: string; requestId?: string };

type APIResult<T> = Result<T, APIError>;

type Data<T> = {
    data: T;
    error?: never;
};

type Err<U> = {
    data?: never;
    error: U;
};

type Result<T, U> = NonNullable<Data<T> | Err<U>>;

interface BasicValue {
    id: string;
    test: string;
    updatedAt?: string | number | null;
    parent?: {
        child: {
            baby: string;
        };
    };
}

const ItemBasicValue: () => BasicValue = () => ({
    id: 'id1',
    test: 'hi',
});

beforeAll(() => {
    configureObservableSync({
        debounceSet: null,
        persist: null,
    } as any);
});

async function fakeKeelList<T>(results: T[]): Promise<APIResult<{ results: T[]; pageInfo: any }>> {
    await promiseTimeout(0);
    return {
        data: { results: results, pageInfo: undefined },
        error: undefined,
    };
}
async function fakeKeelGet<T>(data: T): Promise<APIResult<T>> {
    await promiseTimeout(0);
    return {
        data,
        error: undefined,
    };
}

describe('keel', () => {
    test('list', async () => {
        const obs = observable(
            syncedKeel({
                list: () => fakeKeelList([ItemBasicValue()]),
            }),
        );

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(0);

        expect(obs.get()).toEqual({
            id1: {
                id: 'id1',
                test: 'hi',
            },
        });
        expect(obs.id1.get()).toEqual({ id: 'id1', test: 'hi' });
        expect(obs.id1.test.get()).toEqual('hi');
    });
    test('get', async () => {
        const obs = observable(
            syncedKeel({
                get: () => fakeKeelGet(ItemBasicValue()),
            }),
        );

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(0);

        expect(obs.get()).toEqual({
            id: 'id1',
            test: 'hi',
        });
    });
});
