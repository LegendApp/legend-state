import { observable, when } from '@legendapp/state';
import { configureObservableSync } from '@legendapp/state/sync';
import { syncedCrud } from '@legendapp/state/sync-plugins/crud';
import { ObservablePersistLocalStorage, getPersistName, localStorage, promiseTimeout } from './testglobals';

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
interface BasicValue2 {
    id: string;
    test2: string;
    updatedAt?: string | number | null;
}

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
                        created = input;
                        return input;
                    },
                    update: async (input) => {
                        updated = input;
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
                        created = input;
                        return input;
                    },
                    update: async (input) => {
                        updated = input;
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
                        saved = input;
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
                    created = input;
                    return input;
                },
                update: async (input) => {
                    updated = input;
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
                    created = input;
                    return input;
                },
                update: async (input) => {
                    updated = input;
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
                    created = input;
                    return input;
                },
                update: async (input) => {
                    updated = input;
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
                    created = input;
                    return input;
                },
                update: async (input) => {
                    updated = input;
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
                    created = input;
                    return input;
                },
                update: async (input) => {
                    updated = input;
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
                    created = input;
                    return input;
                },
                update: async (input) => {
                    updated = input;
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
                    created = input;
                    return input;
                },
                update: async (input) => {
                    updated = input;
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
                    created = input;
                    return input;
                },
                update: async (input) => {
                    updated = input;
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
                    created = input;
                    return input;
                },
                update: async (input) => {
                    updated = input;
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
                    created = input;
                    return input;
                },
                update: async (input) => {
                    updated = input;
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
                initial: { id1: { ...ItemBasicValue(), updatedAt: 'before' } },
                as: 'object',
                fieldUpdatedAt: 'updatedAt',
                create: async (input: BasicValue) => {
                    created = input;
                    return input;
                },
                update: async (input) => {
                    updated = input;
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
            updatedAt: 'before',
        });

        expect(obs.get()).toEqual({
            id1: {
                id: 'id1',
                test: 'hello',
                updatedAt: 'before',
            },
        });
    });
    test('fieldUpdatedAt updates with updatedAt', async () => {
        let created = undefined;
        let updated = undefined;
        const obs = observable(
            syncedCrud({
                initial: { id1: { ...ItemBasicValue(), updatedAt: 'before' } as BasicValue },
                as: 'object',
                fieldUpdatedAt: 'updatedAt',
                create: async (input: BasicValue) => {
                    created = input;
                    return input;
                },
                update: async (input) => {
                    updated = input;
                    // Check this here because it will be updated in place by onSaved before
                    // the next expects can get to it
                    expect(input).toEqual({
                        id: 'id1',
                        test: 'hello',
                        updatedAt: 'before',
                    });
                    return input;
                },
                onSaved: ({ saved }) => {
                    return { ...saved, updatedAt: 'now' };
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
            updatedAt: 'now',
        });

        expect(obs.get()).toEqual({
            id1: {
                id: 'id1',
                test: 'hello',
                updatedAt: 'now',
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
                mode: 'assign',
                subscribe: ({ refresh }) => {
                    when(set1$, refresh);
                    when(set2$, refresh);
                },
            }),
        );
        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(0);

        expect(obs.get()).toEqual({ 1: { id: 1 } });

        set1$.set(true);
        await promiseTimeout(0);
        expect(obs.get()).toEqual({ 1: { id: 1 }, 2: { id: 2 } });

        set2$.set(true);
        await promiseTimeout(0);
        expect(obs.get()).toEqual({ 1: { id: 1 }, 2: { id: 2 }, 3: { id: 3 } });
    });
    test('subscribe with update', async () => {
        const set1$ = observable(false);
        const set2$ = observable(false);
        const obs = observable(
            syncedCrud({
                list: () => [{ id: 1 }],
                mode: 'assign',
                subscribe: ({ update }) => {
                    when(set1$, () => {
                        update({ value: { 2: { id: 2 } } });
                    });
                    when(set2$, () => {
                        update({ value: { 3: { id: 3 } } });
                    });
                },
            }),
        );
        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(0);

        expect(obs.get()).toEqual({ 1: { id: 1 } });

        set1$.set(true);
        await promiseTimeout(0);
        expect(obs.get()).toEqual({ 1: { id: 1 }, 2: { id: 2 } });

        set2$.set(true);
        await promiseTimeout(0);
        expect(obs.get()).toEqual({ 1: { id: 1 }, 2: { id: 2 }, 3: { id: 3 } });
    });
    test('delete from subscribe', async () => {
        const set1$ = observable(false);
        const set2$ = observable(false);
        const obs = observable(
            syncedCrud({
                list: () => [{ id: 1 }, { id: 2 }],
                mode: 'assign',
                subscribe: ({ update }) => {
                    when(set1$, () => {
                        update({ value: { 2: symbolDelete } });
                    });
                    when(set2$, () => {
                        update({ value: { 1: symbolDelete } });
                    });
                },
            }),
        );
        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(0);

        expect(obs.get()).toEqual({ 1: { id: 1 }, 2: { id: 2 } });

        set1$.set(true);
        await promiseTimeout(0);
        expect(obs.get()).toEqual({ 1: { id: 1 } });

        set2$.set(true);
        await promiseTimeout(0);
        expect(obs.get()).toEqual({});
    });
});
