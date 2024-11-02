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
    test('setting error retries with onError', async () => {
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
    test('setting error retries with onError', async () => {
        let shouldError = true;
        const errors: Set<BasicValue> = new Set();
        const creates: Set<BasicValue> = new Set();
        let didUpdate = false;
        const obs$ = observable(
            syncedKeel({
                list: async () => fakeKeelList([ItemBasicValue()]),
                create: async (value) => {
                    if (shouldError) {
                        return { error: { message: 'test' } };
                    } else {
                        creates.add(value as any);
                        return {
                            data: value,
                        } as any;
                    }
                },
                update() {
                    didUpdate = true;
                    return undefined as any;
                },
                retry: {
                    infinite: true,
                    delay: 1,
                },
                onError(error, params) {
                    errors.add(params.input);
                },
            }),
        );

        obs$.get();

        await promiseTimeout(1);

        const newItem: BasicValue = { id: 'id2', test: 'hi2' };
        const newItem2: BasicValue = { id: 'id3', test: 'hi3' };

        obs$[newItem.id].set(newItem);
        obs$[newItem2.id].set(newItem2);

        expect(didUpdate).toEqual(false);

        await promiseTimeout(1);

        expect(didUpdate).toEqual(false);

        expect(Array.from(errors)).toEqual([newItem2, newItem]);

        errors.clear();
        shouldError = false;

        await promiseTimeout(5);

        expect(Array.from(errors)).toEqual([]);
        expect(Array.from(creates)).toEqual([newItem2, newItem]);
    });
    test('setting error retries multiple creates', async () => {
        let shouldError = true;
        const errors: Set<BasicValue> = new Set();
        const creates: Set<BasicValue> = new Set();
        let didUpdate = false;
        const obs$ = observable(
            syncedKeel({
                list: async () => fakeKeelList([ItemBasicValue()]),
                create: async (value) => {
                    if (shouldError) {
                        return { error: { message: 'test' } };
                    } else {
                        creates.add(value as any);
                        return {
                            data: value,
                        } as any;
                    }
                },
                update() {
                    didUpdate = true;
                    return undefined as any;
                },
                retry: {
                    infinite: true,
                    delay: 1,
                },
                onError(error, params) {
                    errors.add(params.input);
                },
            }),
        );

        obs$.get();

        await promiseTimeout(1);

        const newItem: BasicValue = { id: 'id2', test: 'hi2' };
        const newItem2: BasicValue = { id: 'id3', test: 'hi3' };

        obs$[newItem.id].set(newItem);

        await promiseTimeout(1);

        obs$[newItem2.id].set(newItem2);

        expect(didUpdate).toEqual(false);

        await promiseTimeout(1);

        expect(didUpdate).toEqual(false);

        expect(Array.from(errors)).toEqual([newItem, newItem2]);

        errors.clear();
        shouldError = false;

        await promiseTimeout(5);

        expect(Array.from(errors)).toEqual([]);
        expect(Array.from(creates).sort((a, b) => a.id.localeCompare(b.id))).toEqual([newItem, newItem2]);
    });
    test('setting error retries updates on multiple fields', async () => {
        let shouldError = true;
        const errors: Set<BasicValue> = new Set();
        const updates: Set<BasicValue> = new Set();
        const obs$ = observable(
            syncedKeel({
                list: async () => fakeKeelList([{ ...ItemBasicValue(), other: 2, another: 3 }]),
                update(value) {
                    if (shouldError) {
                        return { error: { message: 'test' } };
                    } else {
                        updates.add(value as any);
                        return {
                            data: value,
                        } as any;
                    }
                },
                retry: {
                    infinite: true,
                    delay: 1,
                },
                onError(error, params) {
                    errors.add(params.input);
                },
            }),
        );

        obs$.get();

        const item$ = obs$.id1;

        await promiseTimeout(1);

        item$.other.set(4);

        await promiseTimeout(1);

        item$.another.set(5);

        await promiseTimeout(1);

        expect(Array.from(errors)).toEqual([
            {
                id: 'id1',
                other: 4,
                another: 5,
            },
        ]);

        errors.clear();
        shouldError = false;

        await promiseTimeout(5);

        expect(Array.from(errors)).toEqual([]);
        expect(Array.from(updates)).toEqual([
            {
                values: {
                    other: 4,
                    another: 5,
                },
                where: {
                    id: 'id1',
                },
            },
        ]);
    });
});
