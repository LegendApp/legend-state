import { ObservablePersistLocalStorageBase } from '../src/persist-plugins/local-storage';
import fc from 'fast-check';
import type { PendingChanges } from '../src/sync/syncTypes';
import { batch, observable, ObservableHint, observe, syncState, when } from '@legendapp/state';
import { syncObservable } from '@legendapp/state/sync';
import { syncedCrud, SyncedCrudPropsMany, SyncedCrudPropsSingle } from '@legendapp/state/sync-plugins/crud';
import { expectTypeOf } from 'expect-type';
import { clone, getNode, safeParse, safeStringify, symbolDelete } from '../src/globals';
import {
    BasicValue,
    BasicValue2,
    getPersistName,
    localStorage,
    ObservablePersistLocalStorage,
    promiseTimeout,
} from './testglobals';

const ItemBasicValue: () => BasicValue = () => ({
    id: 'id1',
    test: 'hi',
});
const ItemBasicValue2: () => BasicValue = () => ({
    id: 'id2',
    test: 'hi2',
});

type GetOrListTestParams =
    | SyncedCrudPropsSingle<BasicValue, BasicValue>
    | SyncedCrudPropsMany<BasicValue, BasicValue, 'value'>;

describe('Crud object get', () => {
    const getTests = {
        get: async (params: GetOrListTestParams) => {
            const obs = observable(syncedCrud(params));
            expect(obs.get()).toEqual(undefined);

            await promiseTimeout(1);

            expect(obs.get()).toEqual({
                id: 'id1',
                test: 'hi',
            });
        },
        getWithInitial: async (params: GetOrListTestParams) => {
            const obs = observable(
                syncedCrud({
                    ...params,
                    initial: {
                        id: 'unknown',
                        test: 'unknown',
                    } as BasicValue,
                }),
            );
            expect(obs.get()).toEqual({
                id: 'unknown',
                test: 'unknown',
            });

            await promiseTimeout(1);

            expect(obs.get()).toEqual({
                id: 'id1',
                test: 'hi',
            });
        },
        getWithWaitFor: async (params: GetOrListTestParams) => {
            const obsWait$ = observable(false);
            const obs = observable(syncedCrud({ ...params, waitFor: obsWait$ }));

            expect(obs.get()).toEqual(undefined);

            await promiseTimeout(1);

            expect(obs.get()).toEqual(undefined);

            obsWait$.set(true);

            await promiseTimeout(1);

            expect(obs.get()).toEqual({
                id: 'id1',
                test: 'hi',
            });
        },
        getWithWaitForArray: async (params: GetOrListTestParams) => {
            const obsWait$ = observable(false);
            const obs = observable(
                syncedCrud({
                    ...params,
                    waitFor: () => {
                        return [obsWait$];
                    },
                }),
            );

            expect(obs.get()).toEqual(undefined);

            await promiseTimeout(1);

            expect(obs.get()).toEqual(undefined);

            obsWait$.set(true);

            await promiseTimeout(1);

            expect(obs.get()).toEqual({
                id: 'id1',
                test: 'hi',
            });
        },
        getWithWaitForArray2: async (params: GetOrListTestParams) => {
            const obsWait1$ = observable(false);
            const obsWait2$ = observable(false);
            const obs = observable(
                syncedCrud({
                    ...params,
                    waitFor: () => {
                        return [obsWait1$, obsWait2$];
                    },
                }),
            );

            expect(obs.get()).toEqual(undefined);

            await promiseTimeout(1);

            expect(obs.get()).toEqual(undefined);

            obsWait1$.set(true);

            await promiseTimeout(1);

            expect(obs.get()).toEqual(undefined);

            obsWait2$.set(true);

            await promiseTimeout(1);

            expect(obs.get()).toEqual({
                id: 'id1',
                test: 'hi',
            });
        },
        getWithWaitForArrayEmpty: async (params: GetOrListTestParams) => {
            const obs = observable(syncedCrud({ ...params, waitFor: () => [] }));

            expect(obs.get()).toEqual(undefined);

            await promiseTimeout(1);
            // Should not wait for anything

            expect(obs.get()).toEqual({
                id: 'id1',
                test: 'hi',
            });
        },
        getWithSet: async (params: GetOrListTestParams) => {
            let created = undefined;
            let updated = undefined;
            const obs = observable(
                syncedCrud({
                    ...params,
                    create: async (input) => {
                        created = clone(input);
                        return input;
                    },
                    update: async (input) => {
                        updated = clone(input);
                        return input;
                    },
                }),
            );

            expect(obs.get()).toEqual(undefined);

            await promiseTimeout(1);

            expect(obs.get()).toEqual({
                id: 'id1',
                test: 'hi',
            });

            obs.test.set('hello');

            await promiseTimeout(1);

            expect(created).toEqual(undefined);
            expect(updated).toEqual({
                id: 'id1',
                test: 'hello',
            });
            expect(obs.get()).toEqual({
                id: 'id1',
                test: 'hello',
            });
        },
        getWithSetNoInitial: async (params: GetOrListTestParams) => {
            let created = undefined;
            let updated = undefined;
            const obs = observable(
                syncedCrud({
                    ...params,
                    create: async (input) => {
                        created = clone(input);
                        return input;
                    },
                    update: async (input) => {
                        updated = clone(input);
                        return input;
                    },
                }),
            );

            expect(obs.get()).toEqual(undefined);

            await promiseTimeout(1);

            expect(obs.get()).toEqual(null);

            obs.set({ id: 'id1', test: 'hello' });

            await promiseTimeout(1);

            expect(created).toEqual({
                id: 'id1',
                test: 'hello',
            });
            expect(updated).toEqual(undefined);
            expect(obs.get()).toEqual({
                id: 'id1',
                test: 'hello',
            });
        },
        getWithSetDeepChild: async (params: GetOrListTestParams) => {
            let saved = undefined;
            const obs = observable(
                syncedCrud({
                    ...params,
                    create: async (input) => {
                        saved = clone(input);
                        return input;
                    },
                }),
            );

            expect(obs.get()).toEqual(undefined);

            await promiseTimeout(1);

            expect(obs.get()).toEqual({
                id: 'id1',
                test: 'hi',
            });

            obs.parent.child.baby.set('test');

            await promiseTimeout(1);

            expect(saved).toEqual({
                id: 'id1',
                test: 'hi',
                parent: {
                    child: {
                        baby: 'test',
                    },
                },
            });
            expect(obs.get()).toEqual({
                id: 'id1',
                test: 'hi',
                parent: {
                    child: {
                        baby: 'test',
                    },
                },
            });
        },
        getWithDelete: async (params: GetOrListTestParams) => {
            let deleted = undefined;
            const obs = observable(
                syncedCrud({
                    ...params,
                    delete: async (input) => {
                        deleted = input;
                    },
                }),
            );

            expect(obs.get()).toEqual(undefined);

            await promiseTimeout(1);

            expect(obs.get()).toEqual({
                id: 'id1',
                test: 'hi',
            });

            obs.delete();

            await promiseTimeout(1);

            expect(deleted).toEqual({
                id: 'id1',
                test: 'hi',
            });
            expect(obs.get()).toEqual(undefined);
        },
    };
    test('crud with no promise runs immediately', () => {
        const obs = observable(syncedCrud({ get: ItemBasicValue }));

        expect(obs.get()).toEqual({
            id: 'id1',
            test: 'hi',
        });
    });
    test('get', () =>
        getTests.get({
            get: () => promiseTimeout(0, ItemBasicValue()),
        }));
    test('get with initial', () =>
        getTests.getWithInitial({
            get: () => promiseTimeout(0, ItemBasicValue()),
        }));
    test('get with waitFor', () =>
        getTests.getWithWaitFor({
            get: () => promiseTimeout(0, ItemBasicValue()),
        }));
    test('get with waitForArray', () =>
        getTests.getWithWaitForArray({
            get: () => promiseTimeout(0, ItemBasicValue()),
        }));
    test('get with waitForArray2', () =>
        getTests.getWithWaitForArray2({
            get: () => promiseTimeout(0, ItemBasicValue()),
        }));
    test('get with waitForArrayEmpty', () =>
        getTests.getWithWaitForArrayEmpty({
            get: () => promiseTimeout(0, ItemBasicValue()),
        }));
    test('get with set', () =>
        getTests.getWithSet({
            get: () => promiseTimeout(0, ItemBasicValue()),
        }));
    test('get with set no initial', () =>
        getTests.getWithSetNoInitial({
            get: () => promiseTimeout(0, null),
        }));
    test('get with set deep child', () =>
        getTests.getWithSetDeepChild({
            get: () => promiseTimeout(0, ItemBasicValue()),
        }));
    test('get with delete', () =>
        getTests.getWithDelete({
            get: () => promiseTimeout(0, ItemBasicValue()),
        }));
    test('list first', () =>
        getTests.get({
            list: () => promiseTimeout(0, [ItemBasicValue()]),
            as: 'value',
        }));
    test('list first with initial', () =>
        getTests.getWithInitial({
            list: () => promiseTimeout(0, [ItemBasicValue()]),
            as: 'value',
        }));
    test('list first with waitFor', () =>
        getTests.getWithWaitFor({
            list: () => promiseTimeout(0, [ItemBasicValue()]),
            as: 'value',
        }));
    test('list first with waitForArray', () =>
        getTests.getWithWaitForArray({
            list: () => promiseTimeout(0, [ItemBasicValue()]),
            as: 'value',
        }));
    test('list first with waitForArray2', () =>
        getTests.getWithWaitForArray2({
            list: () => promiseTimeout(0, [ItemBasicValue()]),
            as: 'value',
        }));
    test('list first with waitForArrayEmpty', () =>
        getTests.getWithWaitForArrayEmpty({
            list: () => promiseTimeout(0, [ItemBasicValue()]),
            as: 'value',
        }));
    test('list first with set', () =>
        getTests.getWithSet({
            list: () => promiseTimeout(0, [ItemBasicValue()]),
            as: 'value',
        }));
    test('list first with set deep child', () =>
        getTests.getWithSetDeepChild({
            list: () => promiseTimeout(0, [ItemBasicValue()]),
            as: 'value',
        }));
    test('list first with delete', () =>
        getTests.getWithDelete({
            list: () => promiseTimeout(0, [ItemBasicValue()]),
            as: 'value',
        }));
});
describe('Crud as value list', () => {
    test('does not overwrite if returns []', async () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, JSON.stringify({ id: 'id', test: 'hi', updatedAt: 1 }));
        localStorage.setItem(
            persistName + '__m',
            JSON.stringify({ lastSync: 1000, pending: { test: { p: 'h', t: ['object'], v: 'hi' } } }),
        );
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, []),
                as: 'value',
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                },
            }),
        );

        expect(obs$.get()).toEqual({ id: 'id', test: 'hi', updatedAt: 1 });

        await promiseTimeout(1);

        expect(obs$.get()).toEqual({ id: 'id', test: 'hi', updatedAt: 1 });
        expect(syncState(obs$).isLoaded.get()).toEqual(true);
    });
    test('Set to null if returns []', async () => {
        const persistName = getPersistName();
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, []),
                as: 'value',
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                },
            }),
        );

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        expect(obs$.get()).toEqual(null);
        expect(syncState(obs$).isLoaded.get()).toEqual(true);
    });
    test('sets if returns new value', async () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, JSON.stringify({ id: 'id', test: 'hi', updatedAt: 1 }));
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [{ id: 'id2', test: 'hi2', updatedAt: 2 }]),
                as: 'value',
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                },
            }),
        );

        expect(obs$.get()).toEqual({ id: 'id', test: 'hi', updatedAt: 1 });

        await promiseTimeout(1);

        expect(obs$.get()).toEqual({ id: 'id2', test: 'hi2', updatedAt: 2 });
    });
});

describe('Crud as Object list', () => {
    test('defaults to object', async () => {
        const obs = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
            }),
        );

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(1);

        expect(obs.get()).toEqual({
            id1: {
                id: 'id1',
                test: 'hi',
            },
        });
        expect(obs.id1.get()).toEqual({ id: 'id1', test: 'hi' });
        expect(obs.id1.test.get()).toEqual('hi');
    });
    test('as Object list', async () => {
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'object',
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<Record<string, BasicValue>>();

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        expect(obs$.get()).toEqual({
            id1: {
                id: 'id1',
                test: 'hi',
            },
        });
        expect(obs$.id1.get()).toEqual({ id: 'id1', test: 'hi' });
        expect(obs$.id1.test.get()).toEqual('hi');
    });
    test('nullish record keys do not create phantom entries on synced object reads', async () => {
        const obs$ = observable<Record<string, BasicValue>>(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'object',
            }),
        );

        expect(obs$[undefined as any].get()).toEqual(undefined);
        expect(obs$[null as any].peek()).toEqual(undefined);
        expect(obs$.peek()).toEqual(undefined);

        await promiseTimeout(1);

        expect(obs$.get()).toEqual({ id1: { id: 'id1', test: 'hi' } });

        expect(obs$[undefined as any].get()).toEqual(undefined);
        expect(obs$[undefined as any].peek()).toEqual(undefined);
        expect(obs$[null as any].get()).toEqual(undefined);
        expect(obs$[null as any].peek()).toEqual(undefined);
        expect(obs$[undefined as any].test.get()).toEqual(undefined);
        expect(obs$[null as any].test.peek()).toEqual(undefined);

        expect(obs$.get()).toEqual({ id1: { id: 'id1', test: 'hi' } });
        expect(Object.keys(obs$)).toEqual(['id1']);
    });
    test('as Object list skips items with nullish ids', async () => {
        const obs$ = observable<Record<string, BasicValue>>(
            syncedCrud({
                list: () =>
                    promiseTimeout(0, [
                        { test: 'missing id' } as BasicValue,
                        { id: null as any, test: 'null id' },
                        ItemBasicValue(),
                    ]),
                as: 'object',
            }),
        );

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        expect(obs$.get()).toEqual({ id1: { id: 'id1', test: 'hi' } });
        expect(Object.keys(obs$)).toEqual(['id1']);
    });
    test('as Object set', async () => {
        let created = undefined;
        let updated = undefined;
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'object',
                create: async (input: BasicValue) => {
                    created = clone(input);
                    return input;
                },
                update: async (input) => {
                    updated = clone(input);
                    return input;
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<Record<string, BasicValue>>();

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        obs$.id1.test.set('hello');

        await promiseTimeout(1);

        expect(created).toEqual(undefined);
        expect(updated).toEqual({
            id: 'id1',
            test: 'hello',
        });
        expect(obs$.get()).toEqual({
            id1: {
                id: 'id1',
                test: 'hello',
            },
        });
    });
    test('as Object set at root updates', async () => {
        let created = undefined;
        let updated = undefined;
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'object',
                create: async (input: BasicValue) => {
                    created = clone(input);
                    return input;
                },
                update: async (input) => {
                    updated = clone(input);
                    return input;
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<Record<string, BasicValue>>();

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        obs$.set({ id1: { id: 'id1', test: 'hello' } });

        await promiseTimeout(1);

        expect(created).toEqual(undefined);
        expect(updated).toEqual({
            id: 'id1',
            test: 'hello',
        });
        expect(obs$.get()).toEqual({
            id1: {
                id: 'id1',
                test: 'hello',
            },
        });
    });
    test('as Object set at root adds', async () => {
        let created = undefined;
        let updated = undefined;
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'object',
                create: async (input: BasicValue) => {
                    created = clone(input);
                    return input;
                },
                update: async (input) => {
                    updated = clone(input);
                    return input;
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<Record<string, BasicValue>>();

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        obs$.set({ id1: { id: 'id1', test: 'hi' }, id2: { id: 'id2', test: 'hi2' } });

        await promiseTimeout(1);

        expect(created).toEqual({ id: 'id2', test: 'hi2' });
        expect(updated).toEqual(undefined);
        expect(obs$.get()).toEqual({
            id1: {
                id: 'id1',
                test: 'hi',
            },
            id2: { id: 'id2', test: 'hi2' },
        });
    });
    test('as Object set deep child', async () => {
        let created = undefined;
        let updated = undefined;
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'object',
                create: async (input: BasicValue) => {
                    created = clone(input);
                    return input;
                },
                update: async (input) => {
                    updated = clone(input);
                    return input;
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<Record<string, BasicValue>>();

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        obs$.id1.parent.child.baby.set('test');

        await promiseTimeout(1);

        expect(created).toEqual(undefined);
        expect(updated).toEqual({
            id: 'id1',
            test: 'hi',
            parent: {
                child: {
                    baby: 'test',
                },
            },
        });
        expect(obs$.get()).toEqual({
            id1: {
                id: 'id1',
                test: 'hi',
                parent: {
                    child: {
                        baby: 'test',
                    },
                },
            },
        });
    });
    test('as Object delete', async () => {
        let deleted = undefined;
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'object',
                delete: async (input) => {
                    deleted = input;
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<Record<string, BasicValue>>();

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        obs$.id1.delete();

        await promiseTimeout(1);

        expect(deleted).toEqual({
            id: 'id1',
            test: 'hi',
        });
        expect(obs$.get()).toEqual({});
    });
    test('as Object delete by set new object', async () => {
        let deleted = undefined;
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'object',
                delete: async (input) => {
                    deleted = input;
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<Record<string, BasicValue>>();

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        obs$.set({});

        await promiseTimeout(1);

        expect(deleted).toEqual({
            id: 'id1',
            test: 'hi',
        });
        expect(obs$.get()).toEqual({});
    });
    test('as Object update', async () => {
        let deleted = undefined;
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'object',
                delete: async (input) => {
                    deleted = input;
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<Record<string, BasicValue>>();

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        obs$.id1.delete();

        await promiseTimeout(1);

        expect(deleted).toEqual({
            id: 'id1',
            test: 'hi',
        });
        expect(obs$.get()).toEqual({});
    });
    test('as Object with paging', async () => {
        const page$ = observable(1);
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, page$.get() === 1 ? [ItemBasicValue()] : [{ id: 'id2', test: 'hi2' }]),
                as: 'object',
                mode: 'assign',
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<Record<string, BasicValue>>();

        // Observe to make it refresh
        const dispose = observe(() => obs$.get());

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        expect(obs$.get()).toEqual({
            id1: {
                id: 'id1',
                test: 'hi',
            },
        });

        page$.set(2);

        await promiseTimeout(1);

        expect(obs$.get()).toEqual({
            id1: {
                id: 'id1',
                test: 'hi',
            },
            id2: {
                id: 'id2',
                test: 'hi2',
            },
        });

        dispose();
    });
    test('as Object set children to null', async () => {
        let deleted = undefined;
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'object',
                delete: async (input) => {
                    deleted = input;
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<Record<string, BasicValue>>();

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        obs$.set({ id1: null as any });

        await promiseTimeout(1);

        expect(deleted).toEqual({
            id: 'id1',
            test: 'hi',
        });
        expect(obs$.get()).toEqual({ id1: null });
    });
});
describe('Crud as Map', () => {
    test('as Map list', async () => {
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'Map',
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<Map<string, BasicValue>>();

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        expect(obs$.get()).toEqual(
            new Map([
                [
                    'id1',
                    {
                        id: 'id1',
                        test: 'hi',
                    },
                ],
            ]),
        );
        expect(obs$.get('id1').get()).toEqual({ id: 'id1', test: 'hi' });
        expect(obs$.get('id1').test.get()).toEqual('hi');
    });
    test('as Map set', async () => {
        let created = undefined;
        let updated = undefined;
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'Map',
                create: async (input: BasicValue) => {
                    created = clone(input);
                    return input;
                },
                update: async (input) => {
                    updated = clone(input);
                    return input;
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<Map<string, BasicValue>>();

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        obs$.get('id1').test.set('hello');

        await promiseTimeout(1);

        expect(created).toEqual(undefined);
        expect(updated).toEqual({
            id: 'id1',
            test: 'hello',
        });
        expect(obs$.get()).toEqual(
            new Map([
                [
                    'id1',
                    {
                        id: 'id1',
                        test: 'hello',
                    },
                ],
            ]),
        );
    });
    test('as Map set at root', async () => {
        let created = undefined;
        let updated = undefined;
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'Map',
                create: async (input: BasicValue) => {
                    created = clone(input);
                    return input;
                },
                update: async (input) => {
                    updated = clone(input);
                    return input;
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<Map<string, BasicValue>>();

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        obs$.set(new Map([['id1', { id: 'id1', test: 'hello' }]]));

        await promiseTimeout(1);

        expect(created).toEqual(undefined);
        expect(updated).toEqual({
            id: 'id1',
            test: 'hello',
        });
        expect(obs$.get()).toEqual(
            new Map([
                [
                    'id1',
                    {
                        id: 'id1',
                        test: 'hello',
                    },
                ],
            ]),
        );
    });
    test('as Map set deep child', async () => {
        let created = undefined;
        let updated = undefined;
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'Map',
                create: async (input: BasicValue) => {
                    created = clone(input);
                    return input;
                },
                update: async (input) => {
                    updated = clone(input);
                    return input;
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<Map<string, BasicValue>>();

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        obs$.get('id1').parent.child.baby.set('test');

        await promiseTimeout(1);

        expect(created).toEqual(undefined);
        expect(updated).toEqual({
            id: 'id1',
            test: 'hi',
            parent: {
                child: {
                    baby: 'test',
                },
            },
        });
        expect(obs$.get()).toEqual(
            new Map([
                [
                    'id1',
                    {
                        id: 'id1',
                        test: 'hi',
                        parent: {
                            child: {
                                baby: 'test',
                            },
                        },
                    },
                ],
            ]),
        );
    });
    test('as Map delete', async () => {
        let deleted = undefined;
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'Map',
                delete: async (input) => {
                    deleted = input;
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<Map<string, BasicValue>>();

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        obs$.delete('id1');

        await promiseTimeout(1);

        expect(deleted).toEqual({
            id: 'id1',
            test: 'hi',
        });
        expect(obs$.get()).toEqual(new Map());
    });
    test('as Map clear deletes remote rows', async () => {
        let deleted = undefined;
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'Map',
                delete: async (input) => {
                    deleted = input;
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<Map<string, BasicValue>>();

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        obs$.clear();

        await promiseTimeout(1);

        expect(deleted).toEqual(ItemBasicValue());
        expect(syncState(obs$).error.peek()).toBeUndefined();
        expect(obs$.get()).toEqual(new Map());
    });
});
describe('Crud as Array', () => {
    test('as Array list', async () => {
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'array',
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<BasicValue[]>();

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        expect(obs$.get()).toEqual([
            {
                id: 'id1',
                test: 'hi',
            },
        ]);
        expect(obs$[0].get()).toEqual({ id: 'id1', test: 'hi' });
        expect(obs$[0].test.get()).toEqual('hi');
    });
    test('as Array set', async () => {
        let created = undefined;
        let updated = undefined;
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'array',
                create: async (input: BasicValue) => {
                    created = clone(input);
                    return input;
                },
                update: async (input) => {
                    updated = clone(input);
                    return input;
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<BasicValue[]>();

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        obs$[0].test.set('hello');

        await promiseTimeout(1);

        expect(created).toEqual(undefined);
        expect(updated).toEqual({
            id: 'id1',
            test: 'hello',
        });
        expect(obs$.get()[0]).toEqual({
            id: 'id1',
            test: 'hello',
        });
    });
    test('as Array set at root updates', async () => {
        let created = undefined;
        let updated = undefined;
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'array',
                create: async (input: BasicValue) => {
                    created = clone(input);
                    return input;
                },
                update: async (input) => {
                    updated = clone(input);
                    return input;
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<BasicValue[]>();

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        obs$.set([{ id: 'id1', test: 'hello' }]);

        await promiseTimeout(1);

        expect(created).toEqual(undefined);
        expect(updated).toEqual({
            id: 'id1',
            test: 'hello',
        });
        expect(obs$.get()[0]).toEqual({
            id: 'id1',
            test: 'hello',
        });
    });
    test('as Array set at root adds', async () => {
        let created = undefined;
        let updated = undefined;
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'array',
                create: async (input: BasicValue) => {
                    created = clone(input);
                    return input;
                },
                update: async (input) => {
                    updated = clone(input);
                    return input;
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<BasicValue[]>();

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        obs$.set([
            { id: 'id1', test: 'hi' },
            { id: 'id2', test: 'hi2' },
        ]);

        await promiseTimeout(1);

        expect(created).toEqual({ id: 'id2', test: 'hi2' });
        expect(updated).toEqual(undefined);
        expect(obs$.get()[0]).toEqual({
            id: 'id1',
            test: 'hi',
        });
        expect(obs$.get()[1]).toEqual({ id: 'id2', test: 'hi2' });
    });
    test('as Array set at root with both modify and create adds', async () => {
        let created = undefined;
        let updated = undefined;
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'array',
                create: async (input: BasicValue) => {
                    created = clone(input);
                    return input;
                },
                update: async (input) => {
                    updated = clone(input);
                    return input;
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<BasicValue[]>();

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        obs$.set([
            { id: 'id1', test: 'hello' },
            { id: 'id2', test: 'hi2' },
        ]);

        await promiseTimeout(1);

        expect(created).toEqual({ id: 'id2', test: 'hi2' });
        expect(updated).toEqual({ id: 'id1', test: 'hello' });
        expect(obs$.get()[0]).toEqual({
            id: 'id1',
            test: 'hello',
        });
        expect(obs$.get()[1]).toEqual({ id: 'id2', test: 'hi2' });
    });
    test('as Array push adds', async () => {
        let created = undefined;
        let updated = undefined;
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'array',
                create: async (input: BasicValue) => {
                    created = clone(input);
                    return input;
                },
                update: async (input) => {
                    updated = clone(input);
                    return input;
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<BasicValue[]>();

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        obs$.push({ id: 'id2', test: 'hi2' });

        await promiseTimeout(1);

        expect(created).toEqual({ id: 'id2', test: 'hi2' });
        expect(updated).toEqual(undefined);
        expect(obs$.get()[0]).toEqual({
            id: 'id1',
            test: 'hi',
        });
        expect(obs$.get()[1]).toEqual({ id: 'id2', test: 'hi2' });
    });
    test('as Array set deep child', async () => {
        let created = undefined;
        let updated = undefined;
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'array',
                create: async (input: BasicValue) => {
                    created = clone(input);
                    return input;
                },
                update: async (input) => {
                    updated = clone(input);
                    return input;
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<BasicValue[]>();

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        obs$[0].parent.child.baby.set('test');

        await promiseTimeout(1);

        expect(created).toEqual(undefined);
        expect(updated).toEqual({
            id: 'id1',
            test: 'hi',
            parent: {
                child: {
                    baby: 'test',
                },
            },
        });
        expect(obs$.get()[0]).toEqual({
            id: 'id1',
            test: 'hi',
            parent: {
                child: {
                    baby: 'test',
                },
            },
        });
    });
    test('as array with paging', async () => {
        const page$ = observable(1);
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, page$.get() === 1 ? [ItemBasicValue()] : [{ id: 'id2', test: 'hi2' }]),
                as: 'array',
                mode: 'append',
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<BasicValue[]>();

        // Observe to make it refresh
        const dispose = observe(() => obs$.get());

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        expect(obs$.get()).toEqual([
            {
                id: 'id1',
                test: 'hi',
            },
        ]);

        page$.set(2);

        await promiseTimeout(1);

        expect(obs$.get()).toEqual([
            {
                id: 'id1',
                test: 'hi',
            },
            {
                id: 'id2',
                test: 'hi2',
            },
        ]);

        dispose();
    });
    test('as array delete', async () => {
        let deleted = undefined;
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'array',
                delete: async (input) => {
                    deleted = input;
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<BasicValue[]>();

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        obs$[0].delete();

        await promiseTimeout(1);

        expect(deleted).toEqual({
            id: 'id1',
            test: 'hi',
        });
        expect(obs$.get()).toEqual([]);
    });
    test('as array delete by set new array', async () => {
        let deleted = undefined;
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'array',
                delete: async (input) => {
                    deleted = input;
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<BasicValue[]>();

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        obs$.set([]);

        await promiseTimeout(1);

        expect(deleted).toEqual({
            id: 'id1',
            test: 'hi',
        });
        expect(obs$.get()).toEqual([]);
    });
});
describe('Crud record transform', () => {
    test('get transformed', async () => {
        const obs = observable(
            syncedCrud({
                get: () => promiseTimeout(0, ItemBasicValue()),
                transform: {
                    load: (value: BasicValue) =>
                        ({
                            id: value.id,
                            test2: value.test,
                        }) as BasicValue2,
                },
            }),
        );

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(1);

        expect(obs.get()).toEqual({
            id: 'id1',
            test2: 'hi',
        });
    });
    test('get/set transformed with no initial', async () => {
        let created = undefined;
        let updated = undefined;
        const obs = observable(
            syncedCrud({
                get: () => promiseTimeout(0, null as unknown as BasicValue),
                as: 'value',
                create: async (input: BasicValue) => {
                    created = clone(input);
                    return input;
                },
                update: async (input) => {
                    updated = clone(input);
                    return input;
                },
                transform: {
                    load: (value: BasicValue) =>
                        ({
                            id: value.id,
                            test2: value.test,
                        }) as BasicValue2,
                    save: (value: BasicValue2) =>
                        ({
                            id: value.id,
                            test: value.test2,
                        }) as BasicValue,
                },
            }),
        );

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(1);

        expect(obs.get()).toEqual(null);

        obs.set({ id: 'id1', test2: 'hello' });

        await promiseTimeout(1);

        expect(updated).toEqual(undefined);
        expect(created).toEqual({
            id: 'id1',
            test: 'hello',
        });
        expect(obs.get()).toEqual({
            id: 'id1',
            test2: 'hello',
        });
    });
    test('get/set transformed', async () => {
        let created = undefined;
        let updated = undefined;
        const obs = observable(
            syncedCrud({
                get: () => promiseTimeout(0, ItemBasicValue()),
                create: async (input: BasicValue) => {
                    created = clone(input);
                    return input;
                },
                update: async (input) => {
                    updated = clone(input);
                    return input;
                },
                transform: {
                    load: (value: BasicValue) =>
                        ({
                            id: value.id,
                            test2: value.test,
                        }) as BasicValue2,
                    save: (value: BasicValue2) =>
                        ({
                            id: value.id,
                            test: value.test2,
                        }) as BasicValue,
                },
            }),
        );

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(1);

        expect(obs.get()).toEqual({
            id: 'id1',
            test2: 'hi',
        });

        obs.test2.set('hello');

        await promiseTimeout(1);

        expect(created).toEqual(undefined);
        expect(updated).toEqual({
            id: 'id1',
            test: 'hello',
        });
        expect(obs.get()).toEqual({
            id: 'id1',
            test2: 'hello',
        });
    });
});
describe('initial', () => {
    const obsGet = observable(
        syncedCrud({
            get: () => ItemBasicValue(),
            // initial: {},
        }),
    );
    const valueGet = obsGet.get();
    expectTypeOf<typeof valueGet>().toEqualTypeOf<BasicValue>();

    const obsInitial = observable(
        syncedCrud({
            get: () => ItemBasicValue(),
            initial: {},
        }),
    );
    const valueInitial = obsInitial.get();
    expectTypeOf<typeof valueInitial>().toEqualTypeOf<BasicValue>();

    const obsInitialList = observable(
        syncedCrud({
            list: () => [ItemBasicValue()],
            initial: [],
            as: 'array',
        }),
    );
    const valueInitialList = obsInitialList.get();
    expectTypeOf<typeof valueInitialList>().toEqualTypeOf<BasicValue[]>();

    const obsInitial2 = observable(
        syncedCrud({
            get: () => ItemBasicValue(),
            initial: undefined,
        }),
    );
    const valueInitial2 = obsInitial2.get();
    expectTypeOf<typeof valueInitial2>().toEqualTypeOf<BasicValue>();
});
describe('fieldUpdatedAt', () => {
    test('fieldUpdatedAt creates if no updatedAt', async () => {
        let created = undefined;
        let updated = undefined;
        const obs = observable(
            syncedCrud({
                initial: { id1: ItemBasicValue() },
                as: 'object',
                fieldUpdatedAt: 'updatedAt',
                create: async (input: BasicValue) => {
                    created = clone(input);
                    return input;
                },
                update: async (input) => {
                    updated = clone(input);
                    return input;
                },
            }),
        );

        await promiseTimeout(1);

        obs.id1.test.set('hello');

        await promiseTimeout(1);

        expect(updated).toEqual(undefined);
        expect(created).toEqual({
            id: 'id1',
            test: 'hello',
        });
    });
    test('fieldUpdatedAt updates with updatedAt', async () => {
        let created = undefined;
        let updated = undefined;
        const obs = observable(
            syncedCrud({
                initial: { id1: { ...ItemBasicValue(), updatedAt: 10 } },
                as: 'object',
                fieldUpdatedAt: 'updatedAt',
                create: async (input: BasicValue) => {
                    created = clone(input);
                    return input;
                },
                update: async (input) => {
                    updated = clone(input);
                    return input;
                },
            }),
        );

        await promiseTimeout(1);

        obs.id1.test.set('hello');

        await promiseTimeout(1);

        expect(created).toEqual(undefined);
        expect(updated).toEqual({
            id: 'id1',
            test: 'hello',
            updatedAt: 10,
        });

        expect(obs.get()).toEqual({
            id1: {
                id: 'id1',
                test: 'hello',
                updatedAt: 10,
            },
        });
    });
    test('fieldUpdatedAt updates with updatedAt', async () => {
        let created = undefined;
        let updated = undefined;
        const obs = observable(
            syncedCrud({
                initial: { id1: { ...ItemBasicValue(), updatedAt: 10 } as BasicValue },
                as: 'object',
                fieldUpdatedAt: 'updatedAt',
                create: async (input: BasicValue) => {
                    created = clone(input);
                    return input;
                },
                update: async (input) => {
                    updated = clone(input);
                    // Check this here because it will be updated in place by onSaved before
                    // the next expects can get to it
                    expect(input).toEqual({
                        id: 'id1',
                        test: 'hello',
                        updatedAt: 10,
                    });
                    return input;
                },
                onSaved: ({ saved }) => {
                    return { ...saved, updatedAt: 100 };
                },
            }),
        );

        await promiseTimeout(1);

        obs.id1.test.set('hello');

        await promiseTimeout(1);

        expect(created).toEqual(undefined);
        expect(updated).toEqual({
            id: 'id1',
            test: 'hello',
            updatedAt: 10,
        });

        expect(obs.get()).toEqual({
            id1: {
                id: 'id1',
                test: 'hello',
                updatedAt: 100,
            },
        });
    });
});
describe('lastSync', () => {
    test('as Object assign if lastSync', async () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, JSON.stringify({ id2: { id: 'id2', test: 'hi2', updatedAt: 1 } }));
        localStorage.setItem(persistName + '__m', JSON.stringify({ lastSync: 1000 }));
        const obs$ = observable<Record<string, BasicValue>>(
            syncedCrud({
                list: () => promiseTimeout(0, [{ ...ItemBasicValue(), updatedAt: 2 }]),
                as: 'object',
                fieldUpdatedAt: 'updatedAt',
                changesSince: 'last-sync',
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<Record<string, BasicValue>>();

        expect(obs$.get()).toEqual({ id2: { id: 'id2', test: 'hi2', updatedAt: 1 } });

        await promiseTimeout(1);

        expect(obs$.get()).toEqual({
            id1: { id: 'id1', test: 'hi', updatedAt: 2 },
            id2: { id: 'id2', test: 'hi2', updatedAt: 1 },
        });
    });
    test('as value set if lastSync', async () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, JSON.stringify({ id: 'id2', test: 'hi2', updatedAt: 1 }));
        localStorage.setItem(persistName + '__m', JSON.stringify({ lastSync: 1000 }));
        const obs$ = observable<BasicValue>(
            syncedCrud({
                list: () => promiseTimeout(0, [{ ...ItemBasicValue(), updatedAt: 2 }]),
                as: 'value',
                fieldUpdatedAt: 'updatedAt',
                changesSince: 'last-sync',
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<BasicValue>();

        expect(obs$.get()).toEqual({ id: 'id2', test: 'hi2', updatedAt: 1 });

        await promiseTimeout(1);

        expect(obs$.get()).toEqual({
            id: 'id1',
            test: 'hi',
            updatedAt: 2,
        });
    });
    test('ignores null rows when computing lastSync', async () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, JSON.stringify({ id2: { id: 'id2', test: 'hi2', updatedAt: 1 } }));
        localStorage.setItem(persistName + '__m', JSON.stringify({ lastSync: 1000 }));

        const obs$ = observable<Record<string, BasicValue>>(
            syncedCrud({
                list: () => promiseTimeout(0, [null as any, { ...ItemBasicValue(), updatedAt: 2 }] as BasicValue[]),
                as: 'object',
                fieldUpdatedAt: 'updatedAt',
                changesSince: 'last-sync',
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                },
            }),
        );

        expect(obs$.get()).toEqual({ id2: { id: 'id2', test: 'hi2', updatedAt: 1 } });

        await promiseTimeout(1);

        expect(obs$.get()).toEqual({
            id1: { id: 'id1', test: 'hi', updatedAt: 2 },
            id2: { id: 'id2', test: 'hi2', updatedAt: 1 },
        });
    });
    test('as first leaves existing if lastSync and returning []', async () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, JSON.stringify({ id: 'id2', test: 'hi2', updatedAt: 1 }));
        localStorage.setItem(persistName + '__m', JSON.stringify({ lastSync: 1000 }));
        const obs$ = observable<BasicValue>(
            syncedCrud({
                list: () => [],
                as: 'value',
                fieldUpdatedAt: 'updatedAt',
                changesSince: 'last-sync',
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<BasicValue>();

        expect(obs$.get()).toEqual({ id: 'id2', test: 'hi2', updatedAt: 1 });

        await promiseTimeout(1);

        expect(obs$.get()).toEqual({ id: 'id2', test: 'hi2', updatedAt: 1 });
    });
    test('as array push if lastSync', async () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, JSON.stringify([{ id: 'id2', test: 'hi2', updatedAt: 1 }]));
        localStorage.setItem(persistName + '__m', JSON.stringify({ lastSync: 1000 }));
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [{ ...ItemBasicValue(), updatedAt: 2 }] as BasicValue[]),
                as: 'array',
                fieldUpdatedAt: 'updatedAt',
                changesSince: 'last-sync',
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<BasicValue[]>();

        expect(obs$.get()).toEqual([{ id: 'id2', test: 'hi2', updatedAt: 1 }]);

        await promiseTimeout(1);

        expect(obs$.get()).toEqual([
            { id: 'id2', test: 'hi2', updatedAt: 1 },
            {
                id: 'id1',
                test: 'hi',
                updatedAt: 2,
            },
        ]);
    });
    test('as array prepend if lastSync and mode = prepend', async () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, JSON.stringify([{ id: 'id2', test: 'hi2', updatedAt: 1 }]));
        localStorage.setItem(persistName + '__m', JSON.stringify({ lastSync: 1000 }));
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [{ ...ItemBasicValue(), updatedAt: 2 }] as BasicValue[]),
                as: 'array',
                fieldUpdatedAt: 'updatedAt',
                changesSince: 'last-sync',
                mode: 'prepend',
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<BasicValue[]>();

        expect(obs$.get()).toEqual([{ id: 'id2', test: 'hi2', updatedAt: 1 }]);

        await promiseTimeout(1);

        expect(obs$.get()).toEqual([
            {
                id: 'id1',
                test: 'hi',
                updatedAt: 2,
            },
            { id: 'id2', test: 'hi2', updatedAt: 1 },
        ]);
    });
    test('as Map assign if lastSync', async () => {
        const persistName = getPersistName();
        localStorage.setItem(
            persistName,
            JSON.stringify({ __LSType: 'Map', value: [['id2', { id: 'id2', test: 'hi2', updatedAt: 1 }]] }),
        );

        localStorage.setItem(persistName + '__m', JSON.stringify({ lastSync: 1000 }));
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [{ ...ItemBasicValue(), updatedAt: 2 }] as BasicValue[]),
                as: 'Map',
                fieldUpdatedAt: 'updatedAt',
                changesSince: 'last-sync',
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<Map<string, BasicValue>>();

        expect(obs$.get()).toEqual(new Map([['id2', { id: 'id2', test: 'hi2', updatedAt: 1 }]]));

        await promiseTimeout(1);

        expect(obs$.get()).toEqual(
            new Map([
                ['id2', { id: 'id2', test: 'hi2', updatedAt: 1 }],
                ['id1', { id: 'id1', test: 'hi', updatedAt: 2 }],
            ]),
        );
    });
    test('does not set lastSync from save', async () => {
        const persistName = getPersistName();
        let numLists = 0;
        let serverState = [{ ...ItemBasicValue(), updatedAt: 1 }];
        const obs$ = observable<Record<string, BasicValue>>(
            syncedCrud({
                list: () => {
                    numLists++;
                    return promiseTimeout(0, serverState);
                },
                create: async (input) => {
                    return { ...input, updatedAt: 2 };
                },
                as: 'object',
                fieldUpdatedAt: 'updatedAt',
                changesSince: 'last-sync',
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<Record<string, BasicValue>>();
        expect(numLists).toEqual(0);

        obs$.get();

        await promiseTimeout(1);

        expect(numLists).toEqual(1);

        expect(obs$.get()).toEqual({
            id1: { id: 'id1', test: 'hi', updatedAt: 1 },
        });

        obs$['id2'].set({
            id: 'id2',
            test: 'hi2',
        });

        await promiseTimeout(1);

        expect(numLists).toEqual(1);

        serverState = [
            { id: 'id1', test: 'hi', updatedAt: 1 },
            { id: 'id2', test: 'hi2', updatedAt: 2 },
        ];

        expect(obs$.get()).toEqual({
            id1: { id: 'id1', test: 'hi', updatedAt: 1 },
            id2: { id: 'id2', test: 'hi2', updatedAt: 2 },
        });

        expect(localStorage.getItem(persistName)!).toEqual(
            JSON.stringify({
                id1: { id: 'id1', test: 'hi', updatedAt: 1 },
                id2: { id: 'id2', test: 'hi2', updatedAt: 2 },
            }),
        );
        expect(localStorage.getItem(persistName + '__m')!).toEqual(JSON.stringify({ lastSync: 1 }));

        syncState(obs$).sync();
        expect(numLists).toEqual(2);

        await promiseTimeout(10);

        expect(localStorage.getItem(persistName + '__m')!).toEqual(JSON.stringify({ lastSync: 2 }));
    });
});
describe('update partial', () => {
    test('without updatePartial', async () => {
        let updated = undefined;
        const obs$ = observable(
            syncedCrud({
                get: () => ({ ...ItemBasicValue(), other: 2, another: 3 }),
                update: async (value) => {
                    updated = value;
                    return value;
                },
            }),
        );

        obs$.get();

        await promiseTimeout(1);

        expect(obs$.get()).toEqual({
            id: 'id1',
            test: 'hi',
            other: 2,
            another: 3,
        });

        obs$.other.set(4);

        await promiseTimeout(1);

        expect(updated).toEqual({ id: 'id1', test: 'hi', other: 4, another: 3 });
        expect(obs$.get()).toEqual({
            id: 'id1',
            test: 'hi',
            other: 4,
            another: 3,
        });
    });
    test('with updatePartial', async () => {
        let updated = undefined;
        const obs = observable(
            syncedCrud({
                get: () => ({ ...ItemBasicValue(), other: 2, another: 3 }),
                update: async (value) => {
                    updated = value;
                    return value;
                },
                updatePartial: true,
            }),
        );

        obs.get();

        await promiseTimeout(1);

        expect(obs.get()).toEqual({
            id: 'id1',
            test: 'hi',
            other: 2,
            another: 3,
        });

        obs.other.set(4);

        await promiseTimeout(1);

        expect(updated).toEqual({ id: 'id1', other: 4 });
        expect(obs.get()).toEqual({
            id: 'id1',
            test: 'hi',
            other: 4,
            another: 3,
        });
    });
    test('with updatePartial and key 0', async () => {
        let updated = undefined;
        const obs = observable(
            syncedCrud({
                get: () => ({ id: 0, test: 'hi', other: 2, another: 3 }),
                update: async (value) => {
                    updated = value;
                    return value;
                },
                updatePartial: true,
            }),
        );

        obs.get();

        await promiseTimeout(1);

        expect(obs.get()).toEqual({
            id: 0,
            test: 'hi',
            other: 2,
            another: 3,
        });

        obs.other.set(4);

        await promiseTimeout(1);

        expect(updated).toEqual({ id: 0, other: 4 });
        expect(obs.get()).toEqual({
            id: 0,
            test: 'hi',
            other: 4,
            another: 3,
        });
    });
    test('with updatePartial deleting a key', async () => {
        let updated = undefined;
        const obs = observable(
            syncedCrud({
                get: () => ({ ...ItemBasicValue(), other: 2, another: 3 }),
                update: async (value) => {
                    updated = value;
                    return value;
                },
                updatePartial: true,
            }),
        );

        obs.get();

        await promiseTimeout(1);

        expect(obs.get()).toEqual({
            id: 'id1',
            test: 'hi',
            other: 2,
            another: 3,
        });

        obs.other.delete();

        await promiseTimeout(1);

        expect(updated).toEqual({ id: 'id1', other: undefined });
        expect(obs.get()).toEqual({
            id: 'id1',
            test: 'hi',
            another: 3,
        });
    });
    test('with updatePartial setting multiple', async () => {
        const updated: any[] = [];
        const obs$ = observable(
            syncedCrud({
                list: () => [
                    { id: 'id1', test: 'hi' },
                    { id: 'id2', test: 'hi' },
                    { id: 'id3', test: 'hi' },
                    { id: 'id4', test: 'hi' },
                ],
                update: async (value) => {
                    updated.push(value);
                    return value;
                },
                updatePartial: true,
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<Record<string, { id: string; test: string }>>();

        obs$.get();

        await promiseTimeout(1);

        expect(obs$.get()).toEqual({
            id1: { id: 'id1', test: 'hi' },
            id2: { id: 'id2', test: 'hi' },
            id3: { id: 'id3', test: 'hi' },
            id4: { id: 'id4', test: 'hi' },
        });

        obs$.id1.test.set('hello');
        obs$.id2.test.set('hello2');

        await promiseTimeout(1);

        expect(updated).toEqual([
            { id: 'id2', test: 'hello2' },
            { id: 'id1', test: 'hello' },
        ]);
        expect(obs$.get()).toEqual({
            id1: { id: 'id1', test: 'hello' },
            id2: { id: 'id2', test: 'hello2' },
            id3: { id: 'id3', test: 'hi' },
            id4: { id: 'id4', test: 'hi' },
        });
    });
    test('with updatePartial setting multiple properties of one item', async () => {
        const updated: any[] = [];
        const obs$ = observable(
            syncedCrud({
                list: () => [{ id: 'id1', test: 'hi', test2: 'hi2' }],
                update: async (value) => {
                    updated.push(value);
                    return value;
                },
                updatePartial: true,
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<
            Record<string, { id: string; test: string; test2: string }>
        >();

        obs$.get();

        await promiseTimeout(1);

        expect(obs$.get()).toEqual({
            id1: { id: 'id1', test: 'hi', test2: 'hi2' },
        });

        obs$.id1.assign({ test: 'hello', test2: 'hello2' });

        await promiseTimeout(1);

        expect(updated).toEqual([{ id: 'id1', test: 'hello', test2: 'hello2' }]);
        expect(obs$.get()).toEqual({
            id1: { id: 'id1', test: 'hello', test2: 'hello2' },
        });
    });
    test('with updatePartial set root', async () => {
        let updated = undefined;
        const obs = observable(
            syncedCrud({
                get: () => ({ ...ItemBasicValue(), other: 2, another: 3 }),
                update: async (value) => {
                    updated = value;
                    return value;
                },
                updatePartial: true,
            }),
        );

        obs.get();

        await promiseTimeout(1);

        expect(obs.get()).toEqual({
            id: 'id1',
            test: 'hi',
            other: 2,
            another: 3,
        });

        obs.set({ ...obs.get(), other: 4 });

        await promiseTimeout(1);

        expect(updated).toEqual({ id: 'id1', other: 4 });
        expect(obs.get()).toEqual({
            id: 'id1',
            test: 'hi',
            other: 4,
            another: 3,
        });
    });
});
describe('subscribe', () => {
    test('subscribe with refresh', async () => {
        let retValue = 1;
        const set1$ = observable(false);
        const set2$ = observable(false);

        const obs = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [{ id: retValue++ }]),
                as: 'array',
                mode: 'append',
                subscribe: ({ refresh }) => {
                    when(set1$, refresh);
                    when(set2$, refresh);
                },
            }),
        );
        const dispose = observe(() => obs.get());
        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(1);

        expect(obs.get()).toEqual([{ id: 1 }]);

        set1$.set(true);
        await promiseTimeout(1);
        expect(obs.get()).toEqual([{ id: 1 }, { id: 2 }]);

        set2$.set(true);
        await promiseTimeout(1);
        expect(obs.get()).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);

        dispose();
    });
    test('subscribe with update', async () => {
        const set1$ = observable(false);
        const set2$ = observable(false);
        const obs = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [{ id: 1 }]),
                as: 'array',
                mode: 'append',
                subscribe: ({ update }) => {
                    when(set1$, () => {
                        update({ value: [{ id: 2 }] });
                    });
                    when(set2$, () => {
                        update({ value: [{ id: 3 }] });
                    });
                },
            }),
        );
        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(1);

        expect(obs.get()).toEqual([{ id: 1 }]);

        set1$.set(true);
        await promiseTimeout(1);
        expect(obs.get()).toEqual([{ id: 1 }, { id: 2 }]);

        set2$.set(true);
        await promiseTimeout(1);
        expect(obs.get()).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    });
    test('subscribe with update as Map', async () => {
        const set1$ = observable(false);
        const set2$ = observable(false);
        const obs = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [{ id: 1 }]),
                as: 'Map',
                mode: 'assign',
                subscribe: ({ update }) => {
                    when(set1$, () => {
                        update({ value: [{ id: 2 }] });
                    });
                    when(set2$, () => {
                        update({ value: [{ id: 3 }] });
                    });
                },
            }),
        );
        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(1);

        expect(obs.get()).toEqual(new Map([[1, { id: 1 }]]));

        set1$.set(true);
        await promiseTimeout(1);
        expect(obs.get()).toEqual(
            new Map([
                [1, { id: 1 }],
                [2, { id: 2 }],
            ]),
        );

        set2$.set(true);
        await promiseTimeout(1);
        expect(obs.get()).toEqual(
            new Map([
                [1, { id: 1 }],
                [2, { id: 2 }],
                [3, { id: 3 }],
            ]),
        );
    });
    test('subscribe with update as value', async () => {
        const set1$ = observable(false);
        const set2$ = observable(false);
        const obs = observable(
            syncedCrud<{ id: number }, { id: number }, 'value'>({
                list: () => promiseTimeout(0, [{ id: 1 }]),
                as: 'value',
                subscribe: ({ update }) => {
                    when(set1$, () => {
                        update({ value: [{ id: 2 }] });
                    });
                    when(set2$, () => {
                        update({ value: [{ id: 3 }] });
                    });
                },
            }),
        );
        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(1);

        expect(obs.get()).toEqual({ id: 1 });

        set1$.set(true);
        await promiseTimeout(1);
        expect(obs.get()).toEqual({ id: 2 });

        set2$.set(true);
        await promiseTimeout(1);
        expect(obs.get()).toEqual({ id: 3 });
    });
    test('subscribe with deleted as array', async () => {
        const set1$ = observable(false);
        const obs = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [{ id: 1 }, { id: 2 }]),
                as: 'array',
                subscribe: ({ update }) => {
                    when(set1$, () => {
                        update({ value: [{ id: 1, [symbolDelete as any]: true }] });
                    });
                },
            }),
        );
        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(1);

        expect(obs.get()).toEqual([{ id: 1 }, { id: 2 }]);

        set1$.set(true);
        await promiseTimeout(1);
        expect(obs.get()).toEqual([{ id: 2 }]);
    });
    test('subscribe with deleted as object', async () => {
        const set1$ = observable(false);
        const obs = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [{ id: 1 }, { id: 2 }]),
                as: 'object',
                subscribe: ({ update }) => {
                    when(set1$, () => {
                        update({ value: [{ id: 1, [symbolDelete as any]: true }] });
                    });
                },
            }),
        );
        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(1);

        expect(obs.get()).toEqual({ 1: { id: 1 }, 2: { id: 2 } });

        set1$.set(true);
        await promiseTimeout(1);
        expect(obs.get()).toEqual({ 2: { id: 2 } });
    });
    test('subscribe with no list', async () => {
        const obs = observable(
            syncedCrud({
                as: 'object',
                subscribe: ({ update }) => {
                    update({ value: [{ id: 1 }] });
                },
            }),
        );

        expect(obs.get()).toEqual({ 1: { id: 1 } });
    });
    test('subscribe with no list async', async () => {
        const obs = observable(
            syncedCrud({
                as: 'object',
                subscribe: ({ update }) => {
                    setTimeout(() => {
                        update({ value: [{ id: 1 }] });
                    }, 0);
                },
            }),
        );

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(1);

        expect(obs.get()).toEqual({ 1: { id: 1 } });
    });
});
describe('onSaved', () => {
    test('without onSaved updates with id', async () => {
        let created = undefined;
        const obs = observable(
            syncedCrud({
                as: 'object',
                fieldUpdatedAt: 'updatedAt',
                create: async (input: BasicValue) => {
                    created = clone(input);
                    return input;
                },
                generateId: () => 'id1',
            }),
        );

        await promiseTimeout(1);

        obs.id1.set({ test: 'hello', id: undefined as unknown as string });

        await promiseTimeout(1);

        expect(created).toEqual({
            id: 'id1',
            test: 'hello',
        });

        expect(obs.get()).toEqual({
            id1: {
                id: 'id1',
                test: 'hello',
            },
        });
    });
    test('without onSaved updates with saved values', async () => {
        let created = undefined;
        let updated = undefined;
        const obs = observable(
            syncedCrud({
                initial: { id1: { ...ItemBasicValue(), updatedAt: 10 } as BasicValue },
                as: 'object',
                fieldUpdatedAt: 'updatedAt',
                create: async (input: BasicValue) => {
                    created = clone(input);
                    return input;
                },
                update: async (input) => {
                    updated = clone(input);
                    // Check this here because it will be updated in place by onSaved before
                    // the next expects can get to it
                    expect(input).toEqual({
                        id: 'id1',
                        test: 'hello',
                        updatedAt: 10,
                    });
                    return { ...input, updatedAt: 100 };
                },
            }),
        );

        await promiseTimeout(1);

        obs.id1.test.set('hello');

        await promiseTimeout(1);

        expect(created).toEqual(undefined);
        expect(updated).toEqual({
            id: 'id1',
            test: 'hello',
            updatedAt: 10,
        });

        expect(obs.get()).toEqual({
            id1: {
                id: 'id1',
                test: 'hello',
                updatedAt: 100,
            },
        });
    });
    test('without onSaved creates with saved values in array', async () => {
        let created = undefined;
        const obs = observable(
            syncedCrud({
                initial: [{ ...ItemBasicValue(), updatedAt: 10 }] as BasicValue[],
                as: 'array',
                fieldUpdatedAt: 'updatedAt',
                create: async (input: BasicValue) => {
                    created = {
                        ...input,
                        updatedAt: 20,
                    };
                    return created;
                },
            }),
        );

        obs.get();

        await promiseTimeout(1);

        obs.push({ id: 'id2', test: 'hello2' });

        await promiseTimeout(1);

        expect(created).toEqual({
            id: 'id2',
            test: 'hello2',
            updatedAt: 20,
        });

        expect(obs.get()).toEqual([
            {
                id: 'id1',
                test: 'hi',
                updatedAt: 10,
            },
            {
                id: 'id2',
                test: 'hello2',
                updatedAt: 20,
            },
        ]);
    });
    test('without onSaved updates with saved values in array', async () => {
        let updated = undefined;
        const obs = observable(
            syncedCrud({
                initial: [{ ...ItemBasicValue(), updatedAt: 10 }] as BasicValue[],
                as: 'array',
                fieldUpdatedAt: 'updatedAt',
                update: async (input: BasicValue) => {
                    updated = {
                        ...input,
                        updatedAt: 20,
                    };
                    return updated;
                },
            }),
        );

        await promiseTimeout(1);

        obs[0].test.set('hello2');

        await promiseTimeout(1);

        expect(updated).toEqual({
            id: 'id1',
            test: 'hello2',
            updatedAt: 20,
        });

        expect(obs.get()).toEqual([
            {
                id: 'id1',
                test: 'hello2',
                updatedAt: 20,
            },
        ]);
    });
    test('without onSaved updates with saved values ignores values changed locally', async () => {
        let created = undefined;
        let updated = undefined;
        const canSave$ = observable(false);
        const isSaving$ = observable(false);
        type ExtendedValue = BasicValue & { changing: string };
        const obs = observable(
            syncedCrud({
                initial: {
                    id1: { ...ItemBasicValue(), updatedAt: 10, changing: '0' } as ExtendedValue,
                },
                as: 'object',
                fieldUpdatedAt: 'updatedAt',
                create: async (input: ExtendedValue) => {
                    created = clone(input);
                    return input;
                },
                update: async (input) => {
                    isSaving$.set(true);
                    await when(canSave$);
                    updated = clone(input);
                    canSave$.set(false);
                    return { ...input, updatedAt: 100 };
                },
            }),
        );

        await promiseTimeout(1);

        obs.id1.test.set('hello');

        await when(isSaving$);

        obs.id1.changing.set('1');

        canSave$.set(true);

        await promiseTimeout(1);

        expect(created).toEqual(undefined);
        expect(updated).toEqual({
            id: 'id1',
            test: 'hello',
            updatedAt: 10,
            changing: '0',
        });

        expect(obs.get()).toEqual({
            id1: {
                id: 'id1',
                test: 'hello',
                updatedAt: 100,
                changing: '1',
            },
        });
    });
    test('onSaved gets correct value as object', async () => {
        let saved = undefined;
        const obs = observable(
            syncedCrud({
                as: 'object',
                fieldUpdatedAt: 'updatedAt',
                create: async (input: BasicValue) => {
                    return input;
                },
                generateId: () => 'id1',
                onSaved(params) {
                    saved = params.saved;
                },
            }),
        );

        await promiseTimeout(1);

        obs.id1.set({ test: 'hello', id: undefined as unknown as string });

        await promiseTimeout(1);

        expect(saved).toEqual({
            id: 'id1',
            test: 'hello',
        });
    });
    test('onSaved gets correct value as array', async () => {
        let saved = undefined;
        const obs = observable(
            syncedCrud({
                as: 'array',
                fieldUpdatedAt: 'updatedAt',
                create: async (input: BasicValue) => {
                    return input;
                },
                onSaved(params) {
                    saved = params.saved;
                },
            }),
        );

        await promiseTimeout(1);

        obs.push({ test: 'hello', id: 'id1' });

        await promiseTimeout(1);

        expect(saved).toEqual({
            id: 'id1',
            test: 'hello',
        });
    });

    test('onSaved setting multiple fields does not override', async () => {
        // Create an observable for controlling when saves complete
        const saveControl1$ = observable(false);
        const saveControl2$ = observable(false);

        let serverState: BasicValue2 | undefined = undefined;

        const obs = observable<Record<string, BasicValue2>>(
            syncedCrud({
                as: 'object',
                create: async (input: BasicValue2) => {
                    return { ...input, createdAt: 10 };
                },
                update: async (input: BasicValue2) => {
                    const ret = serverState!;
                    if (input.test2 === 'secondUpdate') {
                        await when(saveControl2$);
                    }

                    // Wait until we allow the save to complete
                    await when(saveControl1$);

                    return ret;
                },
                fieldUpdatedAt: 'updatedAt',
                fieldCreatedAt: 'createdAt',
                updatePartial: true,
            }),
        );

        // Set initial value
        obs.id1.set({ id: 'id1', test: 'initial', test2: 'initial2' });

        // Wait for initialization
        await promiseTimeout(1);

        // Update first field - this will start saving but not complete yet
        serverState = {
            id: 'id1',
            test: 'firstUpdate',
            test2: 'initial2',
            createdAt: 10,
            updatedAt: 11,
        };
        obs.id1.test.set('firstUpdate');

        // Wait for update to be processed
        await promiseTimeout(1);

        // Update second field before first save completes
        serverState = {
            id: 'id1',
            test: 'firstUpdate',
            test2: 'secondUpdate',
            createdAt: 10,
            updatedAt: 12,
        };
        obs.id1.test2.set('secondUpdate');

        // Wait for second update to be processed
        await promiseTimeout(1);

        // Allow save to complete
        saveControl1$.set(true);

        // Wait for save to complete
        await promiseTimeout(1);

        // Verify first field changes was preserved
        expect(obs.id1.get()).toEqual({
            id: 'id1',
            test: 'firstUpdate',
            test2: 'secondUpdate',
            createdAt: 10,
            updatedAt: 11,
        });

        saveControl2$.set(true);

        // Wait for second save to complete
        await promiseTimeout(1);

        // Verify both field changes were preserved
        expect(obs.id1.get()).toEqual({
            id: 'id1',
            test: 'firstUpdate',
            test2: 'secondUpdate',
            createdAt: 10,
            updatedAt: 12,
        });
    });

    test('onSaved gets correct value as object with deep nested object containing array', async () => {
        let saved = undefined;
        const obs = observable(
            syncedCrud({
                as: 'object',
                fieldUpdatedAt: 'updatedAt',
                create: async (input: BasicValue) => {
                    return input;
                },
                generateId: () => 'id1',
                onSaved(params) {
                    params.saved = {
                        ...params.saved,
                        parent: {
                            child: { baby: 'hello baby override' },
                        },
                        list: [
                            { parent: { child: { baby: 'hello list baby 1' } } },
                            { parent: { child: { baby: 'hello list baby 2 modified' } } },
                            { parent: { child: { baby: 'hello list baby 3' } } },
                        ],
                    };
                    saved = params.saved;
                    return params.saved;
                },
            }),
        );

        await promiseTimeout(1);

        obs.id1.set({
            test: 'hello',
            id: undefined as unknown as string,
            parent: { child: { baby: 'hello baby' } },
            list: [
                { parent: { child: { baby: 'hello list baby 1' } } },
                { parent: { child: { baby: 'hello list baby 2' } } },
                { parent: { child: { baby: 'hello list baby 3' } } },
            ],
        });

        await promiseTimeout(1);

        expect(saved).toEqual({
            id: 'id1',
            test: 'hello',
            parent: {
                child: { baby: 'hello baby override' },
            },
            list: [
                { parent: { child: { baby: 'hello list baby 1' } } },
                { parent: { child: { baby: 'hello list baby 2 modified' } } },
                { parent: { child: { baby: 'hello list baby 3' } } },
            ],
        });
        expect(obs.id1.peek()).toEqual({
            id: 'id1',
            test: 'hello',
            parent: {
                child: { baby: 'hello baby override' },
            },
            list: [
                { parent: { child: { baby: 'hello list baby 1' } } },
                { parent: { child: { baby: 'hello list baby 2 modified' } } },
                { parent: { child: { baby: 'hello list baby 3' } } },
            ],
        });
    });

    test('does not overwrite an array changed while a save is in flight', async () => {
        type Value = { id: string; test: string; list: { value: string }[] };
        const canSave$ = observable(false);
        let startSave!: () => void;
        const saveStarted = new Promise<void>((resolve) => (startSave = resolve));
        const obs$ = observable<Record<string, Value>>(
            syncedCrud<Value, Value, 'object'>({
                initial: { id1: { id: 'id1', test: 'before', list: [{ value: 'original' }] } },
                as: 'object',
                update: async (input) => {
                    if (input.list![0].value === 'original') {
                        startSave();
                        await when(canSave$);
                    }
                    return input;
                },
                onSaved: ({ saved }) =>
                    saved.list[0].value === 'original' ? { ...saved, list: [{ value: 'server' }] } : saved,
            }),
        );

        obs$.id1.test.set('after');
        await saveStarted;
        obs$.id1.list[0].value.set('local');
        canSave$.set(true);
        await promiseTimeout(1);

        expect(obs$.id1.list.peek()).toEqual([{ value: 'local' }]);
    });
});
describe('Order of get/create', () => {
    test('create with no get', async () => {
        let created: BasicValue | undefined = undefined;
        const value = { id: '1', test: 'hi' };
        const obs$ = observable<BasicValue>(
            syncedCrud({
                create: (input: BasicValue) => {
                    created = input;
                    return promiseTimeout(0, input);
                },
                as: 'value',
            }),
        );

        obs$.set(value);
        expect(obs$.get()).toEqual(value);
        await promiseTimeout(1);
        await when(syncState(obs$).isLoaded);
        expect(obs$.get()).toEqual(value);
        expect(created).toEqual(value);
    });
    test('create before get returns null', async () => {
        let created: BasicValue | undefined = undefined;
        const value = { id: '1', test: 'hi' };
        let didGet = false;
        const obs$ = observable<BasicValue>(
            syncedCrud({
                get: () => {
                    didGet = true;
                    return promiseTimeout(0, null);
                },
                create: (input: BasicValue) => {
                    expect(didGet).toEqual(true);
                    created = input;
                    return promiseTimeout(0, input);
                },
                as: 'value',
            }),
        );

        obs$.set(value);
        expect(obs$.get()).toEqual(value);
        await promiseTimeout(1);
        await when(syncState(obs$).isLoaded);
        expect(obs$.get()).toEqual(value);
        expect(created).toEqual(value);
        expect(didGet).toEqual(true);
    });
    test('update before get returns a value', async () => {
        let created: BasicValue | undefined = undefined;
        let updated: BasicValue | undefined = undefined;
        const value = { id: '1', test: 'hi' };
        let didGet = false;
        const obs$ = observable<BasicValue>(
            syncedCrud({
                get: () => {
                    didGet = true;
                    return promiseTimeout(0, { id: '1', test: 'hello' });
                },
                create: (input: BasicValue) => {
                    created = input;
                    return promiseTimeout(0, input);
                },
                update: (input: BasicValue) => {
                    expect(didGet).toEqual(true);
                    updated = input;
                    return promiseTimeout(0, input);
                },
                as: 'value',
            }),
        );

        obs$.set(value);
        expect(obs$.get()).toEqual(value);
        await promiseTimeout(1);
        await when(syncState(obs$).isLoaded);
        expect(obs$.get()).toEqual(value);
        expect(created).toEqual(undefined);
        expect(updated).toEqual(value);
        expect(didGet).toEqual(true);
    });
    test('update before list returns a value', async () => {
        let created: BasicValue | undefined = undefined;
        let updated: BasicValue | undefined = undefined;
        const value = { id: '1', test: 'hi' };
        let didGet = false;
        const obs$ = observable<Record<string, BasicValue>>(
            syncedCrud({
                list: () => {
                    didGet = true;
                    return promiseTimeout(0, [{ id: '1', test: 'hello' }]);
                },
                create: (input: BasicValue) => {
                    created = input;
                    return promiseTimeout(0, input);
                },
                update: (input: BasicValue) => {
                    expect(didGet).toEqual(true);
                    updated = input;
                    return promiseTimeout(0, input);
                },
                as: 'object',
            }),
        );

        obs$['1'].set(value);
        expect(obs$.get()).toEqual({ '1': value });
        await promiseTimeout(1);
        await when(syncState(obs$).isLoaded);
        expect(obs$.get()).toEqual({ '1': value });
        expect(created).toEqual(undefined);
        expect(updated).toEqual(value);
        expect(didGet).toEqual(true);
    });
    test('update before create returns does update', async () => {
        let created: BasicValue | undefined = undefined;
        let numCreated = 0;
        let numUpdated = 0;
        let updated: BasicValue | undefined = undefined;
        const value = { id: '1', test: 'hi' };
        const obs$ = observable<Record<string, BasicValue>>(
            syncedCrud({
                list: () => {
                    return [] as BasicValue[];
                },
                create: (input: BasicValue) => {
                    created = input;
                    numCreated++;
                    return promiseTimeout(10, input);
                },
                update: (input: BasicValue) => {
                    updated = input;
                    numUpdated++;
                    return promiseTimeout(0, input);
                },
                as: 'object',
                fieldCreatedAt: 'createdAt',
                fieldUpdatedAt: 'updatedAt',
            }),
        );

        expect(obs$.get()).toEqual({});
        expect(syncState(obs$).isLoaded.get()).toEqual(true);

        obs$['1'].set(value);

        await promiseTimeout(0);

        expect(numCreated).toEqual(1);

        obs$['1'].test.set('hello');

        await promiseTimeout(0);

        expect(numCreated).toEqual(1);
        expect(numUpdated).toEqual(1);
        expect(created).toEqual({ id: '1', test: 'hi' });
        expect(updated).toEqual({ id: '1', test: 'hello' });
    });
    test('update after terminal create failure creates again instead of updating', async () => {
        const createCalls: BasicValue[] = [];
        const updateCalls: BasicValue[] = [];
        const obs$ = observable<Record<string, BasicValue>>(
            syncedCrud({
                list: () => {
                    return [] as BasicValue[];
                },
                create: async (input: BasicValue) => {
                    createCalls.push(clone(input));
                    if (createCalls.length === 1) {
                        throw new Error('create failed');
                    }
                    return {
                        ...input,
                        createdAt: 1,
                    };
                },
                update: async (input: BasicValue) => {
                    updateCalls.push(clone(input));
                    return input;
                },
                onError: () => {},
                as: 'object',
                fieldCreatedAt: 'createdAt',
                fieldUpdatedAt: 'updatedAt',
            }),
        );

        obs$['1'].set({ id: '1', test: 'hi' });

        await promiseTimeout(0);

        obs$['1'].test.set('hello');

        await promiseTimeout(0);
        await promiseTimeout(0);
        await promiseTimeout(0);

        expect(createCalls).toEqual([
            { id: '1', test: 'hi' },
            { id: '1', test: 'hello' },
        ]);
        expect(updateCalls).toEqual([]);
        expect(clone(obs$.get())).toEqual({
            '1': { id: '1', test: 'hello', createdAt: 1 },
        });
    });
    test('pending create retry rebuilds create payload from the latest value', async () => {
        let shouldError = true;
        const createCalls: BasicValue[] = [];
        const updateCalls: BasicValue[] = [];
        const obs$ = observable<Record<string, BasicValue>>(
            syncedCrud({
                list: () => {
                    return [] as BasicValue[];
                },
                create: async (input: BasicValue) => {
                    createCalls.push(clone(input));
                    if (shouldError) {
                        throw new Error('create failed');
                    }
                    return {
                        ...input,
                        createdAt: 2,
                        updatedAt: 2,
                    };
                },
                update: async (input: BasicValue) => {
                    updateCalls.push(clone(input));
                    return input;
                },
                onError: () => {},
                retry: {
                    infinite: true,
                    delay: 5,
                },
                as: 'object',
                fieldCreatedAt: 'createdAt',
                fieldUpdatedAt: 'updatedAt',
            }),
        );

        obs$['1'].set({ id: '1', test: 'hi' });

        await promiseTimeout(5);

        expect(createCalls).toEqual([{ id: '1', test: 'hi' }]);
        expect(updateCalls).toEqual([]);

        obs$['1'].test.set('hello');
        shouldError = false;

        await promiseTimeout(100);

        expect(createCalls).toEqual([
            { id: '1', test: 'hi' },
            { id: '1', test: 'hello' },
        ]);
        expect(updateCalls).toEqual([{ id: '1', test: 'hello' }]);
        expect(obs$.get()).toEqual({
            '1': { id: '1', test: 'hello', createdAt: 2, updatedAt: 2 },
        });
    });
    test('value update after terminal create failure creates again instead of updating', async () => {
        const createCalls: BasicValue[] = [];
        const updateCalls: BasicValue[] = [];
        const obs$ = observable<BasicValue | undefined>(
            syncedCrud({
                as: 'value',
                create: async (input: BasicValue) => {
                    createCalls.push(clone(input));
                    if (createCalls.length === 1) {
                        throw new Error('create failed');
                    }
                    return input;
                },
                update: async (input: BasicValue) => {
                    updateCalls.push(clone(input));
                    return input;
                },
                onError: () => {},
                fieldCreatedAt: 'createdAt',
                fieldUpdatedAt: 'updatedAt',
            }),
        );

        obs$.set({ id: '1', test: 'hi' });

        await promiseTimeout(0);

        obs$.test.set('hello');

        await promiseTimeout(0);
        await promiseTimeout(0);

        expect(createCalls).toEqual([
            { id: '1', test: 'hi' },
            { id: '1', test: 'hello' },
        ]);
        expect(updateCalls).toEqual([]);
    });
    test('array update after terminal create failure creates again instead of updating', async () => {
        const createCalls: BasicValue[] = [];
        const updateCalls: BasicValue[] = [];
        const obs$ = observable<BasicValue[]>(
            syncedCrud({
                list: () => {
                    return [] as BasicValue[];
                },
                create: async (input: BasicValue) => {
                    createCalls.push(clone(input));
                    if (createCalls.length === 1) {
                        throw new Error('create failed');
                    }
                    return input;
                },
                update: async (input: BasicValue) => {
                    updateCalls.push(clone(input));
                    return input;
                },
                onError: () => {},
                as: 'array',
                fieldCreatedAt: 'createdAt',
                fieldUpdatedAt: 'updatedAt',
            }),
        );

        await promiseTimeout(1);

        obs$.push({ id: '1', test: 'hi' });

        await promiseTimeout(0);

        obs$[0].test.set('hello');

        await promiseTimeout(0);
        await promiseTimeout(0);

        expect(createCalls).toEqual([
            { id: '1', test: 'hi' },
            { id: '1', test: 'hello' },
        ]);
        expect(updateCalls).toEqual([]);
    });
    test('array root set retries an unchanged failed create before clearing pending', async () => {
        const persistName = getPersistName();
        let shouldFailFirst = true;
        const createCalls: BasicValue[] = [];
        const createdIds = new Set<string>();
        const obs$ = observable<BasicValue[]>(
            syncedCrud({
                list: () => [] as BasicValue[],
                create: async (input: BasicValue) => {
                    createCalls.push(clone(input));
                    if (input.id === '1' && shouldFailFirst) {
                        throw new Error('create failed');
                    }
                    createdIds.add(input.id);
                    return input;
                },
                onError: () => {},
                as: 'array',
                persist: {
                    plugin: ObservablePersistLocalStorage,
                    name: persistName,
                    retrySync: true,
                },
            }),
        );

        obs$.get();
        await when(syncState(obs$).isPersistLoaded);

        obs$.set([{ id: '1', test: 'first' }]);
        await promiseTimeout(0);
        await promiseTimeout(0);

        expect(syncState(obs$).getPendingChanges()).toHaveProperty('');

        shouldFailFirst = false;
        obs$.set([
            { id: '1', test: 'first' },
            { id: '2', test: 'second' },
        ]);
        await promiseTimeout(0);
        await promiseTimeout(0);

        expect(createCalls.map((value) => value.id).sort()).toEqual(['1', '1', '2']);
        expect(createdIds).toEqual(new Set(['1', '2']));
        expect(syncState(obs$).getPendingChanges()).toEqual({});
        expect(JSON.parse(localStorage.getItem(persistName + '__m')!).pending).toEqual({});
    });
    test('array root set keeps pending when one create still fails', async () => {
        const persistName = getPersistName();
        const createdIds = new Set<string>();
        const obs$ = observable<BasicValue[]>(
            syncedCrud({
                list: () => [] as BasicValue[],
                create: async (input: BasicValue) => {
                    if (input.id === '1') {
                        throw new Error('create failed');
                    }
                    createdIds.add(input.id);
                    return input;
                },
                onError: () => {},
                as: 'array',
                persist: {
                    plugin: ObservablePersistLocalStorage,
                    name: persistName,
                    retrySync: true,
                },
            }),
        );

        obs$.get();
        await when(syncState(obs$).isPersistLoaded);

        obs$.set([{ id: '1', test: 'first' }]);
        await promiseTimeout(0);
        await promiseTimeout(0);

        obs$.set([
            { id: '1', test: 'first' },
            { id: '2', test: 'second' },
        ]);
        await promiseTimeout(0);
        await promiseTimeout(0);

        expect(createdIds).toEqual(new Set(['2']));
        expect(syncState(obs$).getPendingChanges()).toHaveProperty('');
        expect(JSON.parse(localStorage.getItem(persistName + '__m')!).pending).toHaveProperty('');
    });
    test('array root pending creates are restored after reload', async () => {
        const persistName = getPersistName();
        const pendingValue = [
            { id: '1', test: 'first' },
            { id: '2', test: 'second' },
        ];
        localStorage.setItem(persistName, JSON.stringify(pendingValue));
        localStorage.setItem(
            persistName + '__m',
            JSON.stringify({
                pending: {
                    '': {
                        p: [],
                        t: [],
                        v: pendingValue,
                    },
                },
            }),
        );

        const createCalls: BasicValue[] = [];
        const obs$ = observable<BasicValue[]>(
            syncedCrud({
                list: () => [] as BasicValue[],
                create: async (input: BasicValue) => {
                    createCalls.push(clone(input));
                    return input;
                },
                onError: () => {},
                as: 'array',
                mode: 'set',
                persist: {
                    plugin: ObservablePersistLocalStorage,
                    name: persistName,
                    retrySync: true,
                },
            }),
        );

        obs$.get();
        await when(syncState(obs$).isPersistLoaded);
        await promiseTimeout(0);
        await promiseTimeout(0);

        expect(createCalls.map((value) => value.id).sort()).toEqual(['1', '2']);
        expect(syncState(obs$).getPendingChanges()).toEqual({});
    });
    test('Map update after terminal create failure creates again instead of updating', async () => {
        const createCalls: BasicValue[] = [];
        const updateCalls: BasicValue[] = [];
        const obs$ = observable<Map<string, BasicValue>>(
            syncedCrud({
                list: () => {
                    return [] as BasicValue[];
                },
                create: async (input: BasicValue) => {
                    createCalls.push(clone(input));
                    if (createCalls.length === 1) {
                        throw new Error('create failed');
                    }
                    return input;
                },
                update: async (input: BasicValue) => {
                    updateCalls.push(clone(input));
                    return input;
                },
                onError: () => {},
                as: 'Map',
                fieldCreatedAt: 'createdAt',
                fieldUpdatedAt: 'updatedAt',
            }),
        );

        await promiseTimeout(1);

        obs$.set(new Map([['1', { id: '1', test: 'hi' }]]));

        await promiseTimeout(0);

        obs$.get('1').test.set('hello');

        await promiseTimeout(0);
        await promiseTimeout(0);

        expect(createCalls).toEqual([
            { id: '1', test: 'hi' },
            { id: '1', test: 'hello' },
        ]);
        expect(updateCalls).toEqual([]);
    });
    test('value pending create retry rebuilds create payload from the latest value', async () => {
        let shouldError = true;
        const createCalls: BasicValue[] = [];
        const updateCalls: BasicValue[] = [];
        const obs$ = observable<BasicValue | undefined>(
            syncedCrud({
                as: 'value',
                create: async (input: BasicValue) => {
                    createCalls.push(clone(input));
                    if (shouldError) {
                        throw new Error('create failed');
                    }
                    return {
                        ...input,
                        createdAt: 2,
                        updatedAt: 2,
                    };
                },
                update: async (input: BasicValue) => {
                    updateCalls.push(clone(input));
                    return input;
                },
                onError: () => {},
                retry: {
                    infinite: true,
                    delay: 50,
                },
                fieldCreatedAt: 'createdAt',
                fieldUpdatedAt: 'updatedAt',
            }),
        );

        obs$.set({ id: '1', test: 'hi' });

        await promiseTimeout(5);

        obs$.test.set('hello');
        shouldError = false;

        await promiseTimeout(100);

        expect(createCalls).toEqual([
            { id: '1', test: 'hi' },
            { id: '1', test: 'hello' },
        ]);
        expect(updateCalls).toEqual([{ id: '1', test: 'hello' }]);
        expect(obs$.get()).toEqual({ id: '1', test: 'hello', createdAt: 2, updatedAt: 2 });
    });
    test('array pending create retry rebuilds create payload from the latest value', async () => {
        let shouldError = true;
        const createCalls: BasicValue[] = [];
        const updateCalls: BasicValue[] = [];
        const obs$ = observable<BasicValue[]>(
            syncedCrud({
                list: () => {
                    return [] as BasicValue[];
                },
                create: async (input: BasicValue) => {
                    createCalls.push(clone(input));
                    if (shouldError) {
                        throw new Error('create failed');
                    }
                    return {
                        ...input,
                        createdAt: 2,
                        updatedAt: 2,
                    };
                },
                update: async (input: BasicValue) => {
                    updateCalls.push(clone(input));
                    return input;
                },
                onError: () => {},
                retry: {
                    infinite: true,
                    delay: 20,
                },
                as: 'array',
                fieldCreatedAt: 'createdAt',
                fieldUpdatedAt: 'updatedAt',
            }),
        );

        await promiseTimeout(1);

        obs$.push({ id: '1', test: 'hi' });

        await promiseTimeout(5);

        obs$[0].test.set('hello');
        shouldError = false;

        await promiseTimeout(100);

        expect(createCalls).toEqual([
            { id: '1', test: 'hi' },
            { id: '1', test: 'hello' },
        ]);
        expect(updateCalls).toEqual([{ id: '1', test: 'hello' }]);
        expect(obs$.get()).toEqual([{ id: '1', test: 'hello', createdAt: 2, updatedAt: 2 }]);
    });
    test('Map pending create retry rebuilds create payload from the latest value', async () => {
        let shouldError = true;
        const createCalls: BasicValue[] = [];
        const updateCalls: BasicValue[] = [];
        const obs$ = observable<Map<string, BasicValue>>(
            syncedCrud({
                list: () => {
                    return [] as BasicValue[];
                },
                create: async (input: BasicValue) => {
                    createCalls.push(clone(input));
                    if (shouldError) {
                        throw new Error('create failed');
                    }
                    return {
                        ...input,
                        createdAt: 2,
                        updatedAt: 2,
                    };
                },
                update: async (input: BasicValue) => {
                    updateCalls.push(clone(input));
                    return input;
                },
                onError: () => {},
                retry: {
                    infinite: true,
                    delay: 20,
                },
                as: 'Map',
                fieldCreatedAt: 'createdAt',
                fieldUpdatedAt: 'updatedAt',
            }),
        );

        await promiseTimeout(1);

        obs$.set(new Map([['1', { id: '1', test: 'hi' }]]));

        await promiseTimeout(5);

        obs$.get('1').test.set('hello');
        shouldError = false;

        await promiseTimeout(100);

        expect(createCalls).toEqual([
            { id: '1', test: 'hi' },
            { id: '1', test: 'hello' },
        ]);
        expect(updateCalls).toEqual([{ id: '1', test: 'hello' }]);
        expect(obs$.get()).toEqual(new Map([['1', { id: '1', test: 'hello', createdAt: 2, updatedAt: 2 }]]));
    });
    test('failed create retry invariant is consistent across value shapes', async () => {
        const shapeCases = [
            {
                name: 'object',
                makeObservable: (setFns: any) =>
                    observable<Record<string, BasicValue>>(
                        syncedCrud({
                            list: () => [] as BasicValue[],
                            as: 'object',
                            ...setFns,
                        }) as any,
                    ),
                insert: (obs$: any) => obs$['1'].set({ id: '1', test: 'hi' }),
                edit: (obs$: any) => obs$['1'].test.set('hello'),
                expectedValue: {
                    '1': { id: '1', test: 'hello', createdAt: 2, updatedAt: 2 },
                },
            },
            {
                name: 'value',
                makeObservable: (setFns: any) =>
                    observable<BasicValue | undefined>(
                        syncedCrud({
                            as: 'value',
                            ...setFns,
                        }) as any,
                    ),
                insert: (obs$: any) => obs$.set({ id: '1', test: 'hi' }),
                edit: (obs$: any) => obs$.test.set('hello'),
                expectedValue: { id: '1', test: 'hello', createdAt: 2, updatedAt: 2 },
            },
            {
                name: 'array',
                makeObservable: (setFns: any) =>
                    observable<BasicValue[]>(
                        syncedCrud({
                            list: () => [] as BasicValue[],
                            as: 'array',
                            ...setFns,
                        }) as any,
                    ),
                insert: (obs$: any) => obs$.push({ id: '1', test: 'hi' }),
                edit: (obs$: any) => obs$[0].test.set('hello'),
                expectedValue: [{ id: '1', test: 'hello', createdAt: 2, updatedAt: 2 }],
            },
            {
                name: 'Map',
                makeObservable: (setFns: any) =>
                    observable<Map<string, BasicValue>>(
                        syncedCrud({
                            list: () => [] as BasicValue[],
                            as: 'Map',
                            ...setFns,
                        }) as any,
                    ),
                insert: (obs$: any) => obs$.set(new Map([['1', { id: '1', test: 'hi' }]])),
                edit: (obs$: any) => obs$.get('1').test.set('hello'),
                expectedValue: new Map([['1', { id: '1', test: 'hello', createdAt: 2, updatedAt: 2 }]]),
            },
        ];

        for (const shape of shapeCases) {
            let shouldError = true;
            const createCalls: BasicValue[] = [];
            const updateCalls: BasicValue[] = [];
            let resolveFirstCreate!: () => void;
            let resolveRetriedCreate!: () => void;
            let resolveUpdate!: () => void;
            const firstCreate = new Promise<void>((resolve) => (resolveFirstCreate = resolve));
            const retriedCreate = new Promise<void>((resolve) => (resolveRetriedCreate = resolve));
            const update = new Promise<void>((resolve) => (resolveUpdate = resolve));
            const obs$ = shape.makeObservable({
                create: async (input: BasicValue) => {
                    createCalls.push(clone(input));
                    if (shouldError) {
                        resolveFirstCreate();
                        throw new Error(`${shape.name} create failed`);
                    }
                    resolveRetriedCreate();
                    return {
                        ...input,
                        createdAt: 2,
                        updatedAt: 2,
                    };
                },
                update: async (input: BasicValue) => {
                    updateCalls.push(clone(input));
                    resolveUpdate();
                    return input;
                },
                onError: () => {},
                retry: {
                    infinite: true,
                    delay: 5,
                },
                fieldCreatedAt: 'createdAt',
                fieldUpdatedAt: 'updatedAt',
            });

            await promiseTimeout(1);

            shape.insert(obs$);

            await firstCreate;

            expect(createCalls).toEqual([{ id: '1', test: 'hi' }]);
            expect(updateCalls).toEqual([]);

            shape.edit(obs$);
            expect(updateCalls).toEqual([]);

            shouldError = false;

            await Promise.all([retriedCreate, update]);
            await promiseTimeout(0);

            expect(createCalls).toEqual([
                { id: '1', test: 'hi' },
                { id: '1', test: 'hello' },
            ]);
            expect(updateCalls).toEqual([{ id: '1', test: 'hello' }]);
            expect(obs$.get()).toEqual(shape.expectedValue);
        }
    });
    test('update during create retry in flight waits for create before updating', async () => {
        let resolveCreate: ((value: BasicValue) => void) | undefined = undefined;
        const createCalls: BasicValue[] = [];
        const updateCalls: BasicValue[] = [];
        const obs$ = observable<Record<string, BasicValue>>(
            syncedCrud({
                list: () => {
                    return [] as BasicValue[];
                },
                create: async (input: BasicValue) => {
                    createCalls.push(clone(input));
                    if (createCalls.length === 1) {
                        throw new Error('create failed');
                    }
                    return new Promise<BasicValue>((resolve) => {
                        resolveCreate = resolve;
                    });
                },
                update: async (input: BasicValue) => {
                    updateCalls.push(clone(input));
                    return input;
                },
                onError: () => {},
                retry: {
                    infinite: true,
                    delay: 1,
                },
                as: 'object',
                fieldCreatedAt: 'createdAt',
                fieldUpdatedAt: 'updatedAt',
            }),
        );

        obs$['1'].set({ id: '1', test: 'hi' });

        await promiseTimeout(10);

        expect(createCalls).toEqual([
            { id: '1', test: 'hi' },
            { id: '1', test: 'hi' },
        ]);
        expect(resolveCreate).toBeDefined();

        obs$['1'].test.set('hello');

        await promiseTimeout(5);

        expect(updateCalls).toEqual([]);

        resolveCreate!({ id: '1', test: 'hi', createdAt: 2, updatedAt: 2 });

        await promiseTimeout(0);
        await promiseTimeout(0);

        expect(updateCalls).toEqual([{ id: '1', test: 'hello' }]);
        expect(obs$.get()).toEqual({
            '1': { id: '1', test: 'hello', createdAt: 2, updatedAt: 2 },
        });
    });
    test('stale queued update retry does not run after create failure', async () => {
        let rejectCreate: ((error: Error) => void) | undefined = undefined;
        const createCalls: BasicValue[] = [];
        const updateCalls: BasicValue[] = [];
        const obs$ = observable<Record<string, BasicValue>>(
            syncedCrud({
                list: () => {
                    return [] as BasicValue[];
                },
                create: async (input: BasicValue) => {
                    createCalls.push(clone(input));
                    if (createCalls.length === 1) {
                        return new Promise<BasicValue>((_resolve, reject) => {
                            rejectCreate = reject;
                        });
                    }
                    throw new Error('create failed');
                },
                update: async (input: BasicValue) => {
                    updateCalls.push(clone(input));
                    throw new Error('update failed');
                },
                onError: () => {},
                retry: {
                    infinite: true,
                    delay: 20,
                },
                as: 'object',
                fieldCreatedAt: 'createdAt',
                fieldUpdatedAt: 'updatedAt',
            }),
        );

        try {
            obs$['1'].set({ id: '1', test: 'hi' });

            await promiseTimeout(0);

            obs$['1'].test.set('hello');

            await promiseTimeout(5);

            expect(updateCalls).toEqual([{ id: '1', test: 'hello' }]);
            expect(rejectCreate).toBeDefined();

            rejectCreate!(new Error('create failed'));

            await promiseTimeout(60);

            expect(updateCalls).toEqual([{ id: '1', test: 'hello' }]);
        } finally {
            (rejectCreate as ((error: Error) => void) | undefined)?.(new Error('test cleanup'));
            await promiseTimeout(0);
            obs$['1'].delete();
            await when(() => syncState(obs$).numPendingSets.get() === 0);
        }
        expect(obs$.peek()).toEqual({});
        expect(syncState(obs$).isSetting.peek()).toBe(false);
        const completedCreates = createCalls.length;
        await promiseTimeout(50);
        expect(createCalls).toHaveLength(completedCreates);
        expect(updateCalls).toEqual([{ id: '1', test: 'hello' }]);
    });
    test('local delete after create failure cancels queued create retry', async () => {
        const createCalls: BasicValue[] = [];
        const updateCalls: BasicValue[] = [];
        const deleteCalls: BasicValue[] = [];
        const obs$ = observable<Record<string, BasicValue>>(
            syncedCrud({
                list: () => {
                    return [] as BasicValue[];
                },
                create: async (input: BasicValue) => {
                    createCalls.push(clone(input));
                    throw new Error('create failed');
                },
                update: async (input: BasicValue) => {
                    updateCalls.push(clone(input));
                    return input;
                },
                delete: async (input: BasicValue) => {
                    deleteCalls.push(clone(input));
                    return input;
                },
                onError: () => {},
                retry: {
                    infinite: true,
                    delay: 20,
                },
                as: 'object',
                fieldCreatedAt: 'createdAt',
                fieldUpdatedAt: 'updatedAt',
            }),
        );

        obs$['1'].set({ id: '1', test: 'hi' });

        await promiseTimeout(5);

        expect(createCalls).toEqual([{ id: '1', test: 'hi' }]);

        obs$['1'].delete();

        await promiseTimeout(50);

        expect(createCalls).toEqual([{ id: '1', test: 'hi' }]);
        expect(updateCalls).toEqual([]);
        expect(deleteCalls).toEqual([]);
        expect(obs$.get()).toEqual({});
    });
    test('value delete after create failure cancels queued create retry', async () => {
        const createCalls: BasicValue[] = [];
        const updateCalls: BasicValue[] = [];
        const deleteCalls: BasicValue[] = [];
        const obs$ = observable<BasicValue | undefined>(
            syncedCrud({
                as: 'value',
                create: async (input: BasicValue) => {
                    createCalls.push(clone(input));
                    throw new Error('create failed');
                },
                update: async (input: BasicValue) => {
                    updateCalls.push(clone(input));
                    return input;
                },
                delete: async (input: BasicValue) => {
                    deleteCalls.push(clone(input));
                    return input;
                },
                onError: () => {},
                retry: {
                    infinite: true,
                    delay: 20,
                },
                fieldCreatedAt: 'createdAt',
                fieldUpdatedAt: 'updatedAt',
            }),
        );

        obs$.set({ id: '1', test: 'hi' });

        await promiseTimeout(5);

        expect(createCalls).toEqual([{ id: '1', test: 'hi' }]);

        obs$.delete();

        await promiseTimeout(50);

        expect(createCalls).toEqual([{ id: '1', test: 'hi' }]);
        expect(updateCalls).toEqual([]);
        expect(deleteCalls).toEqual([]);
        expect(obs$.get()).toEqual(undefined);
    });
    test('array root replacement after create failure cancels queued create retry', async () => {
        const createCalls: BasicValue[] = [];
        const updateCalls: BasicValue[] = [];
        const deleteCalls: BasicValue[] = [];
        const obs$ = observable<BasicValue[]>(
            syncedCrud({
                list: () => {
                    return [] as BasicValue[];
                },
                create: async (input: BasicValue) => {
                    createCalls.push(clone(input));
                    throw new Error('create failed');
                },
                update: async (input: BasicValue) => {
                    updateCalls.push(clone(input));
                    return input;
                },
                delete: async (input: BasicValue) => {
                    deleteCalls.push(clone(input));
                    return input;
                },
                onError: () => {},
                retry: {
                    infinite: true,
                    delay: 20,
                },
                as: 'array',
                fieldCreatedAt: 'createdAt',
                fieldUpdatedAt: 'updatedAt',
            }),
        );

        await promiseTimeout(1);

        obs$.push({ id: '1', test: 'hi' });

        await promiseTimeout(5);

        expect(createCalls).toEqual([{ id: '1', test: 'hi' }]);

        obs$.set([]);

        await promiseTimeout(50);

        expect(createCalls).toEqual([{ id: '1', test: 'hi' }]);
        expect(updateCalls).toEqual([]);
        expect(deleteCalls).toEqual([]);
        expect(obs$.get()).toEqual([]);
    });
    test('Map delete after create failure cancels queued create retry', async () => {
        const createCalls: BasicValue[] = [];
        const updateCalls: BasicValue[] = [];
        const deleteCalls: BasicValue[] = [];
        const obs$ = observable<Map<string, BasicValue>>(
            syncedCrud({
                list: () => {
                    return [] as BasicValue[];
                },
                create: async (input: BasicValue) => {
                    createCalls.push(clone(input));
                    throw new Error('create failed');
                },
                update: async (input: BasicValue) => {
                    updateCalls.push(clone(input));
                    return input;
                },
                delete: async (input: BasicValue) => {
                    deleteCalls.push(clone(input));
                    return input;
                },
                onError: () => {},
                retry: {
                    infinite: true,
                    delay: 20,
                },
                as: 'Map',
                fieldCreatedAt: 'createdAt',
                fieldUpdatedAt: 'updatedAt',
            }),
        );

        await promiseTimeout(1);

        obs$.set(new Map([['1', { id: '1', test: 'hi' }]]));

        await promiseTimeout(5);

        expect(createCalls).toEqual([{ id: '1', test: 'hi' }]);

        obs$.delete('1');

        await promiseTimeout(50);

        expect(createCalls).toEqual([{ id: '1', test: 'hi' }]);
        expect(updateCalls).toEqual([]);
        expect(deleteCalls).toEqual([]);
        expect(obs$.get()).toEqual(new Map());
    });
    test('remote rows cancel queued create retries after a create failure', async () => {
        const createCalls: BasicValue[] = [];
        const updateCalls: BasicValue[] = [];
        let updateRemote: ((params: { value: BasicValue[] }) => Promise<void>) | undefined = undefined;
        const obs$ = observable<Record<string, BasicValue>>(
            syncedCrud({
                list: () => {
                    return [] as BasicValue[];
                },
                subscribe: ({ update }) => {
                    updateRemote = update as typeof updateRemote;
                },
                create: async (input: BasicValue) => {
                    createCalls.push(clone(input));
                    throw new Error('create failed');
                },
                update: async (input: BasicValue) => {
                    updateCalls.push(clone(input));
                    return input;
                },
                onError: () => {},
                retry: {
                    infinite: true,
                    delay: 20,
                },
                as: 'object',
                fieldCreatedAt: 'createdAt',
                fieldUpdatedAt: 'updatedAt',
            }),
        );

        obs$['1'].set({ id: '1', test: 'hi' });

        await promiseTimeout(5);

        expect(createCalls).toEqual([{ id: '1', test: 'hi' }]);
        expect(updateRemote).toBeDefined();

        await updateRemote!({
            value: [{ id: '1', test: 'hi', createdAt: 1 }],
        });
        await promiseTimeout(50);

        expect(createCalls).toEqual([{ id: '1', test: 'hi' }]);
        expect(obs$.get()).toEqual({
            '1': { id: '1', test: 'hi', createdAt: 1 },
        });

        obs$['1'].test.set('hello');

        await promiseTimeout(0);
        await promiseTimeout(0);

        expect(updateCalls).toEqual([{ id: '1', test: 'hello', createdAt: 1 }]);
    });
    test('list refresh cancels queued create retry after a create failure', async () => {
        const createCalls: BasicValue[] = [];
        let rows: BasicValue[] = [];
        const obs$ = observable<Record<string, BasicValue>>(
            syncedCrud({
                list: () => {
                    return rows;
                },
                create: async (input: BasicValue) => {
                    createCalls.push(clone(input));
                    throw new Error('create failed');
                },
                onError: () => {},
                retry: {
                    infinite: true,
                    delay: 20,
                },
                as: 'object',
                fieldCreatedAt: 'createdAt',
                fieldUpdatedAt: 'updatedAt',
            }),
        );

        obs$['1'].set({ id: '1', test: 'hi' });

        await promiseTimeout(5);

        expect(createCalls).toEqual([{ id: '1', test: 'hi' }]);

        rows = [{ id: '1', test: 'hi', createdAt: 1 }];
        await syncState(obs$).sync();
        await promiseTimeout(50);

        expect(createCalls).toEqual([{ id: '1', test: 'hi' }]);
        expect(obs$.get()).toEqual({
            '1': { id: '1', test: 'hi', createdAt: 1 },
        });
    });
    test('get refresh cancels queued create retry after a create failure', async () => {
        const createCalls: BasicValue[] = [];
        let row: BasicValue | null = null;
        const obs$ = observable<BasicValue | undefined>(
            syncedCrud({
                get: () => {
                    return row;
                },
                create: async (input: BasicValue) => {
                    createCalls.push(clone(input));
                    throw new Error('create failed');
                },
                onError: () => {},
                retry: {
                    infinite: true,
                    delay: 20,
                },
                fieldCreatedAt: 'createdAt',
                fieldUpdatedAt: 'updatedAt',
            }),
        );

        obs$.set({ id: '1', test: 'hi' });

        await promiseTimeout(5);

        expect(createCalls).toEqual([{ id: '1', test: 'hi' }]);

        row = { id: '1', test: 'hi', createdAt: 1 };
        await syncState(obs$).sync();
        await promiseTimeout(50);

        expect(createCalls).toEqual([{ id: '1', test: 'hi' }]);
        expect(obs$.get()).toEqual({ id: '1', test: 'hi', createdAt: 1 });
    });
    test('pending create retry with transform.save uses latest transformed value', async () => {
        let shouldError = true;
        const createCalls: BasicValue[] = [];
        const updateCalls: BasicValue[] = [];
        const obs$ = observable<Record<string, BasicValue2>>(
            syncedCrud({
                list: () => {
                    return [] as BasicValue[];
                },
                create: async (input: BasicValue) => {
                    createCalls.push(clone(input));
                    if (shouldError) {
                        throw new Error('create failed');
                    }
                    return {
                        ...input,
                        createdAt: 2,
                        updatedAt: 2,
                    };
                },
                update: async (input: BasicValue) => {
                    updateCalls.push(clone(input));
                    return input;
                },
                onError: () => {},
                retry: {
                    infinite: true,
                    delay: 20,
                },
                as: 'object',
                transform: {
                    load: (value: BasicValue) =>
                        ({
                            id: value.id,
                            test2: value.test,
                            createdAt: value.createdAt,
                            updatedAt: value.updatedAt,
                        }) as BasicValue2,
                    save: (value: BasicValue2) =>
                        ({
                            id: value.id,
                            test: value.test2,
                            createdAt: value.createdAt,
                            updatedAt: value.updatedAt,
                        }) as BasicValue,
                },
            }),
        );

        obs$['1'].set({ id: '1', test2: 'hi' });

        await promiseTimeout(5);

        obs$['1'].test2.set('hello');
        shouldError = false;

        await promiseTimeout(100);

        expect(createCalls).toEqual([
            { id: '1', test: 'hi' },
            { id: '1', test: 'hello' },
        ]);
        expect(updateCalls).toEqual([{ id: '1', test: 'hello' }]);
        expect(obs$.get()).toEqual({
            '1': { id: '1', test2: 'hello', createdAt: 2, updatedAt: 2 },
        });
    });
});
describe('Hierarchical sync', () => {
    // TODO: Would be good to get this working with list
    // test('list can return observables with target as Promise with list', async () => {
    //     const obs$ = observable<Record<string, BasicValue>>(
    //         syncedCrud({
    //             list: async () => {
    //                 await promiseTimeout(1);
    //                 return [
    //                     { id: 'id1', test: 'hello' },
    //                     { id: 'id2', test: 'hi' },
    //                     { id: 'id3', test: 'hey' },
    //                 ];
    //             },
    //             as: 'object',
    //         }),
    //     );
    //     const odds$ = observable<Record<string, BasicValue>>(
    //         syncedCrud({
    //             list: () => {
    //                 return [obs$.id1, obs$.id3];
    //             },
    //             as: 'object',
    //         }),
    //     );
    //     // @ts-expect-error asdf
    //     getNode(odds$).___test = true;
    //     let latestValue = '';
    //     observe(() => {
    //         latestValue = odds$.id1.test.get();
    //         console.log(latestValue);
    //     });
    //     expect(latestValue).toEqual(undefined);
    //     await promiseTimeout(1);
    //     expect(latestValue).toEqual('hello');
    //     expect(odds$.get()).toEqual({
    //         id1: { id: 'id1', test: 'hello' },
    //         id3: { id: 'id3', test: 'hey' },
    //     });
    // });
    // test('child of a list has create', async () => {
    // // TODO: The purpose of this one is to have obs$ contain the list and odds$ to locally filter a subset and have the create/update on it
    //     const obs$ = observable<Record<string, BasicValue>>(
    //         syncedCrud({
    //             list: () => {
    //                 return promiseTimeout(0, [
    //                     { id: 'id1', test: 'hello' },
    //                     { id: 'id2', test: 'hi' },
    //                     { id: 'id3', test: 'hey' },
    //                 ]);
    //             },
    //             as: 'object',
    //         }),
    //     );
    //     const odds$ = observable<Record<string, BasicValue>>(
    //         syncedCrud({
    //             list: () => {
    //                 obs$.get();
    //                 return [obs$.id1, obs$.id3];
    //             },
    //             as: 'object',
    //         }),
    //     );
    //     odds$.get();
    //     await promiseTimeout(10);
    //     expect(odds$.get()).toEqual({
    //         id1: { id: 'id1', test: 'hello' },
    //         id3: { id: 'id3', test: 'hey' },
    //     });
    // });
});
describe('waitForSet', () => {
    test('crud waitForSet', async () => {
        const canSet$ = observable(false);
        let valueAtWaitForSet: BasicValue | undefined = undefined;
        let createValue: BasicValue | undefined = undefined;
        let typeAtWaitForSet: 'create' | 'update' | 'delete' | undefined = undefined;
        const obs$ = observable(
            syncedCrud({
                list: () => [] as BasicValue[],
                create: (value: BasicValue) => {
                    createValue = value;
                    return promiseTimeout(0, value);
                },
                as: 'object',
                waitForSet: ({ value, type }) => {
                    valueAtWaitForSet = value;
                    typeAtWaitForSet = type;
                    return canSet$;
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<Record<string, BasicValue>>();

        obs$.id1.set({ id: '1', test: 'hi' });

        await promiseTimeout(1);

        expect(valueAtWaitForSet).toEqual({ id: '1', test: 'hi' });

        canSet$.set(true);

        await promiseTimeout(1);

        expect(createValue).toEqual({ id: '1', test: 'hi' });
        expect(typeAtWaitForSet).toEqual('create');
    });
    test('crud waitForSet with array', async () => {
        const canSet$ = observable({ v1: false, v2: false });
        let valueAtWaitForSet: BasicValue | undefined = undefined;
        let createValue: BasicValue | undefined = undefined;
        let typeAtWaitForSet: 'create' | 'update' | 'delete' | undefined = undefined;
        const obs$ = observable(
            syncedCrud({
                list: () => [] as BasicValue[],
                create: (value: BasicValue) => {
                    createValue = value;
                    return promiseTimeout(0, value);
                },
                as: 'object',
                waitForSet: ({ value, type }) => {
                    valueAtWaitForSet = value;
                    typeAtWaitForSet = type;
                    return [canSet$.v1, canSet$.v2];
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<Record<string, BasicValue>>();

        obs$.id1.set({ id: '1', test: 'hi' });

        await promiseTimeout(1);

        expect(valueAtWaitForSet).toEqual({ id: '1', test: 'hi' });

        canSet$.v1.set(true);

        await promiseTimeout(1);

        expect(createValue).toEqual(undefined);

        canSet$.v2.set(true);

        await promiseTimeout(1);

        expect(createValue).toEqual({ id: '1', test: 'hi' });
        expect(typeAtWaitForSet).toEqual('create');
    });
    test('crud waitForSet with update gets full value', async () => {
        const canSet$ = observable(false);
        let valueAtWaitForSet: BasicValue | undefined = undefined;
        let updateValue: BasicValue | undefined = undefined;
        const obs$ = observable(
            syncedCrud({
                list: () => [{ ...ItemBasicValue(), other: 'z', other2: 'z2' }],
                update: (value: BasicValue) => {
                    updateValue = value;
                    return promiseTimeout(0, value);
                },
                updatePartial: true,
                as: 'object',
                waitForSet: ({ value }) => {
                    valueAtWaitForSet = value;
                    return canSet$;
                },
            }),
        );

        obs$.id1.test.set('hello');

        await promiseTimeout(1);

        expect(valueAtWaitForSet).toEqual({ id: 'id1', test: 'hello', other: 'z', other2: 'z2' });

        canSet$.set(true);

        await promiseTimeout(1);

        expect(updateValue).toEqual({ id: 'id1', test: 'hello' });
    });
});
describe('Error is set', () => {
    test('error is set if get fails', async () => {
        const obs$ = observable<BasicValue>(
            syncedCrud({
                get: () => {
                    // await promiseTimeout(1);
                    throw new Error('test');
                },
            }),
        );

        obs$.get();

        await promiseTimeout(1);

        expect(syncState(obs$).error.get()).toEqual(new Error('test'));
    });
    test('error is set if get fails async', async () => {
        const obs$ = observable<BasicValue>(
            syncedCrud({
                get: async () => {
                    await promiseTimeout(1);
                    throw new Error('test');
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<BasicValue>();

        obs$.get();

        await promiseTimeout(2);

        expect(syncState(obs$).error.get()).toEqual(new Error('test'));
    });
    test('error is set if create fails', async () => {
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'object',
                create: async () => {
                    throw new Error('test');
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<Record<string, BasicValue>>();

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        obs$.id2.set({ id: '2', test: 'hi' });

        await promiseTimeout(1);

        expect(syncState(obs$).error.get()).toEqual(new Error('test'));
    });
    test('error is set if create fails', async () => {
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'object',
                update: async () => {
                    throw new Error('test');
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<Record<string, BasicValue>>();

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        obs$.id1.test.set('hello');

        await promiseTimeout(1);

        expect(syncState(obs$).error.get()).toEqual(new Error('test'));
    });
    test('onError is called if create fails', async () => {
        let errorAtOnError: Error | undefined = undefined;
        let numErrors = 0;
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'object',
                create: async () => {
                    throw new Error('test');
                },
                onError: (error) => {
                    numErrors++;
                    errorAtOnError = error;
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<Record<string, BasicValue>>();

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        obs$.id2.set({ id: '2', test: 'hi' });

        await promiseTimeout(1);

        expect(errorAtOnError).toEqual(new Error('test'));
        expect(numErrors).toEqual(1);
    });
    test('onError can revert if create fails', async () => {
        let errorAtOnError: Error | undefined = undefined;
        let numErrors = 0;
        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue()]),
                as: 'object',
                create: async () => {
                    throw new Error('test');
                },
                onError: (error, params) => {
                    numErrors++;
                    errorAtOnError = error;
                    params.revert!();
                },
            }),
        );
        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<Record<string, BasicValue>>();

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        expect(obs$.get()).toEqual({ id1: { id: 'id1', test: 'hi' } });
        obs$.id2.set({ id: 'id2', test: 'hi' });

        await promiseTimeout(1);

        expect(errorAtOnError).toEqual(new Error('test'));
        expect(numErrors).toEqual(1);

        expect(obs$.get()).toEqual({ id1: { id: 'id1', test: 'hi' }, id2: undefined });
    });
    test('onError is called if list fails', async () => {
        let errorAtOnError: Error | undefined = undefined;
        let numErrors = 0;
        const obs$ = observable(
            syncedCrud({
                list: () => {
                    throw new Error('test');
                },
                as: 'object',
                onError: (error) => {
                    numErrors++;
                    errorAtOnError = error;
                },
            }),
        );

        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        expect(obs$.get()).toEqual(undefined);

        expect(errorAtOnError).toEqual(new Error('test'));
        expect(numErrors).toEqual(1);
    });
});
describe('soft delete', () => {
    test('soft delete', async () => {
        const persistName = getPersistName();

        const obs$ = observable(
            syncedCrud({
                list: () => promiseTimeout(0, [ItemBasicValue(), ItemBasicValue2()]),
                as: 'object',
                fieldDeleted: 'deleted',
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                },
            }),
        );

        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<Record<string, BasicValue>>();

        obs$.get();
        await promiseTimeout(1);

        const localValue = localStorage.getItem(persistName);

        // Should have saved to local storage
        expect(localValue).toBe('{"id1":{"id":"id1","test":"hi"},"id2":{"id":"id2","test":"hi2"}}');

        obs$['id2'].delete();

        await promiseTimeout(1);

        const localValue2 = localStorage.getItem(persistName);

        // Should have saved to local storage
        expect(localValue2).toBe('{"id1":{"id":"id1","test":"hi"}}');
    });
});
describe('Misc', () => {
    test('Plain hint applies to descendants', async () => {
        const obs$ = observable(
            ObservableHint.plain({
                a: {
                    b: {
                        c: {
                            d: 'hi',
                        },
                    },
                },
            }),
        );

        obs$.a.b.c.d.get();
        expect(getNode(obs$.a.b.c.d).isPlain).toEqual(true);
    });
    test('Logging syncState doesnt trigger list', async () => {
        let numLists = 0;
        let didCreateRun = false;
        const obs$ = observable(
            syncedCrud({
                list: () => {
                    numLists++;
                    return [{ id: 'hi', test: 'hi' } as BasicValue];
                },
                create: async (value, params) => {
                    didCreateRun = true;
                    params.refresh.name;
                },
                update: async (value, params) => {
                    didCreateRun = true;
                    params.refresh.name;
                },
            }),
        );

        expectTypeOf<(typeof obs$)['get']>().returns.toEqualTypeOf<Record<string, BasicValue>>();

        obs$.get();

        await promiseTimeout(0);

        expect(numLists).toEqual(1);
        obs$['id1'].set({ id: 'id1', test: 'hello' });
        await promiseTimeout(0);

        expect(didCreateRun).toEqual(true);
        expect(numLists).toEqual(1);
    });
    test('pending when a change is made before sync', async () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, '{"id":"id1","test":"hi"}');
        localStorage.setItem(
            persistName + '__m',
            '{"pending":{"":{"p":{"id":"id1","test":"hello"},"t":[],"v":{"id":"id1","test":"hi"}}}}',
        );
        const obs$ = observable<{ test: string }>({ test: '' });
        const canSync$ = observable(false);
        const saved: { id: string; test: string }[] = [];
        syncObservable(
            obs$,
            syncedCrud({
                get: () => {
                    if (canSync$.get()) {
                        return { id: 'id1', test: 'test' };
                    } else {
                        throw new Error('test error');
                    }
                },
                update: async (value: any) => {
                    saved.push(value);
                },
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                    retrySync: true,
                },
                retry: {
                    delay: 1,
                    times: 2,
                },
                mode: 'merge',
            }),
        );

        expect(obs$.get()).toEqual({ id: 'id1', test: 'hi' });

        obs$.test.set('hi2');

        await promiseTimeout(10);

        // Setting hi2 should have cached it to pending
        expect(localStorage.getItem(persistName + '__m')!).toEqual(
            JSON.stringify({
                pending: {
                    '': {
                        p: { id: 'id1', test: 'hello' },
                        t: [],
                        v: { id: 'id1', test: 'hi2' },
                        c: true,
                    },
                },
            }),
        );

        await promiseTimeout(1);

        // It should not save until it's loaded
        expect(saved.length).toEqual(0);

        canSync$.set(true);

        await promiseTimeout(1);

        // Once loaded it should save it once
        expect(saved).toEqual([{ id: 'id1', test: 'hi2' }]);
    });
    // TODO: Non-merge mode shouldn't save pending in the same way?
    // test('pending when a create is made before sync', async () => {
    //     const persistName = getPersistName();
    //     localStorage.setItem(persistName, '{"id1":{"id":"id1","test":"hi"}}');
    //     localStorage.setItem(
    //         persistName + '__m',
    //         JSON.stringify({
    //             pending: {
    //                 id1: { p: undefined, t: [], v: { id: 'id1', test: 'hi' } },
    //             },
    //         }),
    //     );
    //     const obs$ = observable<Record<string, BasicValue>>();
    //     const canSync$ = observable(false);
    //     const created: { id: string; test: string }[] = [];
    //     const updated: { id: string; test: string }[] = [];
    //     syncObservable(
    //         obs$,
    //         syncedCrud({
    //             list: () => {
    //                 if (canSync$.get()) {
    //                     return [{ id: 'id1', test: 'test' }];
    //                 } else {
    //                     throw new Error('test error');
    //                 }
    //             },
    //             create: async (value: any) => {
    //                 created.push(value);
    //             },
    //             update: async (value: any) => {
    //                 updated.push(value);
    //             },
    //             persist: {
    //                 name: persistName,
    //                 plugin: ObservablePersistLocalStorage,
    //                 retrySync: true,
    //             },
    //             retry: {
    //                 delay: 1,
    //                 times: 2,
    //             },
    //         }),
    //     );

    //     expect(obs$.get()).toEqual({ id1: { id: 'id1', test: 'hi' } });

    //     obs$['id2'].set({ id: 'id2', test: 'hi2' });

    //     await promiseTimeout(0);

    //     // Setting hi2 should have cached it to pending
    //     expect(localStorage.getItem(persistName + '__m')!).toEqual(
    //         JSON.stringify({
    //             pending: {
    //                 id1: {
    //                     t: [],
    //                     v: {
    //                         id: 'id1',
    //                         test: 'hi',
    //                     },
    //                 },
    //                 id2: {
    //                     p: null,
    //                     t: ['object'],
    //                     v: {
    //                         id: 'id2',
    //                         test: 'hi2',
    //                     },
    //                 },
    //             },
    //         }),
    //     );

    //     await promiseTimeout(1);

    //     // It should not save until it's loaded
    //     expect(created.length).toEqual(0);
    //     expect(updated.length).toEqual(0);

    //     canSync$.set(true);

    //     await promiseTimeout(1);

    //     expect(localStorage.getItem(persistName + '__m')!).toEqual(
    //         JSON.stringify({
    //             pending: {
    //                 id1: {
    //                     t: [],
    //                     v: {
    //                         id: 'id1',
    //                         test: 'hi',
    //                     },
    //                 },
    //                 id2: {
    //                     p: null,
    //                     t: ['object'],
    //                     v: {
    //                         id: 'id2',
    //                         test: 'hi2',
    //                     },
    //                 },
    //             },
    //         }),
    //     );

    //     // Once loaded it should save it once
    //     expect(created).toEqual([]);
    //     expect(updated).toEqual([{ id: 'id1', test: 'hi' }]);
    // });
    test('pending when a create is made before sync with mode merge', async () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, '{"id1":{"id":"id1","test":"hi"}}');
        localStorage.setItem(
            persistName + '__m',
            JSON.stringify({
                pending: {
                    id1: { p: undefined, t: [], v: { id: 'id1', test: 'hi' } },
                },
            }),
        );
        const obs$ = observable<Record<string, BasicValue>>();
        const canSync$ = observable(false);
        const created: { id: string; test: string }[] = [];
        const updated: { id: string; test: string }[] = [];
        syncObservable(
            obs$,
            syncedCrud({
                list: () => {
                    if (canSync$.get()) {
                        return [{ id: 'id1', test: 'test' }];
                    } else {
                        throw new Error('test error');
                    }
                },
                create: async (value: any) => {
                    created.push(value);
                },
                update: async (value: any) => {
                    updated.push(value);
                },
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                    retrySync: true,
                },
                retry: {
                    delay: 1,
                    times: 2,
                },
                mode: 'merge',
            }),
        );

        expect(obs$.get()).toEqual({ id1: { id: 'id1', test: 'hi' } });

        obs$['id2'].set({ id: 'id2', test: 'hi2' });

        await promiseTimeout(0);

        // Setting hi2 should have cached it to pending
        expect(localStorage.getItem(persistName + '__m')!).toEqual(
            JSON.stringify({
                pending: {
                    id1: {
                        t: [],
                        v: {
                            id: 'id1',
                            test: 'hi',
                        },
                        c: true,
                    },
                    id2: {
                        p: null,
                        t: ['object'],
                        h: [],
                        v: {
                            id: 'id2',
                            test: 'hi2',
                        },
                        c: true,
                    },
                },
            }),
        );

        await promiseTimeout(1);

        // It should not save until it's loaded
        expect(created.length).toEqual(0);
        expect(updated.length).toEqual(0);

        canSync$.set(true);

        await promiseTimeout(1);

        // Once loaded it should save it once
        expect(created).toEqual([{ id: 'id2', test: 'hi2' }]);
        expect(updated).toEqual([{ id: 'id1', test: 'hi' }]);
    });
    test('pending when an update is made before sync', async () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, '{"id1":{"id":"id1","test":"hi"}}');
        localStorage.setItem(
            persistName + '__m',
            JSON.stringify({
                pending: {
                    id1: { p: undefined, t: [], v: { id: 'id1', test: 'hi' } },
                },
            }),
        );
        const obs$ = observable<Record<string, BasicValue>>();
        const canSync$ = observable(false);
        const created: { id: string; test: string }[] = [];
        const updated: { id: string; test: string }[] = [];
        syncObservable(
            obs$,
            syncedCrud({
                list: () => {
                    if (canSync$.get()) {
                        return [{ id: 'id1', test: 'test' }];
                    } else {
                        throw new Error('test error');
                    }
                },
                create: async (value: any) => {
                    created.push(value);
                },
                update: async (value: any) => {
                    updated.push(value);
                },
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                    retrySync: true,
                },
                retry: {
                    delay: 1,
                    times: 2,
                },
            }),
        );

        expect(obs$.get()).toEqual({ id1: { id: 'id1', test: 'hi' } });

        obs$['id1'].test.set('hi2');

        await promiseTimeout(0);

        // Setting hi2 should have cached it to pending
        expect(localStorage.getItem(persistName + '__m')!).toEqual(
            JSON.stringify({
                pending: {
                    id1: {
                        t: [],
                        v: {
                            id: 'id1',
                            test: 'hi2',
                        },
                        c: true,
                    },
                },
            }),
        );

        await promiseTimeout(1);

        // It should not save until it's loaded
        expect(created.length).toEqual(0);
        expect(updated.length).toEqual(0);

        canSync$.set(true);

        await promiseTimeout(1);

        // Once loaded it should save it once
        expect(created.length).toEqual(0);
        expect(updated).toEqual([{ id: 'id1', test: 'hi2' }]);
    });
});
describe('fieldId', () => {
    test('fieldId with all CRUD operations', async () => {
        // Setup variables to track CRUD operations
        let created = undefined;
        let updated = undefined;
        let deleted = undefined;

        // Create the observable with syncedCrud using fieldId
        const obs$ = observable(
            syncedCrud({
                list: () =>
                    promiseTimeout(0, [
                        { test_id: 'item1', content: 'hello' },
                        { test_id: 'item2', content: 'world' },
                    ]),
                as: 'object',
                fieldId: 'test_id',
                create: async (input) => {
                    created = clone(input);
                    return input;
                },
                update: async (input) => {
                    updated = clone(input);
                    return input;
                },
                delete: async (input) => {
                    deleted = input;
                },
            }),
        );

        // Check initial state
        expect(obs$.get()).toEqual(undefined);

        // Wait for list to complete
        await promiseTimeout(1);

        // Check that list works with fieldId
        expect(obs$.get()).toEqual({
            item1: { test_id: 'item1', content: 'hello' },
            item2: { test_id: 'item2', content: 'world' },
        });

        // Check that we can access by the ID
        expect(obs$.item1.get()).toEqual({ test_id: 'item1', content: 'hello' });
        expect(obs$.item1.content.get()).toEqual('hello');

        // Test updating an item
        obs$.item1.content.set('updated');

        await promiseTimeout(1);

        // Verify update with custom fieldId
        expect(updated).toEqual({ test_id: 'item1', content: 'updated' });
        expect(obs$.get()).toEqual({
            item1: { test_id: 'item1', content: 'updated' },
            item2: { test_id: 'item2', content: 'world' },
        });

        // Test creating a new item
        obs$.item3.set({ test_id: 'item3', content: 'new item' });

        await promiseTimeout(1);

        // Verify create with custom fieldId
        expect(created).toEqual({ test_id: 'item3', content: 'new item' });
        expect(obs$.get()).toEqual({
            item1: { test_id: 'item1', content: 'updated' },
            item2: { test_id: 'item2', content: 'world' },
            item3: { test_id: 'item3', content: 'new item' },
        });

        // Test deleting an item
        obs$.item2.delete();

        await promiseTimeout(1);

        // Verify delete with custom fieldId
        expect(deleted).toEqual({ test_id: 'item2', content: 'world' });
        expect(obs$.get()).toEqual({
            item1: { test_id: 'item1', content: 'updated' },
            item3: { test_id: 'item3', content: 'new item' },
        });
    });

    test('list function is responsive to observables changing', async () => {
        // Track how many times list is called
        let listCallCount = 0;

        // Create an observable that will be used in the list function
        const filter$ = observable('item1');

        // Create the crud observable with a list function that uses filter$
        const obs$ = observable(
            syncedCrud({
                list: () => {
                    listCallCount++;
                    const filterValue = filter$.get();
                    return promiseTimeout(
                        0,
                        [
                            { test_id: 'item1', content: 'hello' },
                            { test_id: 'item2', content: 'world' },
                        ].filter((item) => item.test_id === filterValue || filterValue === 'all'),
                    );
                },
                as: 'object',
                fieldId: 'test_id',
            }),
        );

        // Set up an observer to watch for changes
        const dispose = observe(() => obs$.get());

        // Check initial state - should only have item1 since filter$ is 'item1'
        expect(obs$.get()).toEqual(undefined);

        await promiseTimeout(1);

        // Verify list was called and filtered properly
        expect(listCallCount).toEqual(1);
        expect(obs$.get()).toEqual({
            item1: { test_id: 'item1', content: 'hello' },
        });

        // Change the filter observable to get all items
        filter$.set('all');

        await promiseTimeout(1);

        // Verify that list was called again and we now have all items
        expect(listCallCount).toEqual(2);
        expect(obs$.get()).toEqual({
            item1: { test_id: 'item1', content: 'hello' },
            item2: { test_id: 'item2', content: 'world' },
        });

        // Clean up the observer
        dispose();
    });
});
describe('generateId', () => {
    test('generateId value', async () => {
        let saved: any;
        const obs$ = observable(
            syncedCrud({
                as: 'array',
                generateId: () => 'id2',
                onSaved(params) {
                    saved = params.saved;
                },
                create: async (input) => input,
            }),
        );
        await promiseTimeout(1);
        obs$.push({ test: 'hello', id: undefined });
        await promiseTimeout(1);
        const value = obs$.peek();
        expect(saved).toEqual({ id: 'id2', test: 'hello' }); // fails, saved remains undefined
        expect(value).toEqual([{ id: 'id2', test: 'hello' }]); // fails, saved remains undefined
    });
    test('generateId array set', async () => {
        let saved: any;
        const obs$ = observable(
            syncedCrud({
                as: 'array',
                generateId: () => 'id2',
                onSaved(params) {
                    saved = params.saved;
                },
                create: async (input) => input,
            }),
        );
        await promiseTimeout(1);
        obs$.set([{ test: 'hello', id: undefined }]);
        await promiseTimeout(1);
        const value = obs$.peek();
        expect(value).toEqual([{ test: 'hello', id: 'id2' }]); // fails, saved remains undefined
        expect(saved).toEqual({ id: 'id2', test: 'hello' }); // fails, saved remains undefined
    });
    test('generateId array', async () => {
        let saved: any;
        const obs$ = observable(
            syncedCrud({
                as: 'array',
                generateId: () => 'id2',
                onSaved(params) {
                    saved = params.saved;
                },
                create: async (input) => input,
            }),
        );
        await promiseTimeout(1);
        obs$.push({ test: 'hello', id: undefined });
        await promiseTimeout(1);
        const value = obs$.peek();
        expect(saved).toEqual({ id: 'id2', test: 'hello' }); // fails, saved remains undefined
        expect(value).toEqual([{ id: 'id2', test: 'hello' }]); // fails, saved remains undefined
    });
});

const releaseTick = () => promiseTimeout(1);
for (const kind of ['Map', 'Set'] as const)
    test(`release regression: root replacement must save changed ${kind} inside array`, async () => {
        const value = (x: number) => (kind === 'Map' ? new Map([['x', x]]) : new Set([x]));
        const calls: any[] = [];
        const obs: any = observable(
            syncedCrud<any>({
                as: 'object',
                list: async () => [{ id: 'id1', list: [value(1)] }],
                update: async (input) => {
                    calls.push(input);
                    return undefined;
                },
            }),
        );
        obs.get();
        await releaseTick();
        obs.set({ id1: { id: 'id1', list: [value(2)] } });
        await releaseTick();
        expect(calls.length).toBe(1);
    });

for (const kind of ['Map', 'Set'] as const)
    test(`release regression: response must preserve newer ${kind} edit while sync disabled`, async () => {
        let release!: (v: any) => void;
        const value = (x: number) => (kind === 'Map' ? new Map([['x', x]]) : new Set([x]));
        const obs: any = observable(
            syncedCrud<any>({
                as: 'object',
                list: async () => [{ id: 'id1', test: 'old', payload: value(1) }],
                update: () => new Promise((r) => (release = r)),
            }),
        );
        obs.get();
        await releaseTick();
        obs.id1.test.set('sent');
        await releaseTick();
        syncState(obs).isSyncEnabled.set(false);
        if (kind === 'Map') obs.id1.payload.set('x', 2);
        else obs.id1.payload.delete(1);
        await releaseTick();
        release({ id: 'id1', test: 'sent', payload: value(1) });
        await releaseTick();
        if (kind === 'Map') expect(obs.id1.payload.peek().get('x')).toBe(2);
        else expect(obs.id1.payload.peek().has(1)).toBe(false);
    });

test('release regression: Map mode overlapping saves must retain plain JSON array', async () => {
    const calls: any[] = [];
    const releases: ((v: any) => void)[] = [];
    const obs: any = observable(
        syncedCrud<any, any, any>({
            as: 'Map',
            list: async () => [{ id: 'id1', list: [{ x: 0 }] }],
            update: (input) => {
                calls.push(structuredClone(input));
                return new Promise((r) => releases.push(r));
            },
        }),
    );
    obs.get();
    await releaseTick();
    obs.id1.list.set([{ x: 1 }]);
    await releaseTick();
    obs.id1.list.set([{ x: 2 }]);
    await releaseTick();
    expect(calls.length).toBe(2);
    releases[0](calls[0]);
    await releaseTick();
    releases[1](calls[1]);
    await releaseTick();
    expect(obs.id1.peek().list).toEqual([{ x: 2 }]);
});

test('release regression: transformed input must not match unrelated newer subscription local value', async () => {
    let release!: (v: any) => void;
    let push!: (v: any) => void;
    let sent: any;
    const obs: any = observable(
        syncedCrud<any>({
            as: 'object',
            list: async () => [{ id: 'id1', test: 'old', values: [20] }],
            subscribe: (params) => {
                push = params.update;
            },
            transform: {
                load: (row) => ({ ...row, ...(row.values ? { values: row.values.map((x: number) => x / 2) } : {}) }),
                save: (row) => ({ ...row, ...(row.values ? { values: row.values.map((x: number) => x * 2) } : {}) }),
            },
            update: (input) => {
                sent = structuredClone(input);
                return new Promise((r) => (release = r));
            },
        }),
    );
    obs.get();
    await releaseTick();
    expect(obs.id1.peek().values).toEqual([10]);
    obs.id1.test.set('sent');
    await releaseTick();
    expect(sent.values).toEqual([20]);
    push({ value: [{ id: 'id1', values: [40] }], mode: 'merge' });
    await releaseTick();
    expect(obs.id1.peek().values).toEqual([20]);
    release(sent);
    await releaseTick();
    expect(obs.id1.peek().values).toEqual([20]);
});

describe('seeded CRUD response sequences', () => {
    type Row = {
        id: string;
        value: number;
        list: { x: number }[];
        remote?: { x: number }[];
        updatedAt?: number;
        createdAt?: number;
    };
    const modes = ['object', 'array', 'Map', 'value'] as const;
    const getRow = (obs: any, as: (typeof modes)[number]) => (as === 'value' ? obs : as === 'array' ? obs[0] : obs.id1);
    const transform = {
        save: (row: Partial<Row>) => ({
            ...row,
            ...(row.value !== undefined ? { value: row.value * 2 } : {}),
            ...(row.list ? { list: row.list.map(({ x }) => ({ x: x * 2 })) } : {}),
            ...(row.remote ? { remote: row.remote.map(({ x }) => ({ x: x * 2 })) } : {}),
        }),
        load: (row: Partial<Row>) => ({
            ...row,
            ...(row.value !== undefined ? { value: row.value / 2 } : {}),
            ...(row.list ? { list: row.list.map(({ x }) => ({ x: x / 2 })) } : {}),
            ...(row.remote ? { remote: row.remote.map(({ x }) => ({ x: x / 2 })) } : {}),
        }),
    };
    for (const as of modes)
        for (const transformed of [false, true]) {
            for (const timestamps of [false, true])
                for (const incremental of [false, true]) {
                    test(`${as} transforms=${transformed} timestamps=${timestamps} changesSince=${incremental}`, async () => {
                        await fc.assert(
                            fc.asyncProperty(
                                fc.array(
                                    fc.record({
                                        kind: fc.integer({ min: 0, max: 4 }),
                                        value: fc.integer({ min: 1, max: 1000 }),
                                    }),
                                    { minLength: 5, maxLength: 10 },
                                ),
                                async (commands) => {
                                    let clock = 1;
                                    const initial: Row = {
                                        id: 'id1',
                                        value: 0,
                                        list: [{ x: 0 }],
                                        remote: [{ x: 0 }],
                                        ...(timestamps ? { updatedAt: clock, createdAt: 1 } : {}),
                                    };
                                    let server = structuredClone(initial);
                                    let deleted = false;
                                    let retryCreate = commands[0].value % 2 === 0;
                                    const expected = structuredClone(initial);
                                    let push!: (params: any) => void;
                                    const pending: { resolve: (row: any) => void; response: Row }[] = [];
                                    const encode = (row: Row) =>
                                        transformed ? (transform.save(row) as Row) : structuredClone(row);
                                    const decode = (row: Row) =>
                                        transformed ? (transform.load(row) as Row) : structuredClone(row);
                                    const obs: any = observable(
                                        syncedCrud<any, any, any>({
                                            as,
                                            fieldUpdatedAt: timestamps ? 'updatedAt' : undefined,
                                            fieldCreatedAt: timestamps ? 'createdAt' : undefined,
                                            changesSince: incremental ? 'last-sync' : 'all',
                                            // This server returns updated existing rows; array's default append is for streams.
                                            mode: as === 'array' && incremental ? 'merge' : undefined,
                                            updatePartial: incremental,
                                            transform: transformed ? transform : undefined,
                                            list: async () => (deleted ? [] : [encode(server)]),
                                            retry: { times: 2, delay: 1, backoff: 'constant' },
                                            create: async (input) => {
                                                if (retryCreate) {
                                                    retryCreate = false;
                                                    throw Error('seeded create retry');
                                                }
                                                deleted = false;
                                                server = {
                                                    ...decode(input),
                                                    ...(timestamps ? { createdAt: ++clock, updatedAt: clock } : {}),
                                                };
                                                const response = encode(server);
                                                return new Promise((resolve) => pending.push({ resolve, response }));
                                            },
                                            delete: async () => {
                                                deleted = true;
                                            },
                                            subscribe: (params) => {
                                                push = params.update;
                                            },
                                            update: (input) => {
                                                server = {
                                                    ...server,
                                                    ...decode(input as Row),
                                                    ...(timestamps ? { updatedAt: ++clock } : {}),
                                                };
                                                const response = encode(server);
                                                return new Promise((resolve) => pending.push({ resolve, response }));
                                            },
                                        }),
                                    );
                                    obs.get();
                                    await releaseTick();
                                    const check = () => {
                                        const actual = getRow(obs, as).peek();
                                        expect(actual.value).toBe(expected.value);
                                        expect(actual.list).toEqual(expected.list);
                                        expect(actual.remote).toEqual(expected.remote);
                                    };
                                    // Two edits guarantee overlapping requests even when generated commands only subscribe/settle.
                                    for (const value of [1, 2]) {
                                        expected.value = value;
                                        getRow(obs, as).value.set(value);
                                        await releaseTick();
                                    }
                                    for (const command of commands) {
                                        const row = getRow(obs, as);
                                        if (command.kind === 0) {
                                            expected.value = command.value;
                                            row.value.set(command.value);
                                        } else if (command.kind === 1) {
                                            expected.list = [{ x: command.value }];
                                            row.list.set(structuredClone(expected.list));
                                        } else if (command.kind === 2) {
                                            server.remote = [{ x: command.value }];
                                            expected.remote = structuredClone(server.remote);
                                            if (timestamps) server.updatedAt = ++clock;
                                            push({
                                                value: [
                                                    {
                                                        id: 'id1',
                                                        remote: encode(server).remote,
                                                        ...(timestamps ? { updatedAt: server.updatedAt } : {}),
                                                    },
                                                ],
                                                mode: 'merge',
                                            });
                                        } else if (pending.length) {
                                            const index = command.value % pending.length;
                                            const [request] = pending.splice(index, 1);
                                            request.resolve(request.response);
                                        }
                                        await releaseTick();
                                        check();
                                    }
                                    // Final edit transmits the latest state; random completion order must not roll it back.
                                    expected.value = 1001;
                                    getRow(obs, as).value.set(expected.value);
                                    await releaseTick();
                                    while (pending.length) {
                                        const [request] = pending.splice(commands.length % pending.length, 1);
                                        request.resolve(request.response);
                                        await releaseTick();
                                        check();
                                    }
                                    expect(syncState(obs).numPendingSets.peek()).toBe(0);
                                    expect(getRow(obs, as).peek().value).toBe(server.value);
                                    expect(getRow(obs, as).peek().list).toEqual(server.list);
                                    if (timestamps) expect(getRow(obs, as).peek().updatedAt).toBe(server.updatedAt);
                                    await syncState(obs).sync();
                                    await releaseTick();
                                    const serverSnapshot = () =>
                                        as === 'value'
                                            ? server
                                            : as === 'array'
                                              ? [server]
                                              : as === 'Map'
                                                ? new Map([['id1', server]])
                                                : { id1: server };
                                    expect(clone(obs.peek())).toEqual(serverSnapshot());
                                    // Exercise deletion/recreation and a seeded transport failure in every configuration.
                                    if (as === 'value') obs.set(null);
                                    else if (as === 'array') obs.splice(0, 1);
                                    else obs.id1.delete();
                                    await releaseTick();
                                    expect(deleted).toBe(true);
                                    const recreated = {
                                        id: 'id1',
                                        value: commands[0].value + 2000,
                                        list: [{ x: commands[1].value }],
                                        remote: [{ x: 0 }],
                                    };
                                    Object.assign(expected, recreated);
                                    if (as === 'value') obs.set(recreated);
                                    else if (as === 'array') obs.push(recreated);
                                    else obs.id1.set(recreated);
                                    for (let i = 0; pending.length === 0 && i < 20; i++) await releaseTick();
                                    expect(pending.length).toBe(1);
                                    expect(deleted).toBe(false);
                                    pending.shift()!.resolve(encode(server));
                                    await releaseTick();
                                    check();
                                    expect(clone(obs.peek())).toEqual(serverSnapshot());
                                    expect(syncState(obs).numPendingSets.peek()).toBe(0);
                                    expect(syncState(obs).getPendingChanges()).toEqual({});
                                },
                            ),
                            { seed: 606410, numRuns: 6, endOnFailure: true },
                        );
                    });
                }
            test(`${as} transformed=${transformed}: create retry snapshot, remote input, update retry and delete`, async () => {
                let push!: (params: any) => void;
                const attempts: { input: Row; resolve: (row: any) => void; reject: (error: Error) => void }[] = [];
                const savedInputs: any[] = [];
                let deleted = false;
                const save = (input: any) =>
                    new Promise<any>((resolve, reject) =>
                        attempts.push({ input: structuredClone(input), resolve, reject }),
                    );
                const obs: any = observable(
                    syncedCrud<any, any, any>({
                        as,
                        list: async () => [],
                        create: save,
                        update: save,
                        delete: async () => {
                            deleted = true;
                        },
                        retry: { times: 2, delay: 1, backoff: 'constant' },
                        transform: transformed ? transform : undefined,
                        subscribe: (params) => {
                            push = params.update;
                        },
                        onSaved: ({ input }) => {
                            savedInputs.push(structuredClone(input));
                        },
                    }),
                );
                obs.get();
                await releaseTick();
                const initial: Row = { id: 'id1', value: 10, list: [{ x: 10 }] };
                if (as === 'value') obs.set(initial);
                else if (as === 'array') obs.push(initial);
                else obs.id1.set(initial);
                await releaseTick();
                attempts[0].reject(Error('retry create'));
                getRow(obs, as).value.set(11);
                getRow(obs, as).list.set([{ x: 11 }]);
                // Retry scheduling has a short delay; bounded polling checks the real attempt, not a fixed timing guess.
                for (let i = 0; attempts.length < 2 && i < 20; i++) await releaseTick();
                expect(attempts.length).toBe(2);
                expect(attempts[1].input.value).toBe(transformed ? 22 : 11);
                getRow(obs, as).list.set([{ x: 22 }]);
                await releaseTick();
                attempts[1].resolve(attempts[1].input);
                await releaseTick();
                expect(getRow(obs, as).peek().list).toEqual([{ x: 22 }]);
                expect(savedInputs[0]).toEqual(attempts[1].input);
                for (let i = 2; i < attempts.length; i++) {
                    attempts[i].resolve(attempts[i].input);
                    await releaseTick();
                }
                expect(getRow(obs, as).peek().list).toEqual([{ x: 22 }]);
                expect(syncState(obs).numPendingSets.peek()).toBe(0);
                const before = attempts.length;
                getRow(obs, as).value.set(12);
                await releaseTick();
                expect(attempts.length).toBe(before + 1);
                attempts[before].reject(Error('retry update'));
                for (let i = 0; attempts.length < before + 2 && i < 20; i++) await releaseTick();
                expect(attempts.length).toBe(before + 2);
                push({ value: [{ id: 'id1', list: [{ x: transformed ? 88 : 44 }] }], mode: 'merge' });
                await releaseTick();
                attempts[before + 1].resolve(attempts[before + 1].input);
                await releaseTick();
                expect(getRow(obs, as).peek().list).toEqual([{ x: 44 }]);
                expect(savedInputs[savedInputs.length - 1]).toEqual(attempts[before + 1].input);
                getRow(obs, as).value.set(13);
                await releaseTick();
                const late = attempts[attempts.length - 1];
                if (as === 'value') obs.set(null);
                else if (as === 'array') obs.splice(0, 1);
                else obs.id1.delete();
                await releaseTick();
                expect(deleted).toBe(true);
                late.resolve(late.input);
                await releaseTick();
                expect(as === 'value' ? obs.peek() : as === 'array' ? obs.peek().length : getRow(obs, as).peek()).toBe(
                    as === 'value' ? null : as === 'array' ? 0 : undefined,
                );
            });
        }
});

describe('CRUD adjacent invariants', () => {
    test.each([0, false, '', null, undefined])('value mode updates an existing falsy field (%s)', async (value) => {
        const creates: any[] = [];
        const updates: any[] = [];
        const obs: any = observable(
            syncedCrud<any>({
                as: 'value',
                get: async () => ({ id: 'id1', value }),
                create: async (input) => {
                    creates.push(input);
                    return input;
                },
                update: async (input) => {
                    updates.push(input);
                    return input;
                },
            }),
        );
        obs.get();
        await releaseTick();
        obs.value.set('edited');
        await releaseTick();
        expect(creates).toHaveLength(0);
        expect(updates).toHaveLength(1);
        expect(updates[0].value).toBe('edited');
    });
    test('onSaved distinguishes creates from updates', async () => {
        const kinds: boolean[] = [];
        const obs = observable(
            syncedCrud({
                as: 'value',
                create: async (input: { id: string; value: number }) => input,
                update: async (input) => input,
                onSaved: ({ isCreate }) => {
                    kinds.push(isCreate);
                },
            }),
        );
        obs.set({ id: 'id1', value: 1 });
        await releaseTick();
        obs.value.set(2);
        await releaseTick();
        expect(kinds).toEqual([true, false]);
    });
    test('Map root replacement deletes the removed row', async () => {
        const deleted: any[] = [];
        const obs = observable(
            syncedCrud({
                as: 'Map',
                list: async () => [{ id: 'id1', value: 1 }],
                delete: async (input) => {
                    deleted.push(input);
                },
            }),
        );
        obs.get();
        await releaseTick();
        obs.set(new Map());
        await releaseTick();
        expect(deleted).toEqual([{ id: 'id1', value: 1 }]);
        expect(syncState(obs).error.peek()).toBeUndefined();
    });
});

for (const as of ['object', 'array', 'Map', 'value'] as const) {
    test(`${as}: batched partial fields are all saved and acknowledged`, async () => {
        const inputs: any[] = [];
        const obs: any = observable(
            syncedCrud<any, any, any>({
                as,
                list: async () => [{ id: 'id1', a: 1, b: 1, updatedAt: 1 }],
                updatePartial: true,
                fieldUpdatedAt: 'updatedAt',
                update: async (input) => {
                    inputs.push(structuredClone(input));
                    return input;
                },
            }),
        );
        obs.get();
        await releaseTick();
        const row = as === 'value' ? obs : as === 'array' ? obs[0] : obs.id1;
        batch(() => {
            row.a.set(2);
            row.b.set(3);
        });
        await releaseTick();
        expect(inputs).toEqual([{ id: 'id1', a: 2, b: 3 }]);
        expect(syncState(obs).getPendingChanges()).toEqual({});
    });
}

test.each([false, true])(
    'onSaved cannot mutate the local comparison snapshot through its remote input (transform=%s)',
    async (transformed) => {
        let resolve!: (row: any) => void;
        const obs: any = observable(
            syncedCrud<any>({
                as: 'object',
                transform: transformed ? { save: (row) => ({ ...row }), load: (row) => ({ ...row }) } : undefined,
                list: async () => [{ id: 'id1', value: 1, list: [1] }],
                update: () =>
                    new Promise((r) => {
                        resolve = r;
                    }),
                onSaved: ({ input }) => {
                    input.list = [2];
                },
            }),
        );
        obs.get();
        await releaseTick();
        obs.id1.value.set(2);
        await releaseTick();
        syncState(obs).isSyncEnabled.set(false);
        obs.id1.list.set([2]);
        resolve({ id: 'id1', value: 2, list: [1] });
        await releaseTick();
        expect(obs.id1.peek().list).toEqual([2]);
    },
);

test('create from a partial update sends the complete local row', async () => {
    const inputs: any[] = [];
    const obs: any = observable(
        syncedCrud<any>({
            as: 'object',
            list: async () => [{ id: 'id1', a: 1, b: 1 }],
            fieldCreatedAt: 'createdAt',
            updatePartial: true,
            create: async (input) => {
                inputs.push(structuredClone(input));
                return { ...input, createdAt: 1 };
            },
        }),
    );
    obs.get();
    await releaseTick();
    obs.id1.a.set(2);
    await releaseTick();
    expect(inputs).toEqual([{ id: 'id1', a: 2, b: 1 }]);
});

test('Map pending overlay retains a newer array when an older response normalizes another field', async () => {
    const requests: { input: any; resolve: (row: any) => void }[] = [];
    const obs: any = observable(
        syncedCrud<any, any, 'Map'>({
            as: 'Map',
            list: async () => [{ id: 'id1', scalar: 'old', list: [{ x: 0 }] }],
            update: (input) => new Promise((resolve) => requests.push({ input: structuredClone(input), resolve })),
        }),
    );
    obs.get();
    await releaseTick();
    obs.id1.scalar.set('sent');
    await releaseTick();
    obs.id1.list.set([{ x: 2 }]);
    await releaseTick();
    expect(requests).toHaveLength(2);
    requests[0].resolve({ ...requests[0].input, scalar: 'normalized' });
    await releaseTick();
    expect(obs.id1.peek()).toEqual({ id: 'id1', scalar: 'normalized', list: [{ x: 2 }] });
    requests[1].resolve(requests[1].input);
    await releaseTick();
    expect(obs.id1.peek()).toEqual({ id: 'id1', scalar: 'normalized', list: [{ x: 2 }] });
});

for (const as of ['object', 'array', 'Map', 'value'] as const) {
    test(`${as}: latest overlapping save normalization reaches the local array`, async () => {
        const requests: { input: any; resolve: (row: any) => void }[] = [];
        const obs: any = observable(
            syncedCrud<any, any, any>({
                as,
                list: async () => [{ id: 'id1', list: [{ x: 0 }] }],
                update: (input) => new Promise((resolve) => requests.push({ input: structuredClone(input), resolve })),
            }),
        );
        obs.get();
        await releaseTick();
        const row = as === 'value' ? obs : as === 'array' ? obs[0] : obs.id1;
        row.list.set([{ x: 1 }]);
        await releaseTick();
        row.list.set([{ x: 2 }]);
        await releaseTick();
        expect(requests).toHaveLength(2);
        requests[0].resolve({ ...requests[0].input, list: [{ x: 100 }] });
        await releaseTick();
        expect(row.peek().list).toEqual([{ x: 2 }]);
        requests[1].resolve({ ...requests[1].input, list: [{ x: 200 }] });
        await releaseTick();
        expect(row.peek().list).toEqual([{ x: 200 }]);
        expect(syncState(obs).getPendingChanges()).toEqual({});
    });
}

for (const as of ['object', 'array', 'Map', 'value'] as const) {
    test(`${as}: deleting the collection root during a save ignores the late response`, async () => {
        let resolve!: (row: any) => void;
        let input: any;
        const obs: any = observable(
            syncedCrud<any, any, any>({
                as,
                list: async () => [{ id: 'id1', value: 1 }],
                update: (row) => {
                    input = structuredClone(row);
                    return new Promise((r) => {
                        resolve = r;
                    });
                },
                delete: async () => {},
            }),
        );
        obs.get();
        await releaseTick();
        const row = as === 'value' ? obs : as === 'array' ? obs[0] : obs.id1;
        row.value.set(2);
        await releaseTick();
        obs.delete();
        await releaseTick();
        resolve(input);
        await releaseTick();
        expect(obs.peek()).toEqual(as === 'array' ? [] : undefined);
        expect(syncState(obs).error.peek()).toBeUndefined();
        expect(syncState(obs).numPendingSets.peek()).toBe(0);
    });
}

describe('reviewed CRUD invariants', () => {
    test.each(['generated', 'batched'] as const)('child-built value row creates once (%s)', async (kind) => {
        const creates: any[] = [];
        const updates: any[] = [];
        const obs: any = observable(
            syncedCrud<any>({
                as: 'value',
                get: async () => null,
                generateId: kind === 'generated' ? () => 'id1' : undefined,
                create: async (input) => {
                    creates.push(clone(input));
                    return input;
                },
                update: async (input) => {
                    updates.push(clone(input));
                    return input;
                },
            }),
        );
        obs.get();
        await releaseTick();
        if (kind === 'generated') obs.name.set('new');
        else
            batch(() => {
                obs.id.set('id1');
                obs.name.set('new');
            });
        await releaseTick();
        expect(creates).toEqual([{ id: 'id1', name: 'new' }]);
        expect(updates).toEqual([]);
        expect(syncState(obs).getPendingChanges()).toEqual({});
    });
    for (const as of ['object', 'array', 'Map', 'value'] as const) {
        test(`${as}: batched create acknowledges every changed field`, async () => {
            const creates: any[] = [];
            const obs: any = observable(
                syncedCrud<any, any, any>({
                    as,
                    list: async () => [{ id: 'id1', a: 1, b: 1 }],
                    fieldCreatedAt: 'createdAt',
                    updatePartial: true,
                    create: async (input) => {
                        creates.push(clone(input));
                        return { ...input, createdAt: 1 };
                    },
                }),
            );
            obs.get();
            await releaseTick();
            const row = as === 'value' ? obs : as === 'array' ? obs[0] : obs.id1;
            batch(() => {
                row.a.set(2);
                row.b.set(3);
            });
            await releaseTick();
            expect(creates).toEqual([{ id: 'id1', a: 2, b: 3 }]);
            expect(syncState(obs).getPendingChanges()).toEqual({});
            expect(syncState(obs).error.peek()).toBeUndefined();
        });
    }
    for (const as of ['object', 'array', 'Map'] as const) {
        test(`${as}: failed root deletion retains persisted pending alongside a successful update`, async () => {
            const name = getPersistName();
            let deleteChanges: any;
            const pack = (rows: any[]) =>
                as === 'array'
                    ? rows
                    : as === 'Map'
                      ? new Map(rows.map((row) => [row.id, row]))
                      : Object.fromEntries(rows.map((row) => [row.id, row]));
            const obs: any = observable(
                syncedCrud<any, any, any>({
                    as,
                    list: async () => [
                        { id: 'id1', value: 1 },
                        { id: 'id2', value: 1 },
                    ],
                    update: async (input) => input,
                    delete: async (_input, params) => {
                        deleteChanges = params.changes;
                        await promiseTimeout(5);
                        throw Error('delete failed');
                    },
                    onError: () => {},
                    persist: { name, plugin: ObservablePersistLocalStorage, retrySync: true },
                }),
            );
            obs.get();
            await when(syncState(obs).isLoaded);
            await when(syncState(obs).isPersistLoaded);
            obs.set(pack([{ id: 'id2', value: 2 }]));
            await releaseTick();
            await when(() => syncState(obs).numPendingSets.get() === 0);
            await releaseTick();
            expect(deleteChanges).toHaveLength(1);
            expect(deleteChanges[0].path).toEqual([]);
            expect(syncState(obs).getPendingChanges()).toHaveProperty('');
            expect(JSON.parse(localStorage.getItem(name + '__m')!).pending).toHaveProperty('');
        });
    }
    for (const as of ['object', 'Map'] as const)
        for (const missing of [null, undefined]) {
            test(`${as}: a nullish root row does not skip its changed sibling (${missing})`, async () => {
                const updates: any[] = [];
                const deleted: any[] = [];
                const obs: any = observable(
                    syncedCrud<any, any, any>({
                        as,
                        list: async () => [
                            { id: 'id1', value: 1 },
                            { id: 'id2', value: 1 },
                        ],
                        update: async (input) => {
                            updates.push(input);
                            return input;
                        },
                        delete: async (input) => {
                            deleted.push(input.id);
                        },
                    }),
                );
                obs.get();
                await releaseTick();
                const value = { id1: missing, id2: { id: 'id2', value: 2 } };
                obs.set(as === 'Map' ? new Map(Object.entries(value)) : value);
                await releaseTick();
                expect(updates).toEqual([{ id: 'id2', value: 2 }]);
                expect(deleted).toEqual(['id1']);
                expect(syncState(obs).getPendingChanges()).toEqual({});
            });
        }
    for (const as of ['object', 'array', 'Map', 'value'] as const)
        for (const kind of ['JSON', 'Map', 'Set'] as const)
            for (const edit of ['field', 'root'] as const) {
                test(`${as}: pending ${edit} ${kind} edit survives a full stale subscription`, async () => {
                    const payload = (value: number) =>
                        kind === 'JSON' ? [{ x: value }] : kind === 'Map' ? new Map([['x', value]]) : new Set([value]);
                    const row = (value: number, scalar = 'old') => ({ id: 'id1', payload: payload(value), scalar });
                    let push!: (params: any) => void;
                    let resolve!: (row: any) => void;
                    let sent: any;
                    const obs: any = observable(
                        syncedCrud<any, any, any>({
                            as,
                            list: async () => [row(0)],
                            subscribe: (params) => {
                                push = params.update;
                            },
                            update: (input) => {
                                sent = clone(input);
                                return new Promise((r) => {
                                    resolve = r;
                                });
                            },
                        }),
                    );
                    obs.get();
                    await releaseTick();
                    const item = as === 'value' ? obs : as === 'array' ? obs[0] : obs.id1;
                    if (edit === 'field') item.payload.set(payload(1));
                    else
                        obs.set(
                            as === 'value'
                                ? row(1)
                                : as === 'array'
                                  ? [row(1)]
                                  : as === 'Map'
                                    ? new Map([['id1', row(1)]])
                                    : { id1: row(1) },
                        );
                    await releaseTick();
                    push({ value: [row(0, 'subscription')], mode: 'merge' });
                    await releaseTick();
                    expect(item.peek().payload).toEqual(payload(1));
                    resolve(sent);
                    await releaseTick();
                    expect(item.peek().payload).toEqual(payload(1));
                    expect(syncState(obs).getPendingChanges()).toEqual({});
                });
            }
    test('Map: a pending whole-row replacement survives a stale subscription', async () => {
        let push!: (params: any) => void;
        let resolve!: (row: any) => void;
        let sent: any;
        const obs: any = observable(
            syncedCrud<any, any, 'Map'>({
                as: 'Map',
                list: async () => [{ id: 'id1', list: [0, 0] }],
                subscribe: (params) => {
                    push = params.update;
                },
                update: (input) => {
                    sent = clone(input);
                    return new Promise((r) => {
                        resolve = r;
                    });
                },
            }),
        );
        obs.get();
        await releaseTick();
        obs.id1.set({ id: 'id1', list: [1] });
        await releaseTick();
        push({ value: [{ id: 'id1', list: [0, 0] }], mode: 'merge' });
        await releaseTick();
        expect(obs.id1.peek().list).toEqual([1]);
        resolve(sent);
        await releaseTick();
        expect(obs.id1.peek().list).toEqual([1]);
    });
});

test('pending object merges keep __proto__ as an own data key', async () => {
    let remote: any = { id: 'id1', payload: { value: 0 } };
    let resolve!: (row: any) => void;
    let sent: any;
    const obs: any = observable(
        syncedCrud<any>({
            as: 'value',
            get: async () => clone(remote),
            update: (input) => {
                sent = clone(input);
                return new Promise((r) => {
                    resolve = r;
                });
            },
        }),
    );
    obs.get();
    await releaseTick();
    obs.set({ id: 'id1', payload: JSON.parse('{"__proto__":{"owned":true},"value":1}') });
    await releaseTick();
    remote = { id: 'id1', payload: { value: 0, server: 2 } };
    await syncState(obs).sync();
    await releaseTick();
    const payload = obs.peek().payload;
    resolve(sent);
    await releaseTick();
    expect(Object.getPrototypeOf(payload)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(payload, '__proto__')).toBe(true);
    expect(payload['__proto__']).toEqual({ owned: true });
    expect(payload.value).toBe(1);
    expect(payload.server).toBe(2);
});

for (const as of ['object', 'array', 'Map', 'value'] as const) {
    test(`${as}: repeated refreshes retain server additions during a pending root save`, async () => {
        let remote: any = { id: 'id1', payload: { value: 0 } };
        const requests: { input: any; resolve: (row: any) => void }[] = [];
        const obs: any = observable(
            syncedCrud<any, any, any>({
                as,
                list: async () => [clone(remote)],
                update: (input) => new Promise((resolve) => requests.push({ input: clone(input), resolve })),
            }),
        );
        obs.get();
        await releaseTick();
        const row = { id: 'id1', payload: { value: 1 } };
        obs.set(as === 'value' ? row : as === 'array' ? [row] : as === 'Map' ? new Map([['id1', row]]) : { id1: row });
        await releaseTick();
        for (const server of [1, 2]) {
            remote = { id: 'id1', payload: { value: 0, server } };
            await syncState(obs).sync();
            await releaseTick();
        }
        const current = () =>
            as === 'value'
                ? obs.peek()
                : as === 'array'
                  ? obs.peek()[0]
                  : as === 'Map'
                    ? obs.peek().get('id1')
                    : obs.peek().id1;
        const refreshed = clone(current());
        for (let i = 0; i < requests.length; i++) {
            requests[i].resolve(requests[i].input);
            await releaseTick();
        }
        expect(refreshed.payload).toEqual({ value: 1, server: 2 });
        expect(current().payload).toEqual({ value: 1, server: 2 });
        expect(syncState(obs).numPendingSets.peek()).toBe(0);
        expect(syncState(obs).getPendingChanges()).toEqual({});
    });
}

for (const fieldId of ['id', '_id', 'test_id'] as const) {
    test(`pending array roots match refreshed metadata by ${fieldId} after a local reorder`, async () => {
        const remote: any[] = [
            { [fieldId]: 'a', value: 0 },
            { [fieldId]: 'b', value: 0 },
        ];
        const requests: { input: any; resolve: (row: any) => void }[] = [];
        const obs: any = observable(
            syncedCrud<any, any, 'array'>({
                as: 'array',
                fieldId,
                list: async () => clone(remote),
                update: (input) => {
                    Object.assign(remote.find((row) => row[fieldId] === input[fieldId])!, input);
                    return new Promise((resolve) => requests.push({ input: clone(input), resolve }));
                },
            }),
        );
        obs.get();
        await releaseTick();
        obs.set([
            { [fieldId]: 'b', value: 1 },
            { [fieldId]: 'a', value: 0 },
        ]);
        await releaseTick();
        remote[0].server = 30;
        remote[1].server = 40;
        await syncState(obs).sync();
        await releaseTick();
        const refreshed = clone(obs.peek());
        for (let i = 0; i < requests.length; i++) {
            requests[i].resolve(requests[i].input);
            await releaseTick();
        }
        expect(refreshed).toEqual([
            { [fieldId]: 'b', value: 1, server: 40 },
            { [fieldId]: 'a', value: 0, server: 30 },
        ]);
        expect(syncState(obs).getPendingChanges()).toEqual({});
        await syncState(obs).sync();
        await releaseTick();
        expect(clone(obs.peek())).toEqual(remote);
    });
}

for (const as of ['object', 'array', 'Map', 'value'] as const) {
    test(`${as}: partial subscriptions do not erase untouched root fields or rows`, async () => {
        const rows = [
            { id: 'id1', payload: 0, untouched: 'keep', createdAt: 1, updatedAt: 1 },
            { id: 'id2', payload: 100, untouched: 'other', createdAt: 1, updatedAt: 1 },
        ];
        const pack = (value: any[]) =>
            as === 'value'
                ? value[0]
                : as === 'array'
                  ? value
                  : as === 'Map'
                    ? new Map(value.map((row) => [row.id, row]))
                    : Object.fromEntries(value.map((row) => [row.id, row]));
        let push!: (params: any) => void;
        const requests: { input: any; resolve: (row: any) => void }[] = [];
        const obs: any = observable(
            syncedCrud<any, any, any>({
                as,
                list: async () => clone(rows),
                fieldCreatedAt: 'createdAt',
                fieldUpdatedAt: 'updatedAt',
                subscribe: (params) => {
                    push = params.update;
                },
                update: (input) => new Promise((resolve) => requests.push({ input: clone(input), resolve })),
            }),
        );
        obs.get();
        await releaseTick();
        const changed = clone(rows);
        changed[0].payload = 1;
        obs.set(pack(changed));
        await releaseTick();
        push({ value: [{ id: 'id1', payload: 0, remote: 'new' }], mode: 'merge' });
        await releaseTick();
        const expected = clone(changed) as any[];
        expected[0].remote = 'new';
        const received = clone(obs.peek());
        for (const request of requests) {
            request.resolve(request.input);
            await releaseTick();
        }
        expect(received).toEqual(pack(expected));
        expect(clone(obs.peek())).toEqual(pack(expected));
        expect(syncState(obs).getPendingChanges()).toEqual({});
    });
}

for (const as of ['object', 'array', 'Map', 'value'] as const) {
    test(`${as}: onSaved row replacement is newer than its response`, async () => {
        const obs: any = observable(
            syncedCrud<any, any, any>({
                as,
                list: async () => [{ id: 'id1', list: [0] }],
                update: async (input) => ({ ...input, list: [3] }),
                onSaved: () => {
                    syncState(obs).isSyncEnabled.set(false);
                    const row = { id: 'id1', list: [2] };
                    obs.set(
                        as === 'value'
                            ? row
                            : as === 'array'
                              ? [row]
                              : as === 'Map'
                                ? new Map([['id1', row]])
                                : { id1: row },
                    );
                },
            }),
        );
        obs.get();
        await releaseTick();
        (as === 'value' ? obs : as === 'array' ? obs[0] : obs.id1).list.set([1]);
        await releaseTick();
        expect((as === 'value' ? obs : as === 'array' ? obs[0] : obs.id1).peek().list).toEqual([2]);
    });
}

test('onSaved array reorder applies normalization to the same row', async () => {
    const obs: any = observable(
        syncedCrud<any, any, 'array'>({
            as: 'array',
            list: async () => [
                { id: 'a', list: [0] },
                { id: 'b', list: [9] },
            ],
            update: async (input) => ({ ...input, list: [3] }),
            onSaved: () => {
                syncState(obs).isSyncEnabled.set(false);
                obs.set([
                    { id: 'b', list: [9] },
                    { id: 'a', list: [1] },
                ]);
            },
        }),
    );
    obs.get();
    await releaseTick();
    obs[0].list.set([1]);
    await releaseTick();
    expect(obs.peek()).toEqual([
        { id: 'b', list: [9] },
        { id: 'a', list: [3] },
    ]);
});

test('onSaved deletion does not resurrect the row', async () => {
    const obs: any = observable(
        syncedCrud<any>({
            as: 'object',
            list: async () => [{ id: 'id1', list: [0] }],
            update: async (input) => ({ ...input, list: [3] }),
            onSaved: () => {
                syncState(obs).isSyncEnabled.set(false);
                obs.id1.delete();
            },
        }),
    );
    obs.get();
    await releaseTick();
    obs.id1.list.set([1]);
    await releaseTick();
    expect(obs.id1.peek()).toBeUndefined();
});

for (const as of ['object', 'Map', 'array'] as const) {
    for (const action of ['edit', 'delete'] as const) {
        test(`${as}: a later onSaved callback preserves its changes to an earlier saved row (${action})`, async () => {
            const requests: { input: any; resolve: (row: any) => void }[] = [];
            const obs: any = observable(
                syncedCrud<any, any, any>({
                    as,
                    list: async () => [
                        { id: 'a', value: 0 },
                        { id: 'b', value: 0 },
                    ],
                    update: (input) => new Promise((resolve) => requests.push({ input: clone(input), resolve })),
                    onSaved: ({ input }) => {
                        if (input.id === 'a') {
                            syncState(obs).isSyncEnabled.set(false);
                            const row = as === 'array' ? obs[1] : obs.b;
                            if (action === 'delete') row.delete();
                            else row.value.set(2);
                        }
                    },
                }),
            );
            obs.get();
            await releaseTick();
            batch(() => {
                (as === 'array' ? obs[0] : obs.a).value.set(1);
                (as === 'array' ? obs[1] : obs.b).value.set(1);
            });
            await releaseTick();
            requests.find(({ input }) => input.id === 'b')!.resolve({ id: 'b', value: 3 });
            await releaseTick();
            requests.find(({ input }) => input.id === 'a')!.resolve({ id: 'a', value: 1 });
            await releaseTick();
            const expected = [{ id: 'a', value: 1 }, ...(action === 'delete' ? [] : [{ id: 'b', value: 2 }])];
            expect(clone(obs.peek())).toEqual(
                as === 'array'
                    ? expected
                    : as === 'Map'
                      ? new Map(expected.map((row) => [row.id, row]))
                      : Object.fromEntries(expected.map((row) => [row.id, row])),
            );
            expect(syncState(obs).numPendingSets.peek()).toBe(0);
            expect(syncState(obs).getPendingChanges()).toEqual({});
        });
    }
}

for (const source of ['refresh', 'subscribe'] as const) {
    test(`pending array roots retain remote additions and local removals during ${source}`, async () => {
        const remote = [
            { id: 'a', value: 0 },
            { id: 'removed', value: 0 },
        ];
        let push!: (params: any) => void;
        const requests: { input: any; resolve: (row: any) => void }[] = [];
        const obs: any = observable(
            syncedCrud<any, any, 'array'>({
                as: 'array',
                list: async () => clone(remote),
                subscribe: (params) => {
                    push = params.update;
                },
                update: (input) => new Promise((resolve) => requests.push({ input: clone(input), resolve })),
                delete: async () => {},
            }),
        );
        obs.get();
        await releaseTick();
        obs.set([{ id: 'a', value: 1 }]);
        await releaseTick();
        remote.push({ id: 'b', value: 2 });
        if (source === 'refresh') await syncState(obs).sync();
        else push({ value: clone(remote), mode: 'set' });
        await releaseTick();
        const expected = [
            { id: 'a', value: 1 },
            { id: 'b', value: 2 },
        ];
        expect(clone(obs.peek())).toEqual(expected);
        for (const request of requests) request.resolve(request.input);
        await releaseTick();
        expect(clone(obs.peek())).toEqual(expected);
        expect(syncState(obs).getPendingChanges()).toEqual({});
    });
}

for (const as of ['object', 'Map', 'array'] as const) {
    test(`${as}: successful saves without response data acknowledge their changes alongside normalized rows`, async () => {
        const obs: any = observable(
            syncedCrud<any, any, any>({
                as,
                list: async () => [
                    { id: 'a', value: 0 },
                    { id: 'b', value: 0 },
                ],
                update: async (input) => (input.id === 'a' ? { ...input, value: 2 } : undefined),
            }),
        );
        obs.get();
        await releaseTick();
        batch(() => {
            (as === 'array' ? obs[0] : obs.a).value.set(1);
            (as === 'array' ? obs[1] : obs.b).value.set(1);
        });
        await releaseTick();
        expect((as === 'array' ? obs[0] : obs.a).value.peek()).toBe(2);
        expect((as === 'array' ? obs[1] : obs.b).value.peek()).toBe(1);
        expect(syncState(obs).getPendingChanges()).toEqual({});
    });
}

for (const as of ['object', 'Map'] as const) {
    for (const transformed of [false, true]) {
        for (const updatePartial of [false, true]) {
            for (const refreshBeforeAck of [false, true]) {
                test(`${as} transform=${transformed} partial=${updatePartial}: root then row replacements survive stale refreshes (beforeAck=${refreshBeforeAck})`, async () => {
                    let push!: (params: any) => void;
                    const requests: { input: any; resolve: (row: any) => void }[] = [];
                    const obs: any = observable(
                        syncedCrud<any, any, any>({
                            as,
                            list: async () => [{ id: 'id1', value: 1, removed: true }],
                            updatePartial,
                            transform: transformed
                                ? { save: (row) => ({ ...row }), load: (row) => ({ ...row }) }
                                : undefined,
                            subscribe: (params) => {
                                push = params.update;
                            },
                            update: (input) =>
                                new Promise((resolve) => requests.push({ input: clone(input), resolve })),
                        }),
                    );
                    obs.get();
                    await releaseTick();
                    const row = obs.id1;
                    const first = { id: 'id1', value: 2, removed: true };
                    obs.set(as === 'Map' ? new Map([['id1', first]]) : { id1: first });
                    await releaseTick();
                    row.set({ id: 'id1', value: 3 });
                    await releaseTick();
                    if (refreshBeforeAck) {
                        push({ value: [{ id: 'id1', value: 1, removed: true }], mode: 'merge' });
                        await releaseTick();
                    }
                    requests[0].resolve(requests[0].input);
                    await releaseTick();
                    push({ value: [{ id: 'id1', value: 1, removed: true }], mode: 'merge' });
                    await releaseTick();
                    expect(clone(row.peek())).toEqual({ id: 'id1', value: 3 });
                    for (const request of requests.slice(1)) {
                        request.resolve(request.input);
                        await releaseTick();
                    }
                    expect(clone(row.peek())).toEqual({ id: 'id1', value: 3 });
                    expect(syncState(obs).getPendingChanges()).toEqual({});
                });
            }
        }
    }
}

for (const as of ['object', 'Map', 'array'] as const) {
    test(`${as}: cancelling a failed create clears pending alongside a data-free update`, async () => {
        const obs: any = observable(
            syncedCrud<any, any, any>({
                as,
                list: async () => [{ id: 'y', value: 0 }],
                create: async () => {
                    throw Error('create failed');
                },
                update: async () => {},
                onError: () => {},
            }),
        );
        obs.get();
        await releaseTick();
        if (as === 'array') obs.push({ id: 'x', value: 0 });
        else obs.x.set({ id: 'x', value: 0 });
        await releaseTick();
        expect(Object.keys(syncState(obs).getPendingChanges() || {}).length).toBeGreaterThan(0);
        batch(() => {
            (as === 'array' ? obs[1] : obs.x).delete();
            (as === 'array' ? obs[0] : obs.y).value.set(1);
        });
        await releaseTick();
        expect((as === 'array' ? obs[0] : obs.y).value.peek()).toBe(1);
        expect(syncState(obs).getPendingChanges()).toEqual({});
    });
}

for (const as of ['object', 'Map', 'array'] as const) {
    test(`${as}: pending root refreshes retain identical row references`, async () => {
        const requests: { input: any; resolve: (row: any) => void }[] = [];
        const remote = [
            { id: 'a', value: 0 },
            { id: 'b', value: 0 },
        ];
        const obs: any = observable(
            syncedCrud<any, any, any>({
                as,
                list: async () => clone(remote),
                update: (input) => new Promise((resolve) => requests.push({ input: clone(input), resolve })),
            }),
        );
        obs.get();
        await releaseTick();
        const rows = [{ id: 'a', value: 1 }, remote[1]];
        obs.set(
            as === 'array'
                ? rows
                : as === 'Map'
                  ? new Map(rows.map((row) => [row.id, row]))
                  : { a: rows[0], b: rows[1] },
        );
        await releaseTick();
        const unchanged = (as === 'array' ? obs[1] : obs.b).peek();
        const unchangedRoot = obs.peek();
        await syncState(obs).sync();
        await releaseTick();
        expect(obs.peek()).toBe(unchangedRoot);
        expect((as === 'array' ? obs[1] : obs.b).peek()).toBe(unchanged);
        expect((as === 'array' ? obs[0] : obs.a).value.peek()).toBe(1);
        for (const request of requests) request.resolve(request.input);
        await releaseTick();
    });
}

for (const response of ['plain', 'custom JSON', 'custom JSON getter', 'plain proxy'] as const) {
    test(`value callbacks preserve response serialization (${response})`, async () => {
        const saved = { id: 'id1', value: 2, untouched: undefined };
        let serializationReads = 0;
        const obs: any = observable(
            syncedCrud<any, any, 'value'>({
                as: 'value',
                get: async () => ({ id: 'id1', value: 0, untouched: 'keep' }),
                update: async () =>
                    response === 'custom JSON'
                        ? { ignored: true, toJSON: () => saved }
                        : response === 'custom JSON getter'
                          ? {
                                get toJSON() {
                                    if (++serializationReads > 1) throw Error('serializer read twice');
                                    return () => saved;
                                },
                            }
                          : response === 'plain proxy'
                            ? new Proxy(saved, {})
                            : saved,
                onSaved: () => {},
            }),
        );
        obs.get();
        await releaseTick();
        obs.value.set(1);
        await releaseTick();
        expect(clone(obs.peek())).toEqual({ id: 'id1', value: 2, untouched: 'keep' });
        expect(syncState(obs).error.peek()).toBeUndefined();
        expect(syncState(obs).getPendingChanges()).toEqual({});
    });
}

for (const as of ['object', 'Map', 'array'] as const) {
    test(`${as}: callbacks in overlapping single-row batches preserve newer cross-row edits`, async () => {
        const requests: { input: any; resolve: (row: any) => void }[] = [];
        const obs: any = observable(
            syncedCrud<any, any, any>({
                as,
                list: async () => [
                    { id: 'a', value: 0 },
                    { id: 'b', value: 0 },
                ],
                update: (input) => new Promise((resolve) => requests.push({ input: clone(input), resolve })),
                onSaved: ({ input }) => {
                    if (input.id === 'a') {
                        syncState(obs).isSyncEnabled.set(false);
                        (as === 'array' ? obs[1] : obs.b).value.set(2);
                    }
                },
            }),
        );
        obs.get();
        await releaseTick();
        (as === 'array' ? obs[1] : obs.b).value.set(1);
        await releaseTick();
        (as === 'array' ? obs[0] : obs.a).value.set(1);
        await releaseTick();
        requests.find(({ input }) => input.id === 'b')!.resolve({ id: 'b', value: 3 });
        requests.find(({ input }) => input.id === 'a')!.resolve({ id: 'a', value: 1 });
        await releaseTick();
        expect((as === 'array' ? obs[1] : obs.b).value.peek()).toBe(2);
        expect(syncState(obs).numPendingSets.peek()).toBe(0);
        expect(syncState(obs).getPendingChanges()).toEqual({});
    });
}

describe('queued CRUD root changes', () => {
    test.each([false, true])('value deletion keeps its old ID while loading (retry=%s)', async (retryDelete) => {
        let release!: (value: any) => void;
        const deleted: any[] = [];
        const updated: any[] = [];
        const errors: string[] = [];
        const obs: any = observable(
            syncedCrud<any, any, 'value'>({
                as: 'value',
                initial: { id: 'old', value: 1 },
                get: () => new Promise((resolve) => (release = resolve)),
                update: async (input) => {
                    updated.push(clone(input));
                    return input;
                },
                delete: async (input) => {
                    deleted.push(clone(input));
                    if (retryDelete && deleted.length === 1) throw Error('retry deletion');
                    await promiseTimeout(2);
                    return { ...input, server: 'obsolete' };
                },
                retry: retryDelete ? { times: 2, delay: 1 } : undefined,
                onError: (error) => errors.push(error.message),
            }),
        );
        obs.get();
        await releaseTick();
        obs.set(null);
        await releaseTick();
        obs.set({ id: 'new', value: 2 });
        await releaseTick();
        release({ id: 'old', value: 1, server: 'obsolete refresh' });
        await promiseTimeout(30);
        expect(deleted).toEqual(Array(retryDelete ? 2 : 1).fill({ id: 'old', value: 1, server: 'obsolete refresh' }));
        expect(updated).toEqual([{ id: 'new', value: 2 }]);
        expect(obs.peek()).toEqual({ id: 'new', value: 2 });
        expect(errors).toEqual([]);
        expect(syncState(obs).getPendingChanges()).toEqual({});
        expect(syncState(obs).numPendingSets.peek()).toBe(0);
    });
});

describe('queued generated array IDs', () => {
    test.each(['removed', 'replaced', 'retained'] as const)(
        'uses current rows when the old row is %s',
        async (kind) => {
            let release!: (rows: any[]) => void;
            let generated = 0;
            const created: any[] = [];
            const errors: string[] = [];
            const obs: any = observable(
                syncedCrud<any, any, 'array'>({
                    as: 'array',
                    list: () => new Promise<any[]>((resolve) => (release = resolve)),
                    generateId: () => `generated-${++generated}`,
                    create: async (input) => {
                        created.push(clone(input));
                        return input;
                    },
                    update: async (input) => input,
                    delete: async () => {},
                    onError: (error) => errors.push(error.message),
                }),
            );
            obs.get();
            await releaseTick();
            obs.set([{ id: 'a', value: 1 }, { value: 7 }]);
            await releaseTick();
            const current =
                kind === 'removed'
                    ? [{ id: 'a', value: 2 }]
                    : kind === 'replaced'
                      ? [{ value: 9 }, { id: 'a', value: 2 }]
                      : [{ id: 'a', value: 2 }, { value: 7 }];
            obs.set(current);
            await releaseTick();
            release([{ id: 'a', value: 0 }]);
            await promiseTimeout(10);
            const expected =
                kind === 'removed'
                    ? [{ id: 'a', value: 2 }]
                    : kind === 'replaced'
                      ? [
                            { value: 9, id: 'generated-1' },
                            { id: 'a', value: 2 },
                        ]
                      : [
                            { id: 'a', value: 2 },
                            { value: 7, id: 'generated-1' },
                        ];
            expect(obs.peek()).toEqual(expected);
            expect(created).toEqual(kind === 'removed' ? [] : [expected[kind === 'replaced' ? 0 : 1]]);
            expect(generated).toBe(kind === 'removed' ? 0 : 1);
            expect(errors).toEqual([]);
            expect(syncState(obs).error.peek()).toBeUndefined();
            expect(syncState(obs).getPendingChanges()).toEqual({});
        },
    );
});

test.each([false, true])('nested response getters are serialized once (onSaved=%s)', async (onSaved) => {
    let reads = 0;
    const obs: any = observable(
        syncedCrud<any, any, 'value'>({
            as: 'value',
            get: async () => ({ id: 'row', value: 1, payload: { x: 0 } }),
            update: async () => ({
                id: 'row',
                value: 2,
                payload: {
                    get x() {
                        if (++reads > 1) throw Error('nested getter read twice');
                        return 1;
                    },
                },
            }),
            onSaved: onSaved ? () => {} : undefined,
            onError: () => {},
        }),
    );
    obs.get();
    await releaseTick();
    obs.value.set(2);
    await releaseTick();
    expect(reads).toBe(1);
    expect(obs.peek()).toEqual({ id: 'row', value: 2, payload: { x: 1 } });
    expect(syncState(obs).error.peek()).toBeUndefined();
    expect(syncState(obs).getPendingChanges()).toEqual({});
});

test.each(['before response', 'onSaved'] as const)(
    'obsolete value response does not rename a replacement (%s)',
    async (replace) => {
        let resolve!: (value: any) => void;
        let callbacks = 0;
        const obs: any = observable(
            syncedCrud<any, any, 'value'>({
                as: 'value',
                initial: { id: 'old', value: 0 },
                update: () => new Promise((release) => (resolve = release)),
                onSaved: () => {
                    callbacks++;
                    if (replace === 'onSaved') replaceRoot();
                },
            }),
        );
        const replaceRoot = () => {
            syncState(obs).isSyncEnabled.set(false);
            obs.set({ id: 'new', value: 9 });
        };
        obs.get();
        obs.value.set(1);
        await releaseTick();
        if (replace === 'before response') replaceRoot();
        resolve({ id: 'old', value: 2, server: 'obsolete' });
        await releaseTick();
        expect(obs.peek()).toEqual({ id: 'new', value: 9 });
        expect(callbacks).toBe(replace === 'onSaved' ? 1 : 0);
        expect(syncState(obs).getPendingChanges()).toEqual({});
        expect(syncState(obs).error.peek()).toBeUndefined();
    },
);

for (const as of ['object', 'Map'] as const) {
    test.each([undefined, 0, ''])(
        'local row removal acknowledges missing or falsy IDs (%s, ' + as + ')',
        async (id) => {
            const orphan = { value: 0, ...(id === undefined ? {} : { id }) };
            const rows = { orphan, live: { id: 'live', value: 0 } };
            const deleted: any[] = [];
            const obs: any = observable(
                syncedCrud<any, any, any>({
                    as,
                    initial: as === 'Map' ? new Map(Object.entries(rows)) : rows,
                    update: async (input) => input,
                    delete: async (input) => {
                        deleted.push(clone(input));
                    },
                }),
            );
            obs.get();
            batch(() => {
                obs.orphan.delete();
                obs.live.value.set(1);
            });
            await releaseTick();
            expect(deleted).toEqual(id === undefined ? [] : [orphan]);
            expect(obs.live.value.peek()).toBe(1);
            expect(syncState(obs).getPendingChanges()).toEqual({});
            expect(syncState(obs).error.peek()).toBeUndefined();
        },
    );
}

test.each([false, true])(
    'value replacement keeps refresh metadata on its original row (initial=%s)',
    async (hasInitial) => {
        let release!: (value: any) => void;
        const created: any[] = [];
        const updated: any[] = [];
        const errors: string[] = [];
        const obs: any = observable(
            syncedCrud<any, any, 'value'>({
                as: 'value',
                initial: hasInitial ? { id: 'old', value: 1, createdAt: 1 } : undefined,
                get: () => new Promise((resolve) => (release = resolve)),
                fieldCreatedAt: 'createdAt',
                create: async (input) => {
                    created.push(clone(input));
                    return input;
                },
                update: async (input) => {
                    updated.push(clone(input));
                    return input;
                },
                delete: async () => {},
                onError: (error) => errors.push(error.message),
            }),
        );
        obs.get();
        await releaseTick();
        if (hasInitial) {
            obs.set(null);
            await releaseTick();
        }
        obs.set({ id: 'new', value: 2 });
        await releaseTick();
        release({ id: 'old', value: 1, createdAt: 1, server: 'obsolete refresh' });
        await promiseTimeout(20);
        expect(obs.peek()).toEqual({ id: 'new', value: 2 });
        expect(created).toEqual([{ id: 'new', value: 2 }]);
        for (const input of updated) expect(input).toEqual({ id: 'new', value: 2 });
        expect(errors).toEqual([]);
        expect(syncState(obs).getPendingChanges()).toEqual({});
        expect(syncState(obs).numPendingSets.peek()).toBe(0);
    },
);

for (const as of ['object', 'array', 'Map'] as const) {
    test.each([false, true])(
        `${as}: deleting a row acknowledges its cancelled update with a sibling save (retry=%s)`,
        async (retry) => {
            let resolve!: (value: any) => void;
            let input: any;
            let calls = 0;
            const obs: any = observable(
                syncedCrud<any, any, any>({
                    as,
                    list: async () => [
                        { id: 'x', value: 0 },
                        { id: 'y', value: 0 },
                    ],
                    updatePartial: true,
                    update: async (value) => {
                        if (value.id === 'x') {
                            calls++;
                            input = clone(value);
                            if (retry) throw Error('retry update');
                            return new Promise((r) => (resolve = r));
                        }
                        return value;
                    },
                    delete: async () => {},
                    retry: retry ? { times: 2, delay: 20, backoff: 'constant' } : undefined,
                }),
            );
            obs.get();
            await releaseTick();
            batch(() => {
                (as === 'array' ? obs[0] : obs.x).value.set(1);
                (as === 'array' ? obs[1] : obs.y).value.set(2);
            });
            await releaseTick();
            if (as === 'array') obs.splice(0, 1);
            else obs.x.delete();
            await releaseTick();
            if (!retry) resolve(input);
            await promiseTimeout(40);
            expect(calls).toBe(1);
            expect((as === 'array' ? obs[0] : obs.y).peek()).toEqual({ id: 'y', value: 2 });
            expect(as === 'array' ? obs.peek().length : obs.x.peek()).toEqual(as === 'array' ? 1 : undefined);
            expect(syncState(obs).getPendingChanges()).toEqual({});
            expect(syncState(obs).numPendingSets.peek()).toBe(0);
            expect(syncState(obs).error.peek()).toBeUndefined();
        },
    );
}

for (const as of ['object', 'array', 'Map'] as const) {
    test.each([
        [false, false],
        [false, true],
        [true, false],
        [true, true],
    ])(
        `${as}: observed creates retain only unsaved edits after metadata arrives (root=%s matching=%s)`,
        async (root, matching) => {
            let push!: (params: any) => void;
            let creates = 0;
            const persistName = getPersistName();
            const obs: any = observable(
                syncedCrud<any, any, any>({
                    as,
                    fieldCreatedAt: 'createdAt',
                    list: async () => [{ id: 'y', value: 0, createdAt: 1 }],
                    create: async () => {
                        creates++;
                        throw Error('retry create');
                    },
                    update: async () => {},
                    subscribe: (params) => {
                        push = params.update;
                    },
                    retry: { times: 2, delay: 30, backoff: 'constant' },
                    persist: { name: persistName, plugin: ObservablePersistLocalStorage },
                }),
            );
            obs.get();
            await releaseTick();
            if (root) {
                const rows = [
                    { id: 'y', value: 1, createdAt: 1 },
                    { id: 'x', value: 2 },
                ];
                obs.set(
                    as === 'array'
                        ? rows
                        : as === 'Map'
                          ? new Map(rows.map((row) => [row.id, row]))
                          : Object.fromEntries(rows.map((row) => [row.id, row])),
                );
            } else
                batch(() => {
                    if (as === 'array') obs.push({ id: 'x', value: 2 });
                    else obs.x.set({ id: 'x', value: 2 });
                    (as === 'array' ? obs[0] : obs.y).value.set(1);
                });
            await releaseTick();
            push({
                value: [
                    { id: 'y', value: 1, createdAt: 1 },
                    { id: 'x', value: matching ? 2 : 0, createdAt: 2 },
                ],
                mode: 'set',
            });
            await promiseTimeout(60);
            expect(creates).toBe(1);
            expect((as === 'array' ? obs[1] : obs.x).peek()).toEqual({ id: 'x', value: 2, createdAt: 2 });
            expect(syncState(obs).numPendingSets.peek()).toBe(0);
            const pending = syncState(obs).getPendingChanges();
            expect(Object.keys(pending || {})).toHaveLength(matching ? 0 : 1);
            expect(safeParse(localStorage.getItem(persistName + '__m') || '{}').pending || {}).toEqual(pending);
            expect(syncState(obs).error.peek()).toBeUndefined();
        },
    );
}

for (const as of ['object', 'array', 'Map', 'value'] as const) {
    test.each(['field', 'row'] as const)(
        `${as}: a reverted %s survives an older echo until acknowledged`,
        async (scope) => {
            let push!: (params: any) => void;
            const requests: { input: any; resolve: (value: any) => void }[] = [];
            const persistName = getPersistName();
            const obs: any = observable(
                syncedCrud<any, any, any>({
                    as,
                    list: async () => [{ id: 'a', value: 'A' }],
                    update: (input) => new Promise((resolve) => requests.push({ input: clone(input), resolve })),
                    subscribe: (params) => {
                        push = params.update;
                    },
                    persist: { name: persistName, plugin: ObservablePersistLocalStorage },
                }),
            );
            obs.get();
            await releaseTick();
            const row = as === 'value' ? obs : as === 'array' ? obs[0] : obs.a;
            const edit = (value: string) => (scope === 'field' ? row.value.set(value) : row.set({ id: 'a', value }));
            edit('B');
            await releaseTick();
            edit('A');
            await releaseTick();
            expect(requests.map((request) => request.input.value)).toEqual(['B', 'A']);
            push({ value: [{ id: 'a', value: 'B' }], mode: 'set' });
            await releaseTick();
            expect(row.value.peek()).toBe('A');
            expect(Object.keys(syncState(obs).getPendingChanges() || {})).not.toHaveLength(0);
            expect(
                Object.keys(JSON.parse(localStorage.getItem(persistName + '__m') || '{}').pending || {}),
            ).not.toHaveLength(0);
            requests[0].resolve(requests[0].input);
            await releaseTick();
            expect(row.value.peek()).toBe('A');
            expect(Object.keys(syncState(obs).getPendingChanges() || {})).not.toHaveLength(0);
            requests[1].resolve(requests[1].input);
            await releaseTick();
            expect(row.value.peek()).toBe('A');
            expect(syncState(obs).getPendingChanges()).toEqual({});
            expect(JSON.parse(localStorage.getItem(persistName + '__m') || '{}').pending || {}).toEqual({});
            expect(syncState(obs).numPendingSets.peek()).toBe(0);
            expect(syncState(obs).error.peek()).toBeUndefined();
        },
    );
}

for (const as of ['object', 'array', 'Map'] as const) {
    test(`${as}: mixed root reversions retain intent through later root edits and server fields`, async () => {
        let push!: (params: any) => void;
        const requests: { input: any; resolve: (value: any) => void }[] = [];
        const persistName = getPersistName();
        const pack = (a: string, b: string, server = 0) => {
            const rows = [
                { id: 'a', value: a, server },
                { id: 'b', value: b, server },
            ];
            return as === 'array'
                ? rows
                : as === 'Map'
                  ? new Map(rows.map((row) => [row.id, row]))
                  : Object.fromEntries(rows.map((row) => [row.id, row]));
        };
        const obs: any = observable(
            syncedCrud<any, any, any>({
                as,
                list: async () => [
                    { id: 'a', value: 'A', server: 0 },
                    { id: 'b', value: 'A', server: 0 },
                ],
                update: (input) => new Promise((resolve) => requests.push({ input: clone(input), resolve })),
                subscribe: (params) => {
                    push = params.update;
                },
                persist: { name: persistName, plugin: ObservablePersistLocalStorage },
            }),
        );
        obs.get();
        await releaseTick();
        obs.set(pack('B', 'A'));
        await releaseTick();
        obs.set(pack('A', 'C'));
        await releaseTick();
        obs.set(pack('A', 'D'));
        await releaseTick();
        push({
            value: [
                { id: 'a', value: 'B', server: 1 },
                { id: 'b', value: 'A', server: 1 },
            ],
            mode: 'set',
        });
        await releaseTick();
        expect(obs.peek()).toEqual(pack('A', 'D', 1));
        expect(Object.keys(syncState(obs).getPendingChanges() || {})).not.toHaveLength(0);
        for (const request of requests) {
            request.resolve({ ...request.input, server: 1 });
            await releaseTick();
        }
        expect(obs.peek()).toEqual(pack('A', 'D', 1));
        expect(syncState(obs).getPendingChanges()).toEqual({});
        expect(JSON.parse(localStorage.getItem(persistName + '__m') || '{}').pending || {}).toEqual({});
        expect(syncState(obs).numPendingSets.peek()).toBe(0);
    });
}

for (const as of ['object', 'array', 'Map', 'value'] as const) {
    test(`${as}: persisted reversion history survives a fresh persistence instance`, async () => {
        const name = getPersistName();
        const first: any = observable(
            syncedCrud<any, any, any>({
                as,
                list: async () => [{ id: 'a', value: 'A', server: 0 }],
                update: () => new Promise(() => {}),
                persist: { name, plugin: new ObservablePersistLocalStorage(), retrySync: true },
            }),
        );
        first.get();
        await releaseTick();
        const row = as === 'value' ? first : as === 'array' ? first[0] : first.a;
        row.set({ id: 'a', value: 'B', server: 0 });
        await releaseTick();
        row.set({ id: 'a', value: 'A', server: 0 });
        await releaseTick();
        const saved = safeParse(localStorage.getItem(name + '__m')!);
        const key = Object.keys(saved.pending)[0];
        expect(saved.pending[key].h).toEqual([['value']]);
        let push!: (params: any) => void;
        const requests: (() => void)[] = [];
        const restored: any = observable(
            syncedCrud<any, any, any>({
                as,
                list: async () => [{ id: 'a', value: 'B', server: 1 }],
                update: () => new Promise<void>((resolve) => requests.push(resolve)),
                subscribe: (params) => {
                    push = params.update;
                },
                persist: { name, plugin: new ObservablePersistLocalStorage(), retrySync: true },
            }),
        );
        restored.get();
        await releaseTick();
        await releaseTick();
        const current = as === 'value' ? restored : as === 'array' ? restored[0] : restored.a;
        expect(current.peek()).toEqual({ id: 'a', value: 'A', server: 1 });
        expect((syncState(restored).getPendingChanges() as PendingChanges)?.[key].h).toEqual(saved.pending[key].h);
        expect(safeParse(localStorage.getItem(name + '__m')!).pending[key].h).toEqual(saved.pending[key].h);
        push({ value: [{ id: 'a', value: 'A', server: 1 }], mode: 'set' });
        await releaseTick();
        expect(syncState(restored).getPendingChanges()).toEqual({});
        expect(safeParse(localStorage.getItem(name + '__m')!).pending || {}).toEqual({});
        for (const resolve of requests) resolve();
        await releaseTick();
        expect(current.peek()).toEqual({ id: 'a', value: 'A', server: 1 });
    });
}

for (const as of ['object', 'array', 'Map', 'value'] as const) {
    test(`${as}: wider replacements retain descendant reversion history`, async () => {
        let push!: (params: any) => void;
        const requests: (() => void)[] = [];
        const rowValue = (value: string, extra = 0, server = 0) => ({ id: 'a', value, extra, server });
        const pack = (row: any) =>
            as === 'value' ? row : as === 'array' ? [row] : as === 'Map' ? new Map([['a', row]]) : { a: row };
        const obs: any = observable(
            syncedCrud<any, any, any>({
                as,
                list: async () => [rowValue('A')],
                update: () => new Promise<void>((resolve) => requests.push(resolve)),
                subscribe: (params) => {
                    push = params.update;
                },
            }),
        );
        obs.get();
        await releaseTick();
        const row = as === 'value' ? obs : as === 'array' ? obs[0] : obs.a;
        row.value.set('B');
        await releaseTick();
        row.value.set('A');
        await releaseTick();
        row.set(rowValue('A', 2));
        await releaseTick();
        obs.set(pack(rowValue('A', 3)));
        await releaseTick();
        push({ value: [rowValue('B', 0, 1)], mode: 'set' });
        await releaseTick();
        expect(obs.peek()).toEqual(pack(rowValue('A', 3, 1)));
        expect(Object.keys(syncState(obs).getPendingChanges() || {})).not.toHaveLength(0);
        push({ value: [rowValue('A', 3, 1)], mode: 'set' });
        await releaseTick();
        expect(syncState(obs).getPendingChanges()).toEqual({});
        for (const resolve of requests) resolve();
        await releaseTick();
        expect(obs.peek()).toEqual(pack(rowValue('A', 3, 1)));
    });
}

test('array order and descendant reversion markers coexist while untouched metadata advances', async () => {
    let push!: (params: any) => void;
    const rows = (a: number, b: number, server = 0) => [
        { id: 'a', value: a, server },
        { id: 'b', value: b, server },
    ];
    const requests: (() => void)[] = [];
    const obs: any = observable(
        syncedCrud<any, any, 'array'>({
            as: 'array',
            list: async () => rows(0, 0),
            update: () => new Promise<void>((resolve) => requests.push(resolve)),
            subscribe: (params) => {
                push = params.update;
            },
        }),
    );
    obs.get();
    await releaseTick();
    obs.set(rows(0, 1).reverse());
    await releaseTick();
    obs.set(rows(0, 0));
    await releaseTick();
    obs.set(rows(0, 2));
    await releaseTick();
    push({ value: rows(0, 1, 1).reverse(), mode: 'set' });
    await releaseTick();
    expect(obs.peek()).toEqual(rows(0, 2, 1));
    const history = (syncState(obs).getPendingChanges() as PendingChanges)?.[''].h;
    expect(history).toContainEqual([]);
    expect(history).toContainEqual(['b', 'value']);
    push({ value: rows(0, 2, 1), mode: 'set' });
    await releaseTick();
    expect(syncState(obs).getPendingChanges()).toEqual({});
    for (const resolve of requests) resolve();
    await releaseTick();
});

test('array membership reversions retain a recreated row until a matching confirmation', async () => {
    let push!: (params: any) => void;
    const rows = (server = 0) => [
        { id: 'a', value: 0, server },
        { id: 'b', value: 0, server },
    ];
    const requests: (() => void)[] = [];
    const hold = () => new Promise<void>((resolve) => requests.push(resolve));
    const obs: any = observable(
        syncedCrud<any, any, 'array'>({
            as: 'array',
            list: async () => rows(),
            create: hold as any,
            delete: hold,
            update: hold,
            subscribe: (params) => {
                push = params.update;
            },
        }),
    );
    obs.get();
    await releaseTick();
    obs.set(rows().slice(0, 1));
    await releaseTick();
    obs.set(rows());
    await releaseTick();
    push({ value: rows(1).slice(0, 1), mode: 'set' });
    await releaseTick();
    expect(obs.peek()).toEqual([rows(1)[0], rows()[1]]);
    push({ value: rows(2), mode: 'set' });
    await releaseTick();
    expect(obs.peek()).toEqual([rows(2)[0], rows()[1]]);
    expect(Object.keys(syncState(obs).getPendingChanges() || {})).not.toHaveLength(0);
    push({ value: [rows(2)[0], rows()[1]], mode: 'set' });
    await releaseTick();
    expect(syncState(obs).getPendingChanges()).toEqual({});
    push({ value: rows(2), mode: 'set' });
    await releaseTick();
    expect(obs.peek()).toEqual(rows(2));
    for (const resolve of requests) resolve();
    await releaseTick();
});

for (const kind of ['Map', 'slash-key'] as const) {
    test(`${kind}: persisted history paths preserve key identity`, async () => {
        const pack = (a: number, b: number, server = 0): any =>
            kind === 'Map'
                ? new Map<any, any>([
                      [1, { value: a, server }],
                      ['1', { value: b, server }],
                  ])
                : { 'a/b': { value: a, server }, a: { b: { value: b, server } } };
        let push!: (params: any) => void;
        const requests: (() => void)[] = [];
        const obs: any = observable(pack(0, 0));
        syncObservable(obs, {
            get: async () => pack(0, 0),
            set: () => new Promise<void>((resolve) => requests.push(resolve)),
            subscribe: (params) => {
                push = params.update;
            },
        });
        obs.get();
        await releaseTick();
        obs.set(pack(1, 0));
        await releaseTick();
        obs.set(pack(0, 2));
        await releaseTick();
        obs.set(pack(0, 3));
        await releaseTick();
        push({ value: pack(1, 0, 1), mode: 'set' });
        await releaseTick();
        expect(obs.peek()).toEqual(pack(0, 3, 1));
        const history = (syncState(obs).getPendingChanges() as PendingChanges)?.[''].h;
        expect(history).toContainEqual(kind === 'Map' ? [1, 'value'] : ['a/b', 'value']);
        expect(history).toContainEqual(kind === 'Map' ? ['1', 'value'] : ['a', 'b', 'value']);
        push({ value: pack(0, 3, 1), mode: 'set' });
        await releaseTick();
        expect(syncState(obs).getPendingChanges()).toEqual({});
        for (const resolve of requests) resolve();
        await releaseTick();
    });
}

test('legacy pending history keeps ambiguous reversions until a matching complete snapshot', async () => {
    const name = getPersistName();
    localStorage.setItem(name, JSON.stringify({ id: 'a', value: 'A', server: 0 }));
    localStorage.setItem(
        name + '__m',
        JSON.stringify({
            pending: { '': { p: { id: 'a', value: 'A', server: 0 }, v: { id: 'a', value: 'A', server: 0 }, t: [] } },
        }),
    );
    let push!: (params: any) => void;
    const requests: (() => void)[] = [];
    const obs: any = observable(
        syncedCrud<any, any, 'value'>({
            as: 'value',
            get: async () => ({ id: 'a', value: 'B', server: 1 }),
            update: () => new Promise<void>((resolve) => requests.push(resolve)),
            subscribe: (params) => {
                push = params.update;
            },
            persist: { name, plugin: new ObservablePersistLocalStorage(), retrySync: true },
        }),
    );
    obs.get();
    await releaseTick();
    await releaseTick();
    expect(obs.peek()).toEqual({ id: 'a', value: 'A', server: 0 });
    expect((syncState(obs).getPendingChanges() as PendingChanges)?.[''].h).toContainEqual(['value']);
    push({ value: [{ id: 'a', value: 'A', server: 0 }], mode: 'set' });
    await releaseTick();
    expect(syncState(obs).getPendingChanges()).toEqual({});
    for (const resolve of requests) resolve();
    await releaseTick();
});

test('history reflection failure conservatively retains pending data without throwing', async () => {
    let push!: (params: any) => void;
    const requests: (() => void)[] = [];
    const obs: any = observable({ value: 0, server: 0 });
    syncObservable(obs, {
        get: async () => ({ value: 0, server: 0 }),
        set: () => new Promise<void>((resolve) => requests.push(resolve)),
        subscribe: (params) => {
            push = params.update;
        },
    });
    obs.get();
    await releaseTick();
    obs.set({ value: 1, server: 0 });
    await releaseTick();
    const entry = (syncState(obs).getPendingChanges() as PendingChanges)[''];
    entry.p = new Proxy(
        { value: 0, server: 0 },
        {
            ownKeys: () => {
                throw Error('inaccessible history');
            },
        },
    );
    obs.set({ value: 0, server: 0 });
    await releaseTick();
    expect(entry.h).toBeUndefined();
    push({ value: { value: 1, server: 1 }, mode: 'set' });
    await releaseTick();
    expect(obs.peek()).toEqual({ value: 0, server: 0 });
    expect(syncState(obs).error.peek()).toBeUndefined();
    push({ value: { value: 0, server: 0 }, mode: 'set' });
    await releaseTick();
    expect(syncState(obs).getPendingChanges()).toEqual({});
    for (const resolve of requests) resolve();
    await releaseTick();
});

for (const as of ['object', 'array', 'Map'] as const) {
    test(`${as}: an absorbed child reversion survives a later sibling edit`, async () => {
        let push!: (params: any) => void;
        const requests: (() => void)[] = [];
        const value = (edit: number, extra = 0, server = 0) => ({ id: 'a', value: edit, extra, server });
        const obs: any = observable(
            syncedCrud<any, any, any>({
                as,
                list: async () => [value(0)],
                update: () => new Promise<void>((resolve) => requests.push(resolve)),
                subscribe: (params) => {
                    push = params.update;
                },
            }),
        );
        obs.get();
        await releaseTick();
        const row = as === 'array' ? obs[0] : obs.a;
        row.set(value(1));
        await releaseTick();
        row.value.set(0);
        await releaseTick();
        row.extra.set(2);
        await releaseTick();
        push({ value: [value(1, 0, 1)], mode: 'set' });
        await releaseTick();
        expect(row.peek()).toEqual(value(0, 2, 1));
        push({ value: [value(0, 2, 1)], mode: 'set' });
        await releaseTick();
        expect(syncState(obs).getPendingChanges()).toEqual({});
        for (const resolve of requests) resolve();
        await releaseTick();
    });
}

test('wider pending replacements absorb descendants without absorbing sibling key prefixes', async () => {
    let push!: (params: any) => void;
    const requests: (() => void)[] = [];
    const rows = (a: number, ab: number, server = 0) => [
        { id: 'a', value: a, server },
        { id: 'ab', value: ab, server },
    ];
    const obs: any = observable(
        syncedCrud<any, any, 'object'>({
            as: 'object',
            list: async () => rows(0, 0),
            update: () => new Promise<void>((resolve) => requests.push(resolve)),
            subscribe: (params) => {
                push = params.update;
            },
        }),
    );
    obs.get();
    await releaseTick();
    obs.ab.value.set(1);
    await releaseTick();
    obs.a.value.set(1);
    await releaseTick();
    obs.a.set(rows(0, 0)[0]);
    await releaseTick();
    push({ value: rows(1, 0, 1), mode: 'set' });
    await releaseTick();
    expect(obs.peek()).toEqual(Object.fromEntries(rows(0, 1, 1).map((row) => [row.id, row])));
    expect(syncState(obs).getPendingChanges()).toHaveProperty('ab/value');
    push({ value: rows(0, 1, 1), mode: 'set' });
    await releaseTick();
    expect(syncState(obs).getPendingChanges()).toEqual({});
    for (const resolve of requests) resolve();
    await releaseTick();
});
for (const as of ['object', 'array', 'Map', 'value'] as const) {
    test.each([
        ['wait', 'confirm'],
        ['wait', 'delete'],
        ['transform', 'confirm'],
        ['transform', 'delete'],
    ])(`${as}: cancelling a create during %s by %s preserves its ownership`, async (boundary, action) => {
        const ready = observable(false);
        let release!: () => void;
        let push!: (params: any) => void;
        let creates = 0;
        let deletes = 0;
        let entered = false;
        const obs: any = observable(
            syncedCrud<any, any, any>({
                as,
                list: async () => [],
                fieldCreatedAt: 'createdAt',
                waitForSet:
                    boundary === 'wait'
                        ? () => {
                              entered = true;
                              return ready;
                          }
                        : undefined,
                transform:
                    boundary === 'transform'
                        ? {
                              save: (value) => {
                                  entered = true;
                                  return new Promise((resolve) => {
                                      release = () => resolve(value);
                                  });
                              },
                          }
                        : undefined,
                create: async (input) => {
                    creates++;
                    return input;
                },
                delete: async () => {
                    deletes++;
                },
                subscribe: (params) => {
                    push = params.update;
                },
            }),
        );
        obs.get();
        await releaseTick();
        if (as === 'value') obs.set({ id: 'x', value: 1 });
        else if (as === 'array') obs.push({ id: 'x', value: 1 });
        else obs.x.set({ id: 'x', value: 1 });
        await releaseTick();
        expect(entered).toBe(true);
        if (action === 'confirm') push({ value: [{ id: 'x', value: 1, createdAt: 1 }], mode: 'set' });
        else if (as === 'value') obs.set(null);
        else if (as === 'array') obs.splice(0, 1);
        else obs.x.delete();
        await releaseTick();
        if (boundary === 'wait') ready.set(true);
        else release();
        await releaseTick();
        expect(creates).toBe(0);
        expect(deletes).toBe(0);
        const row = as === 'value' ? obs : as === 'array' ? obs[0] : obs.x;
        expect(row.peek()).toEqual(
            action === 'confirm' ? { id: 'x', value: 1, createdAt: 1 } : as === 'value' ? null : undefined,
        );
        expect(syncState(obs).getPendingChanges()).toEqual({});
        expect(syncState(obs).numPendingSets.peek()).toBe(0);
        expect(syncState(obs).error.peek()).toBeUndefined();
    });
}

for (const as of ['object', 'array', 'Map'] as const) {
    test.each([
        [false, false],
        [false, true],
        [true, false],
        [true, true],
    ])(
        `${as}: a cancelled shared root accepts its sibling normalization (onSaved=%s transform=%s)`,
        async (callback, transformed) => {
            let push!: (params: any) => void;
            let creates = 0;
            const name = getPersistName();
            const normalize = (input: any) => ({ ...input, value: 10, server: 1 });
            const obs: any = observable(
                syncedCrud<any, any, any>({
                    as,
                    fieldCreatedAt: 'createdAt',
                    list: async () => [{ id: 'y', value: 0, createdAt: 1 }],
                    create: async () => {
                        creates++;
                        throw Error('retry create');
                    },
                    update: async (input) => (callback ? input : { ...input, value: transformed ? 20 : 10, server: 1 }),
                    transform: transformed
                        ? {
                              save: (value) => ({ ...value, value: value.value * 2 }),
                              load: (value) => ({ ...value, value: value.value / 2 }),
                          }
                        : undefined,
                    onSaved: callback ? ({ saved }) => normalize(saved) : undefined,
                    subscribe: (params) => {
                        push = params.update;
                    },
                    retry: { times: 2, delay: 40, backoff: 'constant' },
                    persist: { name, plugin: ObservablePersistLocalStorage },
                }),
            );
            obs.get();
            await releaseTick();
            const rows = [
                { id: 'y', value: 1, createdAt: 1 },
                { id: 'x', value: 2 },
            ];
            obs.set(
                as === 'array'
                    ? rows
                    : as === 'Map'
                      ? new Map(rows.map((row) => [row.id, row]))
                      : Object.fromEntries(rows.map((row) => [row.id, row])),
            );
            await releaseTick();
            push({
                value: [
                    { id: 'y', value: transformed ? 20 : 10, server: 1, createdAt: 1 },
                    { id: 'x', value: 0, createdAt: 2 },
                ],
                mode: 'set',
            });
            await promiseTimeout(60);
            expect((as === 'array' ? obs[0] : obs.y).peek()).toEqual({
                id: 'y',
                value: 10,
                server: 1,
                createdAt: 1,
            });
            expect((as === 'array' ? obs[1] : obs.x).peek()).toEqual({
                id: 'x',
                value: 2,
                createdAt: 2,
            });
            expect(creates).toBe(1);
            expect(syncState(obs).numPendingSets.peek()).toBe(0);
            expect(Object.keys(syncState(obs).getPendingChanges()!)).toHaveLength(1);
            expect(safeParse(localStorage.getItem(name + '__m')!).pending).toEqual(syncState(obs).getPendingChanges());
            push({
                value: [
                    { id: 'y', value: transformed ? 20 : 10, server: 1, createdAt: 1 },
                    { id: 'x', value: transformed ? 4 : 2, createdAt: 2 },
                ],
                mode: 'set',
            });
            await releaseTick();
            expect(syncState(obs).getPendingChanges()).toEqual({});
            expect(safeParse(localStorage.getItem(name + '__m')!).pending || {}).toEqual({});
            expect(syncState(obs).error.peek()).toBeUndefined();
        },
    );

    test(`${as}: partial root confirmation waits for a complete snapshot`, async () => {
        let push!: (params: any) => void;
        const requests: (() => void)[] = [];
        const rows = (value: number) => [
            { id: 'a', value },
            { id: 'b', value },
        ];
        const obs: any = observable(
            syncedCrud<any, any, any>({
                as,
                list: async () => rows(0),
                update: (input) => new Promise((resolve) => requests.push(() => resolve(input))),
                subscribe: (params) => {
                    push = params.update;
                },
            }),
        );
        obs.get();
        await releaseTick();
        const next = rows(1);
        obs.set(
            as === 'array'
                ? next
                : as === 'Map'
                  ? new Map(next.map((row) => [row.id, row]))
                  : Object.fromEntries(next.map((row) => [row.id, row])),
        );
        await releaseTick();
        push({ value: rows(1), mode: 'assign' });
        await releaseTick();
        expect(Object.keys(syncState(obs).getPendingChanges()!)).toHaveLength(1);
        push({ value: rows(1), mode: 'set' });
        await releaseTick();
        expect(syncState(obs).getPendingChanges()).toEqual({});
        for (const resolve of requests) resolve();
        await releaseTick();
        expect(syncState(obs).numPendingSets.peek()).toBe(0);
        expect(syncState(obs).error.peek()).toBeUndefined();
    });
}

test.each([
    [
        ['0', '1', 'tail'],
        ['0', '1', 'tail'],
    ],
    [
        ['tail', '2', '1'],
        ['1', '2', 'tail'],
    ],
    [
        ['2', '1', '0'],
        ['0', '1', '2'],
    ],
    [['x', 'x'], ['x']],
    [['1', 1], [1]],
])('root array saves retain record ordering and duplicate handling for %s', async (ids, expectedIds) => {
    const saved: any[] = [];
    const obs: any = observable(
        syncedCrud<any, any, 'array'>({
            as: 'array',
            list: async () => ids.map((id, value) => ({ id, value })),
            update: async (input) => {
                saved.push(clone(input));
                return input;
            },
        }),
    );
    obs.get();
    await releaseTick();
    obs.set(ids.map((id, value) => ({ id, value: value + 10 })));
    await releaseTick();
    expect(saved.map((row) => row.id)).toEqual(expectedIds);
    if (ids.length !== expectedIds.length) expect(saved[0].value).toBe(ids.length + 9);
    expect(syncState(obs).getPendingChanges()).toEqual({});
    expect(syncState(obs).error.peek()).toBeUndefined();
});

test('a late array fallback reads a previous ID getter only once during classification', async () => {
    let reads = 0;
    const saved: any[] = [];
    const errors: string[] = [];
    const obs: any = observable(
        syncedCrud<any, any, 'array'>({
            as: 'array',
            list: async () => [
                { id: '0', value: 0 },
                { id: '2', value: 2 },
                { id: '1', value: 1 },
            ],
            update: async (input) => {
                saved.push(clone(input));
                return input;
            },
            onError: (error) => errors.push(error.message),
        }),
    );
    obs.get();
    await releaseTick();
    Object.defineProperty(obs.peek()[0], 'id', {
        enumerable: true,
        configurable: true,
        get: () => {
            if (++reads > 4) throw Error('repeated previous ID read');
            return '0';
        },
    });
    obs.set([
        { id: '0', value: 10 },
        { id: '2', value: 12 },
        { id: '1', value: 11 },
    ]);
    await releaseTick();
    expect(reads).toBe(4);
    expect(saved).toEqual([
        { id: '0', value: 10 },
        { id: '1', value: 11 },
        { id: '2', value: 12 },
    ]);
    expect(errors).toEqual([]);
    expect(syncState(obs).getPendingChanges()).toEqual({});
});

for (const as of ['value', 'object', 'array', 'Map'] as const)
    test(`${as}: restoring a removed row retains authored fields through an older echo`, async () => {
        let push!: (p: any) => void;
        const releases: (() => void)[] = [];
        const hold = () => new Promise<void>((resolve) => releases.push(resolve));
        const obs: any = observable(
            syncedCrud<any, any, any>({
                as,
                list: async () => [{ id: 'a', value: 'A', server: 0 }],
                create: hold as any,
                delete: hold,
                update: hold,
                subscribe: (params) => {
                    push = params.update;
                },
            }),
        );
        obs.get();
        await when(syncState(obs).isLoaded);
        if (as === 'value') obs.set(null);
        else if (as === 'array') obs.splice(0, 1);
        else obs.a.delete();
        await releaseTick();
        if (as === 'value') obs.set({ id: 'a', value: 'A', server: 0 });
        else if (as === 'array') obs.push({ id: 'a', value: 'A', server: 0 });
        else obs.a.set({ id: 'a', value: 'A', server: 0 });
        await releaseTick();
        push({ value: [{ id: 'a', value: 'B', server: 1 }], mode: 'set' });
        await releaseTick();
        const row = as === 'value' ? obs : as === 'array' ? obs[0] : obs.a;
        expect(row.peek()).toEqual({ id: 'a', value: 'A', server: 0 });
        expect(Object.keys(syncState(obs).getPendingChanges()!)).not.toHaveLength(0);
        push({ value: [{ id: 'a', value: 'A', server: 0 }], mode: 'set' });
        await releaseTick();
        expect(syncState(obs).getPendingChanges()).toEqual({});
        for (const release of releases) release();
        await when(() => !syncState(obs).isSetting.get());
        expect(row.peek()).toEqual({ id: 'a', value: 'A', server: 0 });
        expect(syncState(obs).error.peek()).toBeUndefined();
    });

for (const serialized of [null, undefined])
    for (const response of ['direct', 'callback', 'buffered'] as const)
        test(`CRUD ${response} response serialized to ${serialized} acknowledges without losing a newer edit`, async () => {
            const requests: { input: any; resolve: (value: any) => void }[] = [];
            const errors: string[] = [];
            let reads = 0;
            const empty = {
                toJSON: () => {
                    reads++;
                    return serialized;
                },
            };
            const obs = observable(
                syncedCrud<any, any, 'object'>({
                    as: 'object',
                    list: async () => [
                        { id: 'a', value: 0 },
                        { id: 'b', value: 0 },
                    ],
                    update: (input) => new Promise((resolve) => requests.push({ input: clone(input), resolve })),
                    onSaved:
                        response === 'direct'
                            ? undefined
                            : ({ input }) =>
                                  response === 'callback' && input.id === 'a' && input.value === 1 ? empty : undefined,
                    onError: (error) => errors.push(error.message),
                }),
            );
            obs.get();
            await when(syncState(obs).isLoaded);
            batch(() => {
                obs.a.value.set(1);
                if (response === 'buffered') obs.b.value.set(1);
            });
            await releaseTick();
            const oldCount = requests.length;
            expect(oldCount).toBe(response === 'buffered' ? 2 : 1);
            obs.a.value.set(2);
            await releaseTick();
            for (const request of requests.slice(0, oldCount)) {
                request.resolve(request.input.id === 'a' && response !== 'callback' ? empty : request.input);
            }
            await releaseTick();
            expect(reads).toBe(1);
            expect(errors).toEqual([]);
            expect(obs.a.value.peek()).toBe(2);
            expect(syncState(obs).numPendingSets.peek()).toBe(1);
            requests[oldCount].resolve(requests[oldCount].input);
            await when(() => !syncState(obs).isSetting.get());
            expect(obs.a.value.peek()).toBe(2);
            expect(obs.b.value.peek()).toBe(response === 'buffered' ? 1 : 0);
            expect(syncState(obs).getPendingChanges()).toEqual({});
            expect(syncState(obs).numPendingSets.peek()).toBe(0);
            expect(syncState(obs).error.peek()).toBeUndefined();
        });

for (const held of [false, true])
    for (const removeFirst of [false, true])
        test(`batched value ID selection updates its new ID without deleting the old ID (held=${held}, remove=${removeFirst})`, async () => {
            let release!: (row: any) => void;
            const created: any[] = [];
            const updated: any[] = [];
            const deleted: string[] = [];
            const errors: string[] = [];
            const initial = { id: 'old', value: 1 };
            const obs = observable(
                syncedCrud<any, any>({
                    as: 'value',
                    initial,
                    get: () =>
                        held
                            ? new Promise((resolve) => {
                                  release = resolve;
                              })
                            : Promise.resolve(clone(initial)),
                    create: async (input) => {
                        created.push(clone(input));
                        return input;
                    },
                    update: async (input) => {
                        updated.push(clone(input));
                        return input;
                    },
                    delete: async (input) => {
                        deleted.push(input.id);
                    },
                    onError: (error) => errors.push(error.message),
                }),
            );
            obs.get();
            if (held) await releaseTick();
            else await when(syncState(obs).isLoaded);
            batch(() => {
                if (removeFirst) obs.set(null);
                obs.set({ id: 'new', value: 2 });
            });
            await releaseTick();
            if (held) release(clone(initial));
            await releaseTick();
            expect(created).toEqual([]);
            expect(updated).toEqual([{ id: 'new', value: 2 }]);
            expect(deleted).toEqual([]);
            expect(obs.peek()).toEqual({ id: 'new', value: 2 });
            expect(errors).toEqual([]);
            expect(syncState(obs).getPendingChanges()).toEqual({});
            expect(syncState(obs).numPendingSets.peek()).toBe(0);
        });

for (const as of ['object', 'array', 'Map'] as const)
    for (const callback of [false, true])
        test(`${as}: a failed sibling waits for the remaining response (onSaved=${callback})`, async () => {
            let release!: (row: any) => void;
            const errors: string[] = [];
            const obs: any = observable(
                syncedCrud<any, any, any>({
                    as,
                    list: async () => [
                        { id: 'a', value: 0 },
                        { id: 'b', value: 0 },
                    ],
                    updatePartial: true,
                    update: async (input) => {
                        if (input.id === 'a') throw Error('first failed');
                        return new Promise((resolve) => {
                            release = resolve;
                        });
                    },
                    onSaved: callback ? ({ saved }) => ({ ...saved, value: 10 }) : undefined,
                    onError: (error) => errors.push(error.message),
                }),
            );
            obs.get();
            await when(syncState(obs).isLoaded);
            const a = as === 'array' ? obs[0] : obs.a;
            const b = as === 'array' ? obs[1] : obs.b;
            batch(() => {
                a.value.set(1);
                b.value.set(1);
            });
            await releaseTick();
            const stillSetting = syncState(obs).isSetting.peek();
            release({ id: 'b', value: 10 });
            await releaseTick();
            expect(stillSetting).toBe(true);
            expect(a.value.peek()).toBe(1);
            expect(b.value.peek()).toBe(10);
            expect(Object.keys(syncState(obs).getPendingChanges()!)).toEqual([as === 'array' ? '0/value' : 'a/value']);
            expect(syncState(obs).numPendingSets.peek()).toBe(0);
            expect(errors).toEqual(['first failed']);
        });

for (const history of ['legacy', 'active'] as const)
    for (const as of ['array', 'object', 'Map'] as const)
        for (const mode of as === 'array' ? ['append', 'prepend'] : ['assign'])
            test(`${as}: ${history} pending roots keep repeated ${mode} deltas and local removals`, async () => {
                const name = getPersistName();
                const a = { id: 'a', value: 'A', updatedAt: 1 };
                const oldA = { ...a, value: 'old' };
                const deleted = { id: 'd', value: 'deleted', updatedAt: 1 };
                const b = { id: 'b', value: 'new', updatedAt: 2 };
                const c = { id: 'c', value: 'newer', updatedAt: 3 };
                const pack = (rows: any[]) =>
                    as === 'array'
                        ? rows
                        : as === 'Map'
                          ? new Map(rows.map((row) => [row.id, row]))
                          : Object.fromEntries(rows.map((row) => [row.id, row]));
                if (history === 'legacy') {
                    localStorage.setItem(name, safeStringify(pack([a])));
                    localStorage.setItem(
                        name + '__m',
                        safeStringify({
                            lastSync: 1,
                            pending: { '': { p: pack([oldA, deleted]), v: pack([a]), t: [] } },
                        }),
                    );
                }
                let remote = history === 'legacy' ? [b, { ...deleted, updatedAt: 2 }] : [oldA, deleted];
                const seen: any[] = [];
                const creates: any[] = [];
                const errors: string[] = [];
                const releases: (() => void)[] = [];
                const hold = (input: any) => new Promise<any>((resolve) => releases.push(() => resolve(input)));
                let push!: (params: any) => void;
                const obs: any = observable(
                    syncedCrud<any, any, any>({
                        as,
                        mode: mode === 'prepend' ? 'prepend' : undefined,
                        fieldUpdatedAt: 'updatedAt',
                        changesSince: 'last-sync',
                        list: async ({ lastSync }) => {
                            seen.push(lastSync);
                            return clone(remote);
                        },
                        update: hold,
                        delete: hold,
                        create: async (input) => {
                            creates.push(input);
                            return input;
                        },
                        subscribe: (params) => {
                            push = params.update;
                        },
                        onError: (error) => errors.push(error.message),
                        persist: { name, plugin: new ObservablePersistLocalStorage(), retrySync: true },
                    }),
                );
                obs.get();
                await when(syncState(obs).isLoaded);
                await releaseTick();
                if (history === 'active') {
                    expect(obs.peek()).toEqual(pack([oldA, deleted]));
                    obs.set(pack([a]));
                    await releaseTick();
                    expect((syncState(obs).getPendingChanges()![''] as any).h).toEqual([]);
                    remote = [b, { ...deleted, updatedAt: 2 }];
                    await syncState(obs).sync();
                    await releaseTick();
                }
                expect(obs.peek()).toEqual(pack(mode === 'prepend' ? [b, a] : [a, b]));
                expect(syncState(obs).getPendingChanges()!['']).toBeDefined();
                await when(() => syncState(obs).lastSync.get() === 2);
                remote = [c];
                await syncState(obs).sync();
                await releaseTick();
                expect(obs.peek()).toEqual(pack(mode === 'prepend' ? [c, b, a] : [a, b, c]));
                await when(() => syncState(obs).lastSync.get() === 3);
                const subscribedB = { ...b, value: 'subscription' };
                push({ value: [{ id: 'b', value: 'subscription' }], mode: 'merge' });
                await releaseTick();
                const rows = mode === 'prepend' ? [c, subscribedB, a] : [a, subscribedB, c];
                expect(obs.peek()).toEqual(pack(rows));
                remote = [{ ...deleted, updatedAt: 4 }];
                await syncState(obs).sync();
                await releaseTick();
                expect(obs.peek()).toEqual(pack(rows));
                await when(() => syncState(obs).lastSync.get() === 4);
                const updatedB = { ...b, value: 'updated', updatedAt: 5 };
                remote = [updatedB];
                await syncState(obs).sync();
                await releaseTick();
                const finalRows = mode === 'prepend' ? [c, updatedB, a] : [a, updatedB, c];
                expect(obs.peek()).toEqual(pack(finalRows));
                expect(seen).toEqual(history === 'legacy' ? [1, 2, 3, 4] : [undefined, 1, 2, 3, 4]);
                expect(creates).toEqual([]);
                expect(syncState(obs).getPendingChanges()!['']).toBeDefined();
                push({ value: mode === 'prepend' ? [c, oldA] : [oldA, c], mode: 'set' });
                await releaseTick();
                const confirmedRows = mode === 'prepend' ? [c, a] : [a, c];
                expect(obs.peek()).toEqual(pack(confirmedRows));
                expect(syncState(obs).getPendingChanges()!['']).toBeDefined();
                push({ value: confirmedRows, mode: 'set' });
                await releaseTick();
                expect(syncState(obs).getPendingChanges()).toEqual({});
                for (const release of releases) release();
                await when(() => !syncState(obs).isSetting.get());
                expect(obs.peek()).toEqual(pack(confirmedRows));
                expect(errors).toEqual([]);
                expect(syncState(obs).error.peek()).toBeUndefined();
            });

for (const legacy of [false, true])
    for (const as of ['object', 'array', 'Map'] as const)
        test(`${as}: a complete refresh removes a server-added field beside pending edits (legacy=${legacy})`, async () => {
            const name = getPersistName();
            const initial = { id: 'a', value: 0 };
            const edited = { id: 'a', value: 1 };
            const pack = (row: any) => (as === 'array' ? [row] : as === 'Map' ? new Map([['a', row]]) : { a: row });
            if (legacy) {
                localStorage.setItem(name, safeStringify(pack(edited)));
                localStorage.setItem(
                    name + '__m',
                    safeStringify({ pending: { '': { p: pack(initial), v: pack(edited), t: [] } } }),
                );
            }
            let remote: any[] = [initial];
            let push!: (params: any) => void;
            const releases: (() => void)[] = [];
            const obs: any = observable(
                syncedCrud<any, any, any>({
                    as,
                    list: async () => clone(remote),
                    update: () => new Promise<void>((resolve) => releases.push(resolve)),
                    subscribe: (params) => {
                        push = params.update;
                    },
                    persist: { name, plugin: new ObservablePersistLocalStorage(), retrySync: true },
                }),
            );
            obs.get();
            await when(syncState(obs).isLoaded);
            if (!legacy) obs.set(pack(edited));
            await releaseTick();
            remote = [{ ...initial, server: 1 }];
            await syncState(obs).sync();
            await releaseTick();
            expect(obs.peek()).toEqual(pack({ ...edited, server: 1 }));
            remote = [initial];
            await syncState(obs).sync();
            await releaseTick();
            expect(obs.peek()).toEqual(pack(edited));
            expect(syncState(obs).getPendingChanges()!['']).toBeDefined();
            push({ value: [edited], mode: 'set' });
            await releaseTick();
            expect(syncState(obs).getPendingChanges()).toEqual({});
            for (const release of releases) release();
            await when(() => !syncState(obs).isSetting.get());
            expect(obs.peek()).toEqual(pack(edited));
            expect(syncState(obs).error.peek()).toBeUndefined();
        });

for (const legacy of [false, true])
    for (const as of ['object', 'Map'] as const)
        test(`${as}: last-sync deletion removes an untouched server row beside pending edits (legacy=${legacy})`, async () => {
            const name = getPersistName();
            const initial = { id: 'a', value: 0, updatedAt: 1 };
            const edited = { ...initial, value: 1 };
            const b = { id: 'b', value: 2, updatedAt: 2 };
            const pack = (rows: any[]) =>
                as === 'Map'
                    ? new Map(rows.map((row) => [row.id, row]))
                    : Object.fromEntries(rows.map((row) => [row.id, row]));
            if (legacy) {
                localStorage.setItem(name, safeStringify(pack([edited])));
                localStorage.setItem(
                    name + '__m',
                    safeStringify({ lastSync: 1, pending: { '': { p: pack([initial]), v: pack([edited]), t: [] } } }),
                );
            }
            let remote: any[] = legacy ? [b] : [initial];
            let push!: (params: any) => void;
            const releases: (() => void)[] = [];
            const obs: any = observable(
                syncedCrud<any, any, any>({
                    as,
                    changesSince: 'last-sync',
                    fieldUpdatedAt: 'updatedAt',
                    fieldDeleted: 'deleted',
                    list: async () => clone(remote),
                    update: () => new Promise<void>((resolve) => releases.push(resolve)),
                    subscribe: (params) => {
                        push = params.update;
                    },
                    persist: { name, plugin: new ObservablePersistLocalStorage(), retrySync: true },
                }),
            );
            obs.get();
            await when(syncState(obs).isLoaded);
            if (!legacy) {
                obs.set(pack([edited]));
                await releaseTick();
                remote = [b];
                await syncState(obs).sync();
            }
            await releaseTick();
            expect(obs.peek()).toEqual(pack([edited, b]));
            await when(() => syncState(obs).lastSync.get() === 2);
            remote = [{ ...b, deleted: true, updatedAt: 3 }];
            await syncState(obs).sync();
            await releaseTick();
            expect(obs.peek()).toEqual(pack([edited]));
            expect(syncState(obs).getPendingChanges()!['']).toBeDefined();
            await when(() => syncState(obs).lastSync.get() === 3);
            push({ value: [edited], mode: 'set' });
            await releaseTick();
            expect(syncState(obs).getPendingChanges()).toEqual({});
            for (const release of releases) release();
            await when(() => !syncState(obs).isSetting.get());
            expect(obs.peek()).toEqual(pack([edited]));
            expect(syncState(obs).error.peek()).toBeUndefined();
        });

for (const timestamped of [false, true])
    test(`selecting an existing value ID does not delete the previous row (timestamped=${timestamped})`, async () => {
        const deleted: string[] = [];
        const updated: any[] = [];
        const created: any[] = [];
        const initial = { id: 'old', value: 1, ...(timestamped ? { createdAt: 1 } : {}) };
        const next = { id: 'new', value: 2, ...(timestamped ? { createdAt: 2 } : {}) };
        const obs: any = observable(
            syncedCrud<any, any, 'value'>({
                as: 'value',
                get: async () => clone(initial),
                fieldCreatedAt: timestamped ? 'createdAt' : undefined,
                create: timestamped
                    ? async (input) => {
                          created.push(input);
                          return input;
                      }
                    : undefined,
                update: async (input) => {
                    updated.push(input);
                    return input;
                },
                delete: async (input) => {
                    deleted.push(input.id);
                },
            }),
        );
        obs.get();
        await when(syncState(obs).isLoaded);
        obs.set(next);
        await releaseTick();
        expect(deleted).toEqual([]);
        expect(created).toEqual([]);
        expect(updated).toEqual([next]);
        expect(obs.peek()).toEqual(next);
        expect(syncState(obs).getPendingChanges()).toEqual({});
        expect(syncState(obs).numPendingSets.peek()).toBe(0);
        expect(syncState(obs).error.peek()).toBeUndefined();
    });

describe('pending history after a persistence restart', () => {
    const tick = () => promiseTimeout(0);
    const wait = async (check: () => boolean) => {
        for (let i = 0; i < 300; i++) {
            if (check()) return;
            await tick();
        }
        throw Error('reload probe timed out');
    };
    for (const as of ['object', 'Map'] as const)
        test(`${as}: persisted reversion history retains A and accepted B through replay`, async () => {
            const name = 'reload-root-' + as;
            const stored = new Map<string, string>();
            const storage = (rows: Map<string, string>) => ({
                getItem: (key: string) => rows.get(key) ?? null,
                setItem: (key: string, value: string) => rows.set(key, value),
                removeItem: (key: string) => rows.delete(key),
            });
            const pack = (rows: any[]) =>
                as === 'Map'
                    ? new Map(rows.map((row) => [row.id, row]))
                    : Object.fromEntries(rows.map((row) => [row.id, row]));
            const a = { id: 'a', value: 0, updatedAt: 1 };
            const localA = { ...a };
            const d = { id: 'd', value: 0, updatedAt: 1 };
            const localD = { ...d, value: 1 };
            const b = { id: 'b', value: 2, updatedAt: 2 };
            let remote = [a, d];
            const originalReleases: (() => void)[] = [];
            let requested = false;
            const original: any = observable(
                syncedCrud<any, any, any>({
                    as,
                    fieldUpdatedAt: 'updatedAt',
                    changesSince: 'last-sync',
                    list: async () => structuredClone(remote),
                    update: (input) => {
                        requested = true;
                        return new Promise((resolve) => originalReleases.push(() => resolve(input)));
                    },
                    onError: () => {},
                    persist: {
                        name,
                        plugin: new ObservablePersistLocalStorageBase(storage(stored) as any),
                        retrySync: true,
                    },
                }),
            );
            original.get();
            await when(syncState(original).isLoaded);
            original.set(pack([{ ...a, value: 1 }, localD]));
            await wait(() => requested);
            original.set(pack([localA, localD]));
            await tick();
            remote = [b];
            await syncState(original).sync();
            await tick();
            expect(as === 'Map' ? original.peek().get('b') : original.peek().b).toEqual(b);
            for (let i = 0; i < 5; i++) await tick();
            const restartedStorage = new Map(stored);
            const replayed: any[] = [];
            const deleted: any[] = [];
            const created: any[] = [];
            const releases: (() => void)[] = [];
            const persistedCache = safeParse(restartedStorage.get(name)!);
            expect(as === 'Map' ? persistedCache.get('b') : persistedCache.b).toEqual(b);
            const restarted: any = observable(
                syncedCrud<any, any, any>({
                    as,
                    fieldUpdatedAt: 'updatedAt',
                    changesSince: 'last-sync',
                    list: async () => [{ ...a, value: 1 }, d],
                    update: (input) => {
                        replayed.push(input);
                        return new Promise((resolve) => releases.push(() => resolve(input)));
                    },
                    create: async (input) => {
                        created.push(input);
                        return input;
                    },
                    delete: async (input) => {
                        deleted.push(input);
                    },
                    onError: () => {},
                    persist: {
                        name,
                        plugin: new ObservablePersistLocalStorageBase(storage(restartedStorage) as any),
                        retrySync: true,
                    },
                }),
            );
            restarted.get();
            await when(syncState(restarted).isLoaded);
            await wait(() => replayed.length > 0);
            for (let i = 0; i < 5; i++) await tick();
            try {
                expect(as === 'Map' ? restarted.peek().get('a') : restarted.peek().a).toEqual(localA);
                expect(as === 'Map' ? restarted.peek().get('d') : restarted.peek().d).toEqual(localD);
                expect(as === 'Map' ? restarted.peek().get('b') : restarted.peek().b).toEqual(b);
                expect(deleted).toEqual([]);
                expect(created).toEqual([]);
                const consumerCache = safeParse(restartedStorage.get(name)!);
                expect(as === 'Map' ? consumerCache.get('b') : consumerCache.b).toEqual(b);
            } finally {
                releases.splice(0).forEach((resolve) => resolve());
                originalReleases.splice(0).forEach((resolve) => resolve());
            }
            await wait(() => !syncState(restarted).isSetting.peek());
        });
});

test('CRUD array accepted server row survives root ACK and pending drains', async () => {
    let release!: (value: any) => void;
    let push!: (p: any) => void;
    const obs: any = observable(
        syncedCrud<any, any, 'array'>({
            as: 'array',
            list: async () => [{ id: 'a', value: 0 }],
            update: () =>
                new Promise((resolve) => {
                    release = resolve;
                }),
            subscribe: (p) => {
                push = p.update;
            },
        }),
    );
    obs.get();
    const state = syncState(obs);
    await when(state.isLoaded);
    obs.set([{ id: 'a', value: 1 }]);
    await when(state.isSetting);
    push({ value: [{ id: 'b', value: 7 }], mode: 'append' });
    await releaseTick();
    expect(obs.peek()).toEqual([
        { id: 'a', value: 1 },
        { id: 'b', value: 7 },
    ]);
    release({ id: 'a', value: 1 });
    await releaseTick();
    expect(obs.peek()).toEqual([
        { id: 'a', value: 1 },
        { id: 'b', value: 7 },
    ]);
    expect(state.getPendingChanges()).toEqual({});
    expect(state.numPendingSets.peek()).toBe(0);
});

test('selecting a different value ID updates that record without deleting the previous server record', async () => {
    const previous = { id: 'old', value: 1 };
    const next = { id: 'new', value: 2 };
    const server = new Map<string, any>([
        ['old', previous],
        ['new', { id: 'new', value: 0 }],
    ]);
    const created: any[] = [];
    const updated: any[] = [];
    const deleted: any[] = [];
    const errors: string[] = [];
    const obs: any = observable(
        syncedCrud<any, any, 'value'>({
            as: 'value',
            get: async () => clone(previous),
            create: async (input) => {
                created.push(clone(input));
                server.set(input.id, clone(input));
                return input;
            },
            update: async (input) => {
                updated.push(clone(input));
                server.set(input.id, clone(input));
                return input;
            },
            delete: async (input) => {
                deleted.push(clone(input));
                server.delete(input.id);
            },
            onError: (error) => errors.push(error.message),
        }),
    );
    obs.get();
    const state = syncState(obs);
    await when(state.isLoaded);
    obs.set(next);
    await releaseTick();
    expect(created).toEqual([]);
    expect(updated).toEqual([next]);
    expect(deleted).toEqual([]);
    expect(server).toEqual(
        new Map([
            ['old', previous],
            ['new', next],
        ]),
    );
    expect(obs.peek()).toEqual(next);
    expect(errors).toEqual([]);
    expect(state.getPendingChanges()).toEqual({});
    expect(state.numPendingSets.peek()).toBe(0);
    expect(state.error.peek()).toBeUndefined();
});

describe('literal CRUD Map normalization fields', () => {
    for (const existing of [false, true])
        test(`saved method and prototype fields remain row data existing=${existing}`, async () => {
            const fields = (value: number) =>
                JSON.parse(
                    `{"__proto__":{"literalCrudField":${value}},"constructor":{"saved":${value}},"get":{"saved":${value}},"set":{"saved":${value}},"peek":{"saved":${value}},"assign":{"saved":${value}}}`,
                );
            const old = Object.getOwnPropertyDescriptor(Object.prototype, 'literalCrudField');
            const response = { id: 'r', value: 1, ...fields(2) };
            const obs: any = observable(
                syncedCrud<any, any, 'Map'>({
                    as: 'Map',
                    list: () => [{ id: 'r', value: 0, ...(existing ? fields(0) : {}) }],
                    update: async () => response,
                }),
            );
            try {
                obs.get();
                await releaseTick();
                obs.set(new Map([['r', { id: 'r', value: 1, ...(existing ? fields(0) : {}) }]]));
                await releaseTick();
                expect(Object.getOwnPropertyDescriptor(Object.prototype, 'literalCrudField')).toEqual(old);
                const row = obs.peek().get('r');
                expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
                for (const key of Object.keys(fields(2)))
                    expect(Object.getOwnPropertyDescriptor(row, key)!.value).toEqual(response[key]);
                expect(response).toEqual({ id: 'r', value: 1, ...fields(2) });
                expect(syncState(obs).error.peek()).toBeUndefined();
                expect(syncState(obs).getPendingChanges()).toEqual({});
                expect(syncState(obs).numPendingSets.peek()).toBe(0);
            } finally {
                if (old) Object.defineProperty(Object.prototype, 'literalCrudField', old);
                else delete (Object.prototype as any).literalCrudField;
            }
        });
});

describe('typed Map saved normalization', () => {
    for (const callback of [false, true])
        for (const mode of ['single', 'both', 'mixed'] as const)
            test(`numeric and string IDs keep their own normalization mode=${mode} callback=${callback}`, async () => {
                const rows = [
                    { id: 1, value: 0, server: 'old-number' },
                    { id: '1', value: 0, server: 'old-string' },
                ];
                const calls: (number | string)[] = [];
                const errors: Error[] = [];
                const obs: any = observable(
                    syncedCrud<any, any, 'Map'>({
                        as: 'Map',
                        list: () => rows,
                        update: async (input) => {
                            calls.push(input.id);
                            return mode === 'mixed' && typeof input.id === 'string'
                                ? undefined
                                : {
                                      ...input,
                                      server: typeof input.id === 'number' ? 'normalized-number' : 'normalized-string',
                                  };
                        },
                        onSaved: callback ? ({ saved }) => saved : undefined,
                        onError: (error) => errors.push(error),
                    }),
                );
                obs.get();
                await releaseTick();
                obs.set(
                    new Map(
                        rows.map((row) => [
                            row.id,
                            { ...row, value: mode === 'single' && typeof row.id === 'string' ? 0 : 1 },
                        ]),
                    ),
                );
                await releaseTick();
                expect(calls).toEqual(mode === 'single' ? [1] : [1, '1']);
                expect(obs.peek().get(1)).toEqual({ id: 1, value: 1, server: 'normalized-number' });
                expect(obs.peek().get('1')).toEqual({
                    id: '1',
                    value: mode === 'single' ? 0 : 1,
                    server: mode === 'both' ? 'normalized-string' : 'old-string',
                });
                expect(syncState(obs).getPendingChanges()).toEqual({});
                expect(syncState(obs).numPendingSets.peek()).toBe(0);
                expect(errors).toEqual([]);
            });
    test('a numeric normalization does not resurrect its deleted string sibling', async () => {
        const requests: { resolve: (value: any) => void; input: any }[] = [];
        let releaseDelete!: () => void;
        const obs: any = observable(
            syncedCrud<any, any, 'Map'>({
                as: 'Map',
                list: () => [
                    { id: 1, value: 0 },
                    { id: '1', value: 0 },
                ],
                update: (input) => new Promise((resolve) => requests.push({ input: clone(input), resolve })),
                delete: () =>
                    new Promise<void>((resolve) => {
                        releaseDelete = resolve;
                    }),
            }),
        );
        obs.get();
        await releaseTick();
        obs.set(
            new Map<any, any>([
                [1, { id: 1, value: 1 }],
                ['1', { id: '1', value: 0 }],
            ]),
        );
        await releaseTick();
        expect(requests).toHaveLength(1);
        obs.set(new Map([[1, { id: 1, value: 1 }]]));
        await releaseTick();
        expect(typeof releaseDelete).toBe('function');
        requests[0].resolve({ ...requests[0].input, server: 'normalized-number' });
        await releaseTick();
        expect(obs.peek().get(1)).toEqual({ id: 1, value: 1, server: 'normalized-number' });
        expect(obs.peek().has('1')).toBe(false);
        releaseDelete();
        await releaseTick();
        expect(obs.peek().has('1')).toBe(false);
        expect(syncState(obs).getPendingChanges()).toEqual({});
        expect(syncState(obs).numPendingSets.peek()).toBe(0);
    });
});

describe('Map metadata names are CRUD row IDs', () => {
    test('normalization for the size row preserves its ID and local value', async () => {
        const obs: any = observable(
            syncedCrud<any, any, 'Map'>({
                as: 'Map',
                list: () => [{ id: 'size', value: 0 }],
                update: async (input) => ({ ...input, server: 'saved' }),
            }),
        );
        obs.get();
        await releaseTick();
        obs.set(new Map([['size', { id: 'size', value: 1 }]]));
        await releaseTick();
        expect(obs.peek().get('size')).toEqual({ id: 'size', value: 1, server: 'saved' });
        expect(obs.get('size').peek()).toEqual({ id: 'size', value: 1, server: 'saved' });
        expect(obs.size).toBe(1);
        expect(syncState(obs).getPendingChanges()).toEqual({});
        expect(syncState(obs).numPendingSets.peek()).toBe(0);
        expect(syncState(obs).error.peek()).toBeUndefined();
    });
    test('Map method names keep independent saved rows', async () => {
        const ids = ['get', 'set', 'peek', 'constructor', '__proto__'];
        const rows = ids.map((id) => ({ id, value: 0 }));
        const obs: any = observable(
            syncedCrud<any, any, 'Map'>({
                as: 'Map',
                list: () => rows,
                update: async (input) => ({ ...input, server: input.id }),
            }),
        );
        obs.get();
        await releaseTick();
        obs.set(new Map(rows.map((row) => [row.id, { ...row, value: 1 }])));
        await releaseTick();
        for (const id of ids) expect(obs.peek().get(id)).toEqual({ id, value: 1, server: id });
        expect(obs.peek().size).toBe(ids.length);
        expect(syncState(obs).getPendingChanges()).toEqual({});
        expect(syncState(obs).numPendingSets.peek()).toBe(0);
        expect(syncState(obs).error.peek()).toBeUndefined();
    });
});

describe('CRUD retry batch settlement', () => {
    test('superseding a retry releases a saved sibling while retaining the unsaved successor', async () => {
        const failure = new Error('first A failed');
        const errors: Error[] = [];
        const sources: string[] = [];
        const calls: any[] = [];
        let finish!: (value: any) => void;
        const obs: any = observable(
            syncedCrud<any>({
                list: () => [
                    { id: 'a', value: 0, server: 'old' },
                    { id: 'b', value: 0, server: 'old' },
                ],
                retry: { delay: 60, times: 3, backoff: 'constant' },
                update: async (input) => {
                    calls.push(clone(input));
                    if (input.id === 'a') {
                        if (input.value === 1) throw failure;
                        return new Promise((resolve) => {
                            finish = resolve;
                        });
                    }
                    return { ...input, server: 'saved' };
                },
                onSaved: ({ saved }) => saved,
                onError: (error, params) => {
                    errors.push(error);
                    sources.push(params.source);
                },
            }),
        );
        obs.get();
        await promiseTimeout(0);
        batch(() => {
            obs.a.value.set(1);
            obs.b.value.set(1);
        });
        await promiseTimeout(10);
        obs.a.value.set(2);
        await promiseTimeout(10);
        expect(obs.peek().b).toEqual({ id: 'b', value: 1, server: 'saved' });
        expect(obs.peek().a.value).toBe(2);
        expect(syncState(obs).getPendingChanges()?.['a/value']?.v).toBe(2);
        expect(syncState(obs).numPendingSets.peek()).toBe(1);
        expect(errors).toEqual([failure]);
        expect(sources).toEqual(['set']);
        finish({ id: 'a', value: 2, server: 'saved' });
        await promiseTimeout(0);
        await promiseTimeout(0);
        expect(calls.filter((value) => value.id === 'a').map((value) => value.value)).toEqual([1, 2]);
        expect(obs.peek().a).toEqual({ id: 'a', value: 2, server: 'saved' });
        expect(syncState(obs).getPendingChanges()).toEqual({});
        expect(syncState(obs).numPendingSets.peek()).toBe(0);
        expect(syncState(obs).isSetting.peek()).toBe(false);
        expect(syncState(obs).error.peek()).toBe(failure);
    });
});

describe('CRUD retry callback failure', () => {
    test('a synchronous throw on a later retry settles through the save error owner', async () => {
        const failure = new Error('retry callback threw');
        const errors: Error[] = [];
        const sources: string[] = [];
        let attempts = 0;
        const obs: any = observable(
            syncedCrud<any>({
                list: () => [{ id: 'a', value: 0 }],
                retry: { delay: 5, times: 2, backoff: 'constant' },
                update: () => {
                    attempts++;
                    if (attempts === 1) return Promise.reject(failure);
                    throw failure;
                },
                onError: (error, params) => {
                    errors.push(error);
                    sources.push(params.source);
                },
            }),
        );
        obs.get();
        await promiseTimeout(0);
        obs.a.value.set(1);
        await promiseTimeout(30);
        expect(attempts).toBe(2);
        expect(errors).toEqual([failure]);
        expect(sources).toEqual(['set']);
        expect(obs.peek().a.value).toBe(1);
        expect(syncState(obs).getPendingChanges()?.['a/value']?.v).toBe(1);
        expect(syncState(obs).numPendingSets.peek()).toBe(0);
        expect(syncState(obs).isSetting.peek()).toBe(false);
    });
});

describe('CRUD retry identity', () => {
    test('numeric and string Map IDs retry independently', async () => {
        const calls: (number | string)[] = [];
        const errors: Error[] = [];
        let numericAttempts = 0;
        const obs: any = observable(
            syncedCrud<any, any, 'Map'>({
                as: 'Map',
                list: () => [
                    { id: 1, value: 0 },
                    { id: '1', value: 0 },
                ],
                retry: { delay: 40, times: 3, backoff: 'constant' },
                update: async (input) => {
                    calls.push(input.id);
                    if (typeof input.id === 'number' && ++numericAttempts === 1) throw new Error('numeric retry');
                },
                onError: (error) => errors.push(error),
            }),
        );
        obs.get();
        await promiseTimeout(0);
        obs.get(1).value.set(1);
        await promiseTimeout(10);
        obs.get('1').value.set(1);
        await promiseTimeout(90);
        expect(calls).toEqual([1, '1', 1]);
        expect(errors).toEqual([]);
        expect(obs.peek().get(1)).toEqual({ id: 1, value: 1 });
        expect(obs.peek().get('1')).toEqual({ id: '1', value: 1 });
        expect(syncState(obs).getPendingChanges()).toEqual({});
        expect(syncState(obs).numPendingSets.peek()).toBe(0);
        expect(syncState(obs).isSetting.peek()).toBe(false);
    });
    test('distinct CRUD owners do not cancel each other for the same ID', async () => {
        const calls: string[] = [];
        const errors: Error[] = [];
        let attempts = 0;
        const make = (owner: string) =>
            observable(
                syncedCrud<any>({
                    list: () => [{ id: 'a', value: 0 }],
                    retry: { delay: 40, times: 3, backoff: 'constant' },
                    update: async () => {
                        calls.push(owner);
                        if (owner === 'first' && ++attempts === 1) throw new Error('first owner retry');
                    },
                    onError: (error) => errors.push(error),
                }),
            );
        const first: any = make('first');
        const second: any = make('second');
        first.get();
        second.get();
        await promiseTimeout(0);
        first.a.value.set(1);
        await promiseTimeout(10);
        second.a.value.set(2);
        await promiseTimeout(90);
        expect(calls).toEqual(['first', 'second', 'first']);
        expect(errors).toEqual([]);
        expect(first.peek().a.value).toBe(1);
        expect(second.peek().a.value).toBe(2);
        for (const value of [first, second]) {
            expect(syncState(value).getPendingChanges()).toEqual({});
            expect(syncState(value).numPendingSets.peek()).toBe(0);
            expect(syncState(value).isSetting.peek()).toBe(false);
        }
    });
});

describe('CRUD retry generation ownership', () => {
    test('an older success cannot detach a newer queued retry from its successor', async () => {
        const failure = new Error('third value failed');
        const calls: number[] = [];
        const errors: Error[] = [];
        let server = 0;
        let finishFirst!: () => void;
        const obs: any = observable(
            syncedCrud<any>({
                list: () => [{ id: 'a', value: server }],
                retry: { delay: 60, times: 3, backoff: 'constant' },
                update: (input) => {
                    const value = input.value;
                    calls.push(value);
                    if (value === 1)
                        return new Promise<void>((resolve) => {
                            finishFirst = () => {
                                server = value;
                                resolve();
                            };
                        });
                    if (value === 3 && calls.filter((v) => v === 3).length === 1) return Promise.reject(failure);
                    server = value;
                    return Promise.resolve();
                },
                onError: (error) => errors.push(error),
            }),
        );
        obs.get();
        await promiseTimeout(0);
        obs.a.value.set(1);
        await promiseTimeout(0);
        obs.a.value.set(2);
        await promiseTimeout(0);
        await promiseTimeout(0);
        obs.a.value.set(3);
        await promiseTimeout(10);
        finishFirst();
        await promiseTimeout(0);
        await promiseTimeout(0);
        obs.a.value.set(4);
        await promiseTimeout(90);
        expect(calls).toEqual([1, 2, 3, 4]);
        expect(errors).toEqual([failure]);
        expect(server).toBe(4);
        expect(obs.peek().a.value).toBe(4);
        expect(syncState(obs).getPendingChanges()).toEqual({});
        expect(syncState(obs).numPendingSets.peek()).toBe(0);
        expect(syncState(obs).isSetting.peek()).toBe(false);
    });
});

describe('CRUD read retry ownership', () => {
    test('owners sharing a list function keep independent initial read retries', async () => {
        let calls = 0;
        const errors: Error[] = [];
        const list = async () => {
            if (++calls === 1) throw new Error('first owner read retry');
            return [{ id: 'a', value: 1 }];
        };
        const make = () =>
            observable(
                syncedCrud<any>({
                    list,
                    retry: { delay: 40, times: 3, backoff: 'constant' },
                    onError: (error) => errors.push(error),
                }),
            );
        const first = make();
        first.get();
        await promiseTimeout(10);
        expect(calls).toBe(1);
        expect(syncState(first).numPendingGets.peek()).toBe(1);
        const second = make();
        second.get();
        await promiseTimeout(0);
        expect(calls).toBe(2);
        await promiseTimeout(90);
        expect(calls).toBe(3);
        expect(errors).toEqual([]);
        for (const obs of [first, second]) {
            expect(obs.peek()).toEqual({ a: { id: 'a', value: 1 } });
            expect(syncState(obs).numPendingGets.peek()).toBe(0);
            expect(syncState(obs).isGetting.peek()).toBe(false);
            expect(syncState(obs).isLoaded.peek()).toBe(true);
        }
    });
});

describe('CRUD retry invocation ownership within one shared record', () => {
    test.each(['update', 'delete'] as const)('older success preserves a failing successor until %s', async (next) => {
        const failure = new Error('second value failed');
        const calls: number[] = [];
        const writes: (number | undefined)[] = [];
        const errors: Error[] = [];
        let server: number | undefined = 0;
        let secondAttempts = 0;
        let finishFirst: (() => void) | undefined;
        let firstRequested!: () => void;
        let secondRequested!: () => void;
        let thirdRequested!: () => void;
        const firstSent = new Promise<void>((resolve) => (firstRequested = resolve));
        const secondSent = new Promise<void>((resolve) => (secondRequested = resolve));
        const thirdSent = new Promise<void>((resolve) => (thirdRequested = resolve));
        const obs: any = observable(
            syncedCrud<any>({
                list: () => (server === undefined ? [] : [{ id: 'a', value: server }]),
                retry: { delay: 100, times: 3, backoff: 'constant' },
                update: (input) => {
                    const value = input.value;
                    calls.push(value);
                    if (value === 1)
                        return new Promise<void>((resolve) => {
                            finishFirst = () => {
                                server = value;
                                writes.push(value);
                                resolve();
                            };
                            firstRequested();
                        });
                    if (value === 2 && ++secondAttempts === 1) {
                        secondRequested();
                        return Promise.reject(failure);
                    }
                    server = value;
                    writes.push(value);
                    if (value === 3) thirdRequested();
                    return Promise.resolve();
                },
                delete: async () => {
                    server = undefined;
                    writes.push(undefined);
                    thirdRequested();
                },
                onError: (error) => errors.push(error),
            }),
        );
        const dispose = obs.onChange(() => {});
        try {
            obs.get();
            const state = syncState(obs);
            await when(state.isLoaded);
            obs.a.value.set(1);
            await firstSent;
            obs.a.value.set(2);
            await secondSent;
            await promiseTimeout(0);
            finishFirst!();
            finishFirst = undefined;
            await promiseTimeout(0);
            if (next === 'update') obs.a.value.set(3);
            else obs.a.delete();
            await thirdSent;
            await promiseTimeout(150);
            expect({ calls, writes, server }).toEqual(
                next === 'update'
                    ? { calls: [1, 2, 3], writes: [1, 3], server: 3 }
                    : { calls: [1, 2], writes: [1, undefined], server: undefined },
            );
            expect(errors).toEqual(next === 'update' ? [failure] : []);
            expect(obs.peek()).toEqual(next === 'update' ? { a: { id: 'a', value: 3 } } : {});
            expect(state.getPendingChanges()).toEqual({});
            expect(state.numPendingSets.peek()).toBe(0);
            expect(state.isSetting.peek()).toBe(false);
        } finally {
            finishFirst?.();
            dispose();
        }
    });
});
