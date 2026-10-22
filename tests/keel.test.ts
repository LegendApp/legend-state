import { observable, syncState, when } from '@legendapp/state';
import { syncedKeel as syncedKeelOrig } from '../src/sync-plugins/keel';
import { configureSynced } from '../src/sync/configureSynced';
import { getPersistName, localStorage, ObservablePersistLocalStorage, promiseTimeout } from './testglobals';

type APIError = { type: string; message: string; requestId?: string; error?: unknown };

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
        client: {
            rawRequest: async () => ({ data: true }) as any,
        },
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

function expectErrorMessage(error: Error, message: string) {
    expect(error.message).toEqual(message);
}

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
});
describe('error handling', () => {
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
                    delay: 20,
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

        await promiseTimeout(50);

        expect(Array.from(errors)).toEqual([]);
        expect(Array.from(creates).sort((a, b) => a.id.localeCompare(b.id))).toEqual([newItem, newItem2]);
    });
    test('pending create retry waits for create before updating latest edit', async () => {
        let shouldError = true;
        const createCalls: BasicValue[] = [];
        const updateCalls: { where: { id: string }; values: Partial<BasicValue> }[] = [];
        const obs$ = observable(
            syncedKeel({
                list: async () => fakeKeelList([ItemBasicValue()]),
                create: async (value) => {
                    const input = { ...(value as BasicValue) };
                    createCalls.push(input);
                    if (shouldError) {
                        return { error: { message: 'test' } } as any;
                    }
                    return {
                        data: {
                            ...input,
                            createdAt: 2,
                            updatedAt: 2,
                        },
                    } as any;
                },
                update: async (value) => {
                    updateCalls.push(value as { where: { id: string }; values: Partial<BasicValue> });
                    return {
                        data: {
                            id: (value as { where: { id: string } }).where.id,
                            ...(value as { values: Partial<BasicValue> }).values,
                            updatedAt: 3,
                        },
                    } as any;
                },
                retry: {
                    infinite: true,
                    delay: 20,
                },
            }),
        );

        obs$.get();

        await promiseTimeout(1);

        obs$.id2.set({ id: 'id2', test: 'hi2' });

        await promiseTimeout(5);

        expect(createCalls).toEqual([{ id: 'id2', test: 'hi2' }]);
        expect(updateCalls).toEqual([]);

        obs$.id2.test.set('hi3');
        shouldError = false;

        await promiseTimeout(100);

        expect(createCalls).toEqual([
            { id: 'id2', test: 'hi2' },
            { id: 'id2', test: 'hi3' },
        ]);
        expect(updateCalls).toEqual([{ where: { id: 'id2' }, values: { test: 'hi3' } }]);
        expect(obs$.id2.get()).toEqual({
            id: 'id2',
            test: 'hi3',
            createdAt: 2,
            updatedAt: 2,
        });
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
    test('Error handling in crud sets pending', async () => {
        const persistName = getPersistName();
        let errorAtOnError: Error | undefined = undefined;
        let numErrors = 0;
        const settle = observable(false);
        const obs$ = observable(
            syncedKeel({
                list: async () => fakeKeelList([{ ...ItemBasicValue(), other: 2, another: 3 }]),
                create: async (): Promise<any> => {
                    await when(settle);
                    return { error: { message: 'test' } };
                },
                update: async ({ where }): Promise<any> => {
                    await when(settle);
                    return { data: { ...obs$[where.id].peek(), updatedAt: 2 } } as any;
                },
                onError: (error) => {
                    numErrors++;
                    errorAtOnError = error;
                },
                changesSince: 'last-sync',
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                    retrySync: true,
                },
            }),
        );

        expect(obs$.get()).toEqual(undefined);

        await when(syncState(obs$).isLoaded);

        expect(obs$.get()).toEqual({
            id1: { id: 'id1', test: 'hi', other: 2, another: 3, createdAt: 1, updatedAt: 1 },
        });

        obs$.id1.test.set('hello');
        obs$.id2.set({ id: 'id2', test: 'hi', other: 3, another: 4 });

        await promiseTimeout(1);

        expect(localStorage.getItem(persistName + '__m')!).toEqual(
            JSON.stringify({
                lastSync: 1,
                pending: {
                    id2: { p: null, t: ['object'], h: [], v: { id: 'id2', test: 'hi', other: 3, another: 4 }, c: true },
                    'id1/test': { p: 'hi', t: ['object', 'object'], h: [], v: 'hello', c: true },
                },
            }),
        );

        settle.set(true);
        await when(() => !syncState(obs$).isSetting.get());

        expectErrorMessage(errorAtOnError!, 'test');
        expect(numErrors).toEqual(1);

        expect(obs$.get()).toEqual({
            id1: {
                id: 'id1',
                test: 'hello',
                other: 2,
                another: 3,
                createdAt: 1,
                updatedAt: 2,
            },
            id2: { id: 'id2', test: 'hi', other: 3, another: 4 },
        });
        await promiseTimeout(1);

        expect(localStorage.getItem(persistName + '__m')!).toEqual(
            JSON.stringify({
                lastSync: 1,
                pending: {
                    id2: { p: null, t: ['object'], h: [], v: { id: 'id2', test: 'hi', other: 3, another: 4 }, c: true },
                },
            }),
        );
    });
    test('Error handling in crud sets pending 2', async () => {
        const persistName = getPersistName();
        let errorAtOnError: Error | undefined = undefined;
        let numErrors = 0;
        const settle = observable(false);
        const obs$ = observable(
            syncedKeel({
                list: async () => fakeKeelList([{ ...ItemBasicValue(), other: 2, another: 3 }]),
                create: async (input): Promise<any> => {
                    await when(settle);
                    return { data: { ...input, updatedAt: 2 } } as any;
                },
                update: async (): Promise<any> => {
                    await when(settle);
                    return { error: { message: 'test' } };
                },
                onError: (error) => {
                    numErrors++;
                    errorAtOnError = error;
                },
                changesSince: 'last-sync',
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                    retrySync: true,
                },
            }),
        );

        expect(obs$.get()).toEqual(undefined);

        await when(syncState(obs$).isLoaded);

        expect(obs$.get()).toEqual({
            id1: { id: 'id1', test: 'hi', other: 2, another: 3, createdAt: 1, updatedAt: 1 },
        });

        obs$.id1.test.set('hello');
        obs$.id2.set({ id: 'id2', test: 'hi', other: 3, another: 4 });

        await promiseTimeout(1);

        expect(localStorage.getItem(persistName + '__m')!).toEqual(
            JSON.stringify({
                lastSync: 1,
                pending: {
                    id2: { p: null, t: ['object'], h: [], v: { id: 'id2', test: 'hi', other: 3, another: 4 }, c: true },
                    'id1/test': { p: 'hi', t: ['object', 'object'], h: [], v: 'hello', c: true },
                },
            }),
        );

        settle.set(true);
        await when(() => !syncState(obs$).isSetting.get());

        expectErrorMessage(errorAtOnError!, 'test');
        expect(numErrors).toEqual(1);

        expect(obs$.get()).toEqual({
            id1: {
                id: 'id1',
                test: 'hello',
                other: 2,
                another: 3,
                createdAt: 1,
                updatedAt: 1,
            },
            id2: { id: 'id2', test: 'hi', other: 3, another: 4, updatedAt: 2 },
        });
        await promiseTimeout(1);

        expect(localStorage.getItem(persistName + '__m')!).toEqual(
            JSON.stringify({
                lastSync: 1,
                pending: {
                    'id1/test': { p: 'hi', t: ['object', 'object'], h: [], v: 'hello', c: true },
                },
            }),
        );
    });
    test('onError reverts only one change if multiple fails', async () => {
        let errorAtOnError: Error | undefined = undefined;
        let numErrors = 0;
        const obs$ = observable(
            syncedKeel({
                list: async () => fakeKeelList([{ ...ItemBasicValue(), other: 2, another: 3 }]),
                create: async (): Promise<any> => {
                    return { error: { message: 'test' } };
                },
                update: async ({ where }): Promise<any> => {
                    return { data: { ...obs$[where.id].peek(), updatedAt: 2 } } as any;
                },
                onError: (error, params) => {
                    numErrors++;
                    errorAtOnError = error;
                    params.revert!();
                },
            }),
        );

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        expect(obs$.get()).toEqual({
            id1: { id: 'id1', test: 'hi', other: 2, another: 3, createdAt: 1, updatedAt: 1 },
        });

        obs$.id1.test.set('hello');
        obs$.id2.set({ id: 'id2', test: 'hi', other: 3, another: 4 });

        await promiseTimeout(1);

        expectErrorMessage(errorAtOnError!, 'test');
        expect(numErrors).toEqual(1);

        expect(obs$.get()).toEqual({
            id1: {
                id: 'id1',
                test: 'hello',
                other: 2,
                another: 3,
                createdAt: 1,
                updatedAt: 2,
            },
            id2: undefined,
        });
    });
    test('Adding an item sets pending ', async () => {
        const persistName = getPersistName();
        let errorAtOnError: Error | undefined = undefined;
        let numErrors = 0;
        const obs$ = observable(
            syncedKeel({
                list: async () => fakeKeelList([{ ...ItemBasicValue(), other: 2, another: 3 }]),
                create: async (): Promise<any> => {
                    return { error: { message: 'test' } };
                },
                onError: (error) => {
                    numErrors++;
                    errorAtOnError = error;
                },
                changesSince: 'last-sync',
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                    retrySync: true,
                },
            }),
        );

        expect(obs$.get()).toEqual(undefined);

        await when(syncState(obs$).isLoaded);

        expect(obs$.get()).toEqual({
            id1: { id: 'id1', test: 'hi', other: 2, another: 3, createdAt: 1, updatedAt: 1 },
        });

        obs$.id2.set({ id: 'id2', test: 'hi', other: 3, another: 4 });

        await promiseTimeout(1);

        expectErrorMessage(errorAtOnError!, 'test');
        expect(numErrors).toEqual(1);

        expect(obs$.get()).toEqual({
            id1: {
                id: 'id1',
                test: 'hi',
                other: 2,
                another: 3,
                createdAt: 1,
                updatedAt: 1,
            },
            id2: { id: 'id2', test: 'hi', other: 3, another: 4 },
        });

        expect(localStorage.getItem(persistName + '__m')!).toEqual(
            JSON.stringify({
                lastSync: 1,
                pending: {
                    id2: { p: null, t: ['object'], h: [], v: { id: 'id2', test: 'hi', other: 3, another: 4 }, c: true },
                },
            }),
        );
    });
    test('Updating an item sets pending ', async () => {
        const persistName = getPersistName();
        let errorAtOnError: Error | undefined = undefined;
        let numErrors = 0;
        const settle = observable(false);
        const obs$ = observable(
            syncedKeel({
                list: async () => fakeKeelList([{ ...ItemBasicValue(), other: 2, another: 3 }]),
                create: async (input): Promise<any> => {
                    await when(settle);
                    return { data: { ...input, updatedAt: 2 } } as any;
                },
                update: async (): Promise<any> => {
                    await when(settle);
                    return { error: { message: 'test' } };
                },
                onError: (error) => {
                    numErrors++;
                    errorAtOnError = error;
                },
                changesSince: 'last-sync',
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                    retrySync: true,
                },
            }),
        );

        expect(obs$.get()).toEqual(undefined);

        await when(syncState(obs$).isLoaded);

        expect(obs$.get()).toEqual({
            id1: { id: 'id1', test: 'hi', other: 2, another: 3, createdAt: 1, updatedAt: 1 },
        });

        obs$.id1.test.set('hello');
        obs$.id2.set({ id: 'id2', test: 'hi', other: 3, another: 4 });

        await promiseTimeout(1);

        expect(localStorage.getItem(persistName + '__m')!).toEqual(
            JSON.stringify({
                lastSync: 1,
                pending: {
                    id2: { p: null, t: ['object'], h: [], v: { id: 'id2', test: 'hi', other: 3, another: 4 }, c: true },
                    'id1/test': { p: 'hi', t: ['object', 'object'], h: [], v: 'hello', c: true },
                },
            }),
        );

        settle.set(true);
        await when(() => !syncState(obs$).isSetting.get());

        expectErrorMessage(errorAtOnError!, 'test');
        expect(numErrors).toEqual(1);

        expect(obs$.get()).toEqual({
            id1: {
                id: 'id1',
                test: 'hello',
                other: 2,
                another: 3,
                createdAt: 1,
                updatedAt: 1,
            },
            id2: { id: 'id2', test: 'hi', other: 3, another: 4, updatedAt: 2 },
        });
        await promiseTimeout(10);

        expect(localStorage.getItem(persistName + '__m')!).toEqual(
            JSON.stringify({
                lastSync: 1,
                pending: {
                    'id1/test': { p: 'hi', t: ['object', 'object'], h: [], v: 'hello', c: true },
                },
            }),
        );
    });
});

const existing = { id: 'id1', test: 'existing', createdAt: 1, updatedAt: 1 };
const authored = { id: 'id2', test: 'A', other: 3, another: 4 };
const pendingOf = (o: any) => (syncState(o).getPendingChanges as any)();

for (const delivery of ['get', 'subscribe'])
    for (const storedHistory of ['empty', 'root'])
        test(`persisted new Keel row ${delivery} ${storedHistory}`, async () => {
            const seed = getPersistName(),
                restart = getPersistName();
            let releaseOriginal: any;
            const held = new Promise<any>((r) => (releaseOriginal = r));
            let originalSignal: any;
            const originalStarted = new Promise<void>((r) => (originalSignal = r));
            const releases: any[] = [];
            const errors: Error[] = [];
            try {
                const first = observable<any>(
                    syncedKeel({
                        requireAuth: false,
                        list: async () => ({ data: { results: [existing], pageInfo: undefined } }),
                        create: async () => {
                            originalSignal();
                            return held;
                        },
                        onError: (error: Error) => {
                            errors.push(error);
                        },
                        changesSince: 'last-sync',
                        persist: { name: seed, plugin: ObservablePersistLocalStorage, retrySync: true },
                    } as any),
                );
                first.get();
                await when(syncState(first).isLoaded);
                (first as any).id2.set({ ...authored });
                await originalStarted;
                await promiseTimeout(1);
                const initial = JSON.parse(localStorage.getItem(seed + '__m')!);
                expect(initial.pending.id2.v).toEqual(authored);
                expect(initial.pending.id2.p).toBeNull();
                const metadata = JSON.parse(JSON.stringify(initial));
                metadata.pending.id2.h = storedHistory === 'empty' ? [] : [[]];
                localStorage.setItem(restart, localStorage.getItem(seed)!);
                localStorage.setItem(restart + '__m', JSON.stringify(metadata));
                let remote: any[] = [
                        existing,
                        { ...authored, test: 'stale-0', server: 's1', createdAt: 2, updatedAt: 2 },
                    ],
                    push: any;
                const requests: any[] = [];
                let listCount = 0;
                const second = observable<any>(
                    syncedKeel({
                        requireAuth: false,
                        list: async () => {
                            listCount++;
                            return { data: { results: remote, pageInfo: undefined } };
                        },
                        subscribe: (p: any) => {
                            push = p.update;
                        },
                        create: async (value: any) => {
                            requests.push({ kind: 'create', value });
                            return new Promise<any>((r) => releases.push(r));
                        },
                        update: async (value: any) => {
                            requests.push({ kind: 'update', value });
                            return new Promise<any>((r) => releases.push(r));
                        },
                        onError: (error: Error) => {
                            errors.push(error);
                        },
                        changesSince: 'last-sync',
                        persist: { name: restart, plugin: ObservablePersistLocalStorage, retrySync: true },
                    } as any),
                );
                second.get();
                await when(syncState(second).isLoaded);
                await promiseTimeout(2);
                expect(requests.length).toBeGreaterThan(0);
                expect(requests[0].value.values?.test ?? requests[0].value.test).toBe('A');
                expect((second as any).id2.test.peek()).toBe('A');
                expect((second as any).id2.server.peek()).toBe('s1');
                expect(pendingOf(second).id2).toBeDefined();
                (second as any).id2.test.set('B');
                await promiseTimeout(1);
                expect((second as any).id2.test.peek()).toBe('B');
                (second as any).id2.test.set('A');
                await promiseTimeout(1);
                remote = [existing, { ...authored, test: 'stale-1', server: 's2', createdAt: 2, updatedAt: 3 }];
                if (delivery === 'subscribe') push({ value: remote });
                else {
                    const n = listCount;
                    (syncState(second).sync as any)();
                    await promiseTimeout(2);
                    expect(listCount).toBeGreaterThan(n);
                }
                await promiseTimeout(2);
                expect((second as any).id2.test.peek()).toBe('A');
                expect((second as any).id2.server.peek()).toBe('s2');
                expect(pendingOf(second).id2.v.test).toBe('A');
                const durable = JSON.parse(localStorage.getItem(restart + '__m')!);
                expect(durable.pending.id2.v.test).toBe('A');
                expect(durable.pending.id2.h.length).toBeGreaterThan(0);

                expect(errors).toEqual([]);
            } finally {
                releaseOriginal({ error: { message: 'held original intentionally failed' } });
                for (const release of releases) release({ error: { message: 'held replay intentionally failed' } });
                await promiseTimeout(2);
            }
        });
