import { observable, observe, syncState, when } from '@legendapp/state';
import { configureObservableSync } from '@legendapp/state/sync';
import { syncedCrud } from '@legendapp/state/sync-plugins/crud';
import {
    BasicValue,
    BasicValue2,
    ObservablePersistLocalStorage,
    getPersistName,
    localStorage,
    promiseTimeout,
} from './testglobals';
import { clone } from '../src/globals';

const ItemBasicValue: () => BasicValue = () => ({
    id: 'id1',
    test: 'hi',
});

type GetOrListTestParams =
    | { get: () => BasicValue | null; list?: never; as?: never }
    | { list: () => BasicValue[]; as: 'value'; get?: never };

beforeAll(() => {
    configureObservableSync({
        debounceSet: null,
        persist: null,
    } as any);
});

describe('Crud object get', () => {
    const getTests = {
        get: async (params: GetOrListTestParams) => {
            const obs = observable(syncedCrud(params));
            expect(obs.get()).toEqual(undefined);

            await promiseTimeout(0);

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
                    },
                }),
            );
            expect(obs.get()).toEqual({
                id: 'unknown',
                test: 'unknown',
            });

            await promiseTimeout(0);

            expect(obs.get()).toEqual({
                id: 'id1',
                test: 'hi',
            });
        },
        getWithWaitFor: async (params: GetOrListTestParams) => {
            const obsWait$ = observable(false);
            const obs = observable(syncedCrud({ ...params, waitFor: obsWait$ }));

            expect(obs.get()).toEqual(undefined);

            await promiseTimeout(0);

            expect(obs.get()).toEqual(undefined);

            obsWait$.set(true);

            await promiseTimeout(0);

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

            await promiseTimeout(0);

            expect(obs.get()).toEqual({
                id: 'id1',
                test: 'hi',
            });

            obs.test.set('hello');

            await promiseTimeout(0);

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

            await promiseTimeout(0);

            expect(obs.get()).toEqual(null);

            obs.set({ id: 'id1', test: 'hello' });

            await promiseTimeout(0);

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

            await promiseTimeout(0);

            expect(obs.get()).toEqual({
                id: 'id1',
                test: 'hi',
            });

            obs.parent.child.baby.set('test');

            await promiseTimeout(0);

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

            await promiseTimeout(0);

            expect(obs.get()).toEqual({
                id: 'id1',
                test: 'hi',
            });

            obs.delete();

            await promiseTimeout(0);

            expect(deleted).toEqual({
                id: 'id1',
                test: 'hi',
            });
            expect(obs.get()).toEqual(undefined);
        },
    };
    test('get', () =>
        getTests.get({
            get: ItemBasicValue,
        }));
    test('get with initial', () =>
        getTests.getWithInitial({
            get: ItemBasicValue,
        }));
    test('get with waitFor', () =>
        getTests.getWithWaitFor({
            get: ItemBasicValue,
        }));
    test('get with set', () =>
        getTests.getWithSet({
            get: ItemBasicValue,
        }));
    test('get with set no initial', () =>
        getTests.getWithSetNoInitial({
            get: () => null,
        }));
    test('get with set deep child', () =>
        getTests.getWithSetDeepChild({
            get: ItemBasicValue,
        }));
    test('get with delete', () =>
        getTests.getWithDelete({
            get: ItemBasicValue,
        }));
    test('list first', () =>
        getTests.get({
            list: () => [ItemBasicValue()],
            as: 'value',
        }));
    test('list first with initial', () =>
        getTests.getWithInitial({
            list: () => [ItemBasicValue()],
            as: 'value',
        }));
    test('list first with waitFor', () =>
        getTests.getWithWaitFor({
            list: () => [ItemBasicValue()],
            as: 'value',
        }));
    test('list first with set', () =>
        getTests.getWithSet({
            list: () => [ItemBasicValue()],
            as: 'value',
        }));
    test('list first with set deep child', () =>
        getTests.getWithSetDeepChild({
            list: () => [ItemBasicValue()],
            as: 'value',
        }));
    test('list first with delete', () =>
        getTests.getWithDelete({
            list: () => [ItemBasicValue()],
            as: 'value',
        }));
});
describe('Crud as Object list', () => {
    test('defaults to object', async () => {
        const obs = observable(
            syncedCrud({
                list: () => [ItemBasicValue()],
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
    test('as Object list', async () => {
        const obs = observable(
            syncedCrud({
                list: () => [ItemBasicValue()],
                as: 'object',
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
    test('as Object set', async () => {
        let created = undefined;
        let updated = undefined;
        const obs = observable(
            syncedCrud({
                list: () => [ItemBasicValue()],
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

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(0);

        obs.id1.test.set('hello');

        await promiseTimeout(0);

        expect(created).toEqual(undefined);
        expect(updated).toEqual({
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
    test('as Object set at root updates', async () => {
        let created = undefined;
        let updated = undefined;
        const obs = observable(
            syncedCrud({
                list: () => [ItemBasicValue()],
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

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(0);

        obs.set({ id1: { id: 'id1', test: 'hello' } });

        await promiseTimeout(0);

        expect(created).toEqual(undefined);
        expect(updated).toEqual({
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
    test('as Object set at root adds', async () => {
        let created = undefined;
        let updated = undefined;
        const obs = observable(
            syncedCrud({
                list: () => [ItemBasicValue()],
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

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(0);

        obs.set({ id1: { id: 'id1', test: 'hi' }, id2: { id: 'id2', test: 'hi2' } });

        await promiseTimeout(0);

        expect(created).toEqual({ id: 'id2', test: 'hi2' });
        expect(updated).toEqual(undefined);
        expect(obs.get()).toEqual({
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
        const obs = observable(
            syncedCrud({
                list: () => [ItemBasicValue()],
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

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(0);

        obs.id1.parent.child.baby.set('test');

        await promiseTimeout(0);

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
        expect(obs.get()).toEqual({
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
        const obs = observable(
            syncedCrud({
                list: () => [ItemBasicValue()],
                as: 'object',
                delete: async (input) => {
                    deleted = input;
                },
            }),
        );

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(0);

        obs.id1.delete();

        await promiseTimeout(0);

        expect(deleted).toEqual({
            id: 'id1',
            test: 'hi',
        });
        expect(obs.get()).toEqual({});
    });
    test('as Object update', async () => {
        let deleted = undefined;
        const obs = observable(
            syncedCrud({
                list: () => [ItemBasicValue()],
                as: 'object',
                delete: async (input) => {
                    deleted = input;
                },
            }),
        );

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(0);

        obs.id1.delete();

        await promiseTimeout(0);

        expect(deleted).toEqual({
            id: 'id1',
            test: 'hi',
        });
        expect(obs.get()).toEqual({});
    });
    test('as Object with paging', async () => {
        const page$ = observable(1);
        const obs = observable(
            syncedCrud({
                list: () => (page$.get() === 1 ? [ItemBasicValue()] : [{ id: 'id2', test: 'hi2' }]),
                as: 'object',
                mode: 'assign',
            }),
        );

        // Observe to make it refresh
        const dispose = observe(() => obs.get());

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(0);

        expect(obs.get()).toEqual({
            id1: {
                id: 'id1',
                test: 'hi',
            },
        });

        page$.set(2);

        await promiseTimeout(0);

        expect(obs.get()).toEqual({
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
        const obs = observable(
            syncedCrud({
                list: () => [ItemBasicValue()],
                as: 'object',
                delete: async (input) => {
                    deleted = input;
                },
            }),
        );

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(0);

        obs.set({ id1: null as any });

        await promiseTimeout(0);

        expect(deleted).toEqual({
            id: 'id1',
            test: 'hi',
        });
        expect(obs.get()).toEqual({ id1: null });
    });
});
describe('Crud as Map', () => {
    test('as Map list', async () => {
        const obs = observable(
            syncedCrud({
                list: () => [ItemBasicValue()],
                as: 'Map',
            }),
        );

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(0);

        expect(obs.get()).toEqual(
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
        expect(obs.get('id1').get()).toEqual({ id: 'id1', test: 'hi' });
        expect(obs.get('id1').test.get()).toEqual('hi');
    });
    test('as Map set', async () => {
        let created = undefined;
        let updated = undefined;
        const obs = observable(
            syncedCrud({
                list: () => [ItemBasicValue()],
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

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(0);

        obs.get('id1').test.set('hello');

        await promiseTimeout(0);

        expect(created).toEqual(undefined);
        expect(updated).toEqual({
            id: 'id1',
            test: 'hello',
        });
        expect(obs.get()).toEqual(
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
        const obs = observable(
            syncedCrud({
                list: () => [ItemBasicValue()],
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

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(0);

        obs.set(new Map([['id1', { id: 'id1', test: 'hello' }]]));

        await promiseTimeout(0);

        expect(created).toEqual(undefined);
        expect(updated).toEqual({
            id: 'id1',
            test: 'hello',
        });
        expect(obs.get()).toEqual(
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
        const obs = observable(
            syncedCrud({
                list: () => [ItemBasicValue()],
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

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(0);

        obs.get('id1').parent.child.baby.set('test');

        await promiseTimeout(0);

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
        expect(obs.get()).toEqual(
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
        const obs = observable(
            syncedCrud({
                list: () => [ItemBasicValue()],
                as: 'Map',
                delete: async (input) => {
                    deleted = input;
                },
            }),
        );

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(0);

        obs.delete('id1');

        await promiseTimeout(0);

        expect(deleted).toEqual({
            id: 'id1',
            test: 'hi',
        });
        expect(obs.get()).toEqual(new Map());
    });
    test('as Map clear does nothing', async () => {
        let deleted = undefined;
        const obs = observable(
            syncedCrud({
                list: () => [ItemBasicValue()],
                as: 'Map',
                delete: async (input) => {
                    deleted = input;
                },
            }),
        );

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(0);

        obs.clear();

        await promiseTimeout(0);

        expect(deleted).toEqual(undefined);
        expect(obs.get()).toEqual(new Map());
    });
});
describe('Crud as Array', () => {
    test('as Array list', async () => {
        const obs = observable(
            syncedCrud({
                list: () => [ItemBasicValue()],
                as: 'array',
            }),
        );

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(0);

        expect(obs.get()).toEqual([
            {
                id: 'id1',
                test: 'hi',
            },
        ]);
        expect(obs[0].get()).toEqual({ id: 'id1', test: 'hi' });
        expect(obs[0].test.get()).toEqual('hi');
    });
    test('as Array set', async () => {
        let created = undefined;
        let updated = undefined;
        const obs = observable(
            syncedCrud({
                list: () => [ItemBasicValue()],
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

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(0);

        obs[0].test.set('hello');

        await promiseTimeout(0);

        expect(created).toEqual(undefined);
        expect(updated).toEqual({
            id: 'id1',
            test: 'hello',
        });
        expect(obs.get()).toEqual([
            {
                id: 'id1',
                test: 'hello',
            },
        ]);
    });
    test('as Array set at root updates', async () => {
        let created = undefined;
        let updated = undefined;
        const obs = observable(
            syncedCrud({
                list: () => [ItemBasicValue()],
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

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(0);

        obs.set([{ id: 'id1', test: 'hello' }]);

        await promiseTimeout(0);

        expect(created).toEqual(undefined);
        expect(updated).toEqual({
            id: 'id1',
            test: 'hello',
        });
        expect(obs.get()).toEqual([
            {
                id: 'id1',
                test: 'hello',
            },
        ]);
    });
    test('as Array set at root adds', async () => {
        let created = undefined;
        let updated = undefined;
        const obs = observable(
            syncedCrud({
                list: () => [ItemBasicValue()],
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

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(0);

        obs.set([
            { id: 'id1', test: 'hi' },
            { id: 'id2', test: 'hi2' },
        ]);

        await promiseTimeout(0);

        expect(created).toEqual({ id: 'id2', test: 'hi2' });
        expect(updated).toEqual(undefined);
        expect(obs.get()).toEqual([
            {
                id: 'id1',
                test: 'hi',
            },
            { id: 'id2', test: 'hi2' },
        ]);
    });
    test('as Array set at root with both modify and create adds', async () => {
        let created = undefined;
        let updated = undefined;
        const obs = observable(
            syncedCrud({
                list: () => [ItemBasicValue()],
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

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(0);

        obs.set([
            { id: 'id1', test: 'hello' },
            { id: 'id2', test: 'hi2' },
        ]);

        await promiseTimeout(0);

        expect(created).toEqual({ id: 'id2', test: 'hi2' });
        expect(updated).toEqual({ id: 'id1', test: 'hello' });
        expect(obs.get()).toEqual([
            {
                id: 'id1',
                test: 'hello',
            },
            { id: 'id2', test: 'hi2' },
        ]);
    });
    test('as Array push adds', async () => {
        let created = undefined;
        let updated = undefined;
        const obs = observable(
            syncedCrud({
                list: () => [ItemBasicValue()],
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

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(0);

        obs.push({ id: 'id2', test: 'hi2' });

        await promiseTimeout(0);

        expect(created).toEqual({ id: 'id2', test: 'hi2' });
        expect(updated).toEqual(undefined);
        expect(obs.get()).toEqual([
            {
                id: 'id1',
                test: 'hi',
            },
            { id: 'id2', test: 'hi2' },
        ]);
    });
    test('as Array set deep child', async () => {
        let created = undefined;
        let updated = undefined;
        const obs = observable(
            syncedCrud({
                list: () => [ItemBasicValue()],
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

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(0);

        obs[0].parent.child.baby.set('test');

        await promiseTimeout(0);

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
        expect(obs.get()).toEqual([
            {
                id: 'id1',
                test: 'hi',
                parent: {
                    child: {
                        baby: 'test',
                    },
                },
            },
        ]);
    });
    test('as array with paging', async () => {
        const page$ = observable(1);
        const obs = observable(
            syncedCrud({
                list: () => (page$.get() === 1 ? [ItemBasicValue()] : [{ id: 'id2', test: 'hi2' }]),
                as: 'array',
                mode: 'append',
            }),
        );

        // Observe to make it refresh
        const dispose = observe(() => obs.get());

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(0);

        expect(obs.get()).toEqual([
            {
                id: 'id1',
                test: 'hi',
            },
        ]);

        page$.set(2);

        await promiseTimeout(0);

        expect(obs.get()).toEqual([
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
});
describe('Crud record transform', () => {
    test('get transformed', async () => {
        const obs = observable(
            syncedCrud({
                get: ItemBasicValue,
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

        await promiseTimeout(0);

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
                get: () => null,
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

        await promiseTimeout(0);

        expect(obs.get()).toEqual(null);

        obs.set({ id: 'id1', test2: 'hello' });

        await promiseTimeout(0);

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
                get: ItemBasicValue,
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

        await promiseTimeout(0);

        expect(obs.get()).toEqual({
            id: 'id1',
            test2: 'hi',
        });

        obs.test2.set('hello');

        await promiseTimeout(0);

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

        await promiseTimeout(0);

        obs.id1.test.set('hello');

        await promiseTimeout(0);

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

        await promiseTimeout(0);

        obs.id1.test.set('hello');

        await promiseTimeout(0);

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

        await promiseTimeout(0);

        obs.id1.test.set('hello');

        await promiseTimeout(0);

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
        const obs = observable<Record<string, BasicValue>>(
            syncedCrud({
                list: () => [{ ...ItemBasicValue(), updatedAt: 2 }],
                as: 'object',
                fieldUpdatedAt: 'updatedAt',
                changesSince: 'last-sync',
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                },
            }),
        );

        expect(obs.get()).toEqual({ id2: { id: 'id2', test: 'hi2', updatedAt: 1 } });

        await promiseTimeout(0);

        expect(obs.get()).toEqual({
            id1: { id: 'id1', test: 'hi', updatedAt: 2 },
            id2: { id: 'id2', test: 'hi2', updatedAt: 1 },
        });
    });
    test('as first set if lastSync', async () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, JSON.stringify({ id: 'id2', test: 'hi2', updatedAt: 1 }));
        localStorage.setItem(persistName + '__m', JSON.stringify({ lastSync: 1000 }));
        const obs = observable<Record<string, BasicValue>>(
            syncedCrud({
                list: () => [{ ...ItemBasicValue(), updatedAt: 2 }],
                as: 'value',
                fieldUpdatedAt: 'updatedAt',
                changesSince: 'last-sync',
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                },
            }),
        );

        expect(obs.get()).toEqual({ id: 'id2', test: 'hi2', updatedAt: 1 });

        await promiseTimeout(0);

        expect(obs.get()).toEqual({
            id: 'id1',
            test: 'hi',
            updatedAt: 2,
        });
    });
    test('as first leaves existing if lastSync and returning []', async () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, JSON.stringify({ id: 'id2', test: 'hi2', updatedAt: 1 }));
        localStorage.setItem(persistName + '__m', JSON.stringify({ lastSync: 1000 }));
        const obs = observable<Record<string, BasicValue>>(
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

        expect(obs.get()).toEqual({ id: 'id2', test: 'hi2', updatedAt: 1 });

        await promiseTimeout(0);

        expect(obs.get()).toEqual({ id: 'id2', test: 'hi2', updatedAt: 1 });
    });
    test('as array push if lastSync', async () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, JSON.stringify([{ id: 'id2', test: 'hi2', updatedAt: 1 }]));
        localStorage.setItem(persistName + '__m', JSON.stringify({ lastSync: 1000 }));
        const obs = observable(
            syncedCrud({
                list: () => [{ ...ItemBasicValue(), updatedAt: 2 }] as BasicValue[],
                as: 'array',
                fieldUpdatedAt: 'updatedAt',
                changesSince: 'last-sync',
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                },
            }),
        );
        expect(obs.get()).toEqual([{ id: 'id2', test: 'hi2', updatedAt: 1 }]);

        await promiseTimeout(0);

        expect(obs.get()).toEqual([
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
        const obs = observable(
            syncedCrud({
                list: () => [{ ...ItemBasicValue(), updatedAt: 2 }] as BasicValue[],
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
        expect(obs.get()).toEqual([{ id: 'id2', test: 'hi2', updatedAt: 1 }]);

        await promiseTimeout(0);

        expect(obs.get()).toEqual([
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
        const obs = observable(
            syncedCrud({
                list: () => [{ ...ItemBasicValue(), updatedAt: 2 }] as BasicValue[],
                as: 'Map',
                fieldUpdatedAt: 'updatedAt',
                changesSince: 'last-sync',
                persist: {
                    name: persistName,
                    plugin: ObservablePersistLocalStorage,
                },
            }),
        );

        expect(obs.get()).toEqual(new Map([['id2', { id: 'id2', test: 'hi2', updatedAt: 1 }]]));

        await promiseTimeout(0);

        expect(obs.get()).toEqual(
            new Map([
                ['id2', { id: 'id2', test: 'hi2', updatedAt: 1 }],
                ['id1', { id: 'id1', test: 'hi', updatedAt: 2 }],
            ]),
        );
    });
});
describe('update partial', () => {
    test('without updatePartial', async () => {
        let updated = undefined;
        const obs = observable(
            syncedCrud({
                get: () => ({ ...ItemBasicValue(), other: 2, another: 3 }),
                update: async (value) => {
                    updated = value;
                    return value;
                },
            }),
        );

        obs.get();

        await promiseTimeout(0);

        expect(obs.get()).toEqual({
            id: 'id1',
            test: 'hi',
            other: 2,
            another: 3,
        });

        obs.other.set(4);

        await promiseTimeout(0);

        expect(updated).toEqual({ id: 'id1', test: 'hi', other: 4, another: 3 });
        expect(obs.get()).toEqual({
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

        await promiseTimeout(0);

        expect(obs.get()).toEqual({
            id: 'id1',
            test: 'hi',
            other: 2,
            another: 3,
        });

        obs.other.set(4);

        await promiseTimeout(0);

        expect(updated).toEqual({ id: 'id1', other: 4 });
        expect(obs.get()).toEqual({
            id: 'id1',
            test: 'hi',
            other: 4,
            another: 3,
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

        await promiseTimeout(0);

        expect(obs.get()).toEqual({
            id: 'id1',
            test: 'hi',
            other: 2,
            another: 3,
        });

        obs.set({ ...obs.get(), other: 4 });

        await promiseTimeout(0);

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
                list: () => [{ id: retValue++ }],
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

        await promiseTimeout(0);

        expect(obs.get()).toEqual([{ id: 1 }]);

        set1$.set(true);
        await promiseTimeout(0);
        expect(obs.get()).toEqual([{ id: 1 }, { id: 2 }]);

        set2$.set(true);
        await promiseTimeout(0);
        expect(obs.get()).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);

        dispose();
    });
    test('subscribe with update', async () => {
        const set1$ = observable(false);
        const set2$ = observable(false);
        const obs = observable(
            syncedCrud({
                list: () => [{ id: 1 }],
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

        await promiseTimeout(0);

        expect(obs.get()).toEqual([{ id: 1 }]);

        set1$.set(true);
        await promiseTimeout(0);
        expect(obs.get()).toEqual([{ id: 1 }, { id: 2 }]);

        set2$.set(true);
        await promiseTimeout(0);
        expect(obs.get()).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    });
    test('subscribe with update as Map', async () => {
        const set1$ = observable(false);
        const set2$ = observable(false);
        const obs = observable(
            syncedCrud({
                list: () => [{ id: 1 }],
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

        await promiseTimeout(0);

        expect(obs.get()).toEqual(new Map([[1, { id: 1 }]]));

        set1$.set(true);
        await promiseTimeout(0);
        expect(obs.get()).toEqual(
            new Map([
                [1, { id: 1 }],
                [2, { id: 2 }],
            ]),
        );

        set2$.set(true);
        await promiseTimeout(0);
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
                list: () => [{ id: 1 }],
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

        await promiseTimeout(0);

        expect(obs.get()).toEqual({ id: 1 });

        set1$.set(true);
        await promiseTimeout(0);
        expect(obs.get()).toEqual({ id: 2 });

        set2$.set(true);
        await promiseTimeout(0);
        expect(obs.get()).toEqual({ id: 3 });
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

        await promiseTimeout(0);

        obs.id1.set({ test: 'hello', id: undefined as unknown as string });

        await promiseTimeout(0);

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

        await promiseTimeout(0);

        obs.id1.test.set('hello');

        await promiseTimeout(0);

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
    test('without onSaved updates with saved values ignores values changed locally', async () => {
        let created = undefined;
        let updated = undefined;
        const canSave$ = observable(false);
        const isSaving$ = observable(false);
        const obs = observable(
            syncedCrud({
                initial: {
                    id1: { ...ItemBasicValue(), updatedAt: 10, changing: '0' } as BasicValue & {
                        changing: string;
                    },
                },
                as: 'object',
                fieldUpdatedAt: 'updatedAt',
                create: async (input: BasicValue) => {
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

        await promiseTimeout(0);

        obs.id1.test.set('hello');

        await when(isSaving$);

        obs.id1.changing.set('1');

        canSave$.set(true);

        await promiseTimeout(0);

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
});
