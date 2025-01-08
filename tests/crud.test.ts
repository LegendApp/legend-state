import { observable, ObservableHint, observe, syncState, when } from '@legendapp/state';
import { syncObservable } from '@legendapp/state/sync';
import { syncedCrud, SyncedCrudPropsMany, SyncedCrudPropsSingle } from '@legendapp/state/sync-plugins/crud';
import { expectTypeOf } from 'expect-type';
import { clone, getNode, symbolDelete } from '../src/globals';
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
    test('as Map clear does nothing', async () => {
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

        expect(deleted).toEqual(undefined);
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
                    },
                    id2: {
                        p: null,
                        t: ['object'],
                        v: {
                            id: 'id2',
                            test: 'hi2',
                        },
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
