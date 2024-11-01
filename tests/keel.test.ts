import { observable } from '@legendapp/state';
import { syncedKeel as syncedKeelOrig } from '../src/sync-plugins/keel';
import { configureSynced } from '../src/sync/configureSynced';
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

const syncedKeel = configureSynced(syncedKeelOrig, {
    client: {
        auth: {
            isAuthenticated: async () => ({ data: true }),
            refresh: async () => ({ data: true }),
        },
        api: { queries: {} },
    },
});

interface BasicValue {
    id: string;
    test: string;
    createdAt?: string | number | null;
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
    createdAt: 1,
    updatedAt: 1,
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

        await promiseTimeout(10);

        expect(obs.get()).toEqual({
            id1: {
                id: 'id1',
                test: 'hi',
                createdAt: 1,
                updatedAt: 1,
            },
        });
        expect(obs.id1.get()).toEqual({ id: 'id1', test: 'hi', createdAt: 1, updatedAt: 1 });
        expect(obs.id1.test.get()).toEqual('hi');
    });
    test('list error retries', async () => {
        let numLists = 0;
        const obs = observable(
            syncedKeel({
                list: () => {
                    numLists++;
                    return { error: { message: 'test' }, data: undefined } as any;
                },
                retry: {
                    delay: 1,
                    times: 2,
                },
            }),
        );

        expect(obs.get()).toEqual(undefined);
        expect(numLists).toEqual(1);

        await promiseTimeout(10);

        expect(obs.get()).toEqual(undefined);
        expect(numLists).toEqual(2);
    });
    test('list error calls onError', async () => {
        let numLists = 0;
        let errorCalled: string | undefined;
        const obs = observable(
            syncedKeel({
                list: async () => {
                    numLists++;
                    return { error: { message: 'test' }, data: undefined } as any;
                },
                onError(error) {
                    errorCalled = error.message;
                },
                retry: {
                    delay: 1,
                    times: 2,
                },
            }),
        );

        expect(obs.get()).toEqual(undefined);
        expect(numLists).toEqual(1);

        await promiseTimeout(10);

        expect(errorCalled).toEqual('test');
        expect(obs.get()).toEqual(undefined);
        expect(numLists).toEqual(2);
    });
    test('list error calls onError and can cancel retry', async () => {
        let numLists = 0;
        let errorCalled: string | undefined;
        const obs = observable(
            syncedKeel({
                list: async () => {
                    numLists++;
                    return { error: { message: 'test' }, data: undefined } as any;
                },
                onError(error, params) {
                    errorCalled = error.message;
                    params.retry.cancelRetry = true;
                },
                retry: {
                    delay: 1,
                    times: 2,
                },
            }),
        );

        expect(obs.get()).toEqual(undefined);
        expect(numLists).toEqual(1);

        await promiseTimeout(10);

        expect(errorCalled).toEqual('test');
        expect(obs.get()).toEqual(undefined);
        expect(numLists).toEqual(1);
    });
    test('get', async () => {
        const obs = observable(
            syncedKeel({
                get: () => fakeKeelGet(ItemBasicValue()),
            }),
        );

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(1);

        expect(obs.get()).toEqual({
            id: 'id1',
            test: 'hi',
            createdAt: 1,
            updatedAt: 1,
        });
    });
    test('setting a child value', async () => {
        let updated = undefined;
        const obs = observable(
            syncedKeel({
                get: () => fakeKeelGet({ ...ItemBasicValue(), other: 2, another: 3 }),
                update: async (update) => {
                    const { values } = update;
                    updated = values;
                    return { data: values! } as any;
                },
            }),
        );

        obs.get();

        await promiseTimeout(1);

        expect(obs.get()).toEqual({
            id: 'id1',
            test: 'hi',
            other: 2,
            another: 3,
            createdAt: 1,
            updatedAt: 1,
        });

        obs.other.set(4);

        await promiseTimeout(10);

        expect(updated).toEqual({ other: 4 });
        expect(obs.get()).toEqual({
            id: 'id1',
            test: 'hi',
            another: 3,
            other: 4,
            createdAt: 1,
            updatedAt: 1,
        });
    });
    test('deleting a property sets it to null', async () => {
        let updated = undefined;
        const obs = observable(
            syncedKeel({
                get: () => fakeKeelGet({ ...ItemBasicValue(), other: 2, another: 3 }),
                update: async (update) => {
                    const { values } = update;
                    updated = values;
                    return { data: values! } as any;
                },
            }),
        );

        obs.get();

        await promiseTimeout(1);

        expect(obs.get()).toEqual({
            id: 'id1',
            test: 'hi',
            other: 2,
            another: 3,
            createdAt: 1,
            updatedAt: 1,
        });

        obs.other.delete();

        await promiseTimeout(10);

        expect(updated).toEqual({ other: null });
        expect(obs.get()).toEqual({
            id: 'id1',
            test: 'hi',
            another: 3,
            createdAt: 1,
            updatedAt: 1,
            other: null,
        });
    });
    test('setting error retries', async () => {
        let numUpdates = 0;
        const obs = observable(
            syncedKeel({
                get: () => fakeKeelGet({ ...ItemBasicValue(), other: 2, another: 3 }),
                update: async () => {
                    numUpdates++;
                    return { error: { message: 'test' } } as any;
                },
                retry: {
                    delay: 1,
                    times: 2,
                },
            }),
        );

        obs.get();

        await promiseTimeout(1);

        obs.other.set(4);

        await promiseTimeout(1);
        expect(numUpdates).toEqual(1);

        await promiseTimeout(10);

        expect(numUpdates).toEqual(2);
    });
    test('setting error retries', async () => {
        let numUpdates = 0;
        let numErrors = 0;
        let errorMessage: string | undefined;
        const obs = observable(
            syncedKeel({
                get: () => fakeKeelGet({ ...ItemBasicValue(), other: 2, another: 3 }),
                update: async () => {
                    numUpdates++;
                    return { error: { message: 'test' } } as any;
                },
                retry: {
                    delay: 1,
                    times: 2,
                },
                onError(error) {
                    numErrors++;
                    errorMessage = error.message;
                },
            }),
        );

        obs.get();

        await promiseTimeout(1);

        obs.other.set(4);

        await promiseTimeout(1);
        expect(numUpdates).toEqual(1);
        expect(numErrors).toEqual(1);

        await promiseTimeout(10);

        expect(numUpdates).toEqual(2);
        expect(numErrors).toEqual(2);
        expect(errorMessage).toEqual('test');
    });
});
