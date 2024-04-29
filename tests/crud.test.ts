import { observable } from '@legendapp/state';
import { syncedCrud } from '@legendapp/state/sync-plugins/crud';
import { promiseTimeout } from './testglobals';

interface BasicValue {
    id: string;
    test: string;
    updatedAt?: string | null;
    parent?: {
        child: {
            baby: string;
        };
    };
}
interface BasicValue2 {
    id: string;
    test2: string;
    updatedAt?: string | null;
}

const ItemBasicValue: () => BasicValue = () => ({
    id: 'id1',
    test: 'hi',
});

type GetTestParams =
    | { get: () => BasicValue | null; list?: never; as?: never }
    | { list: () => BasicValue[]; as: 'first'; get?: never };

describe('Crud object get', () => {
    const getTests = {
        get: async (params: GetTestParams) => {
            const obs = observable(syncedCrud(params));
            expect(obs.get()).toEqual(undefined);

            await promiseTimeout(0);

            expect(obs.get()).toEqual({
                id: 'id1',
                test: 'hi',
            });
        },
        getWithInitial: async (params: GetTestParams) => {
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
        getWithWaitFor: async (params: GetTestParams) => {
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
        getWithSet: async (params: GetTestParams) => {
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
        getWithSetNoInitial: async (params: GetTestParams) => {
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
        getWithSetDeepChild: async (params: GetTestParams) => {
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
        getWithDelete: async (params: GetTestParams) => {
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
            as: 'first',
        }));
    test('list first with initial', () =>
        getTests.getWithInitial({
            list: () => [ItemBasicValue()],
            as: 'first',
        }));
    test('list first with waitFor', () =>
        getTests.getWithWaitFor({
            list: () => [ItemBasicValue()],
            as: 'first',
        }));
    test('list first with set', () =>
        getTests.getWithSet({
            list: () => [ItemBasicValue()],
            as: 'first',
        }));
    test('list first with set deep child', () =>
        getTests.getWithSetDeepChild({
            list: () => [ItemBasicValue()],
            as: 'first',
        }));
    test('list first with delete', () =>
        getTests.getWithDelete({
            list: () => [ItemBasicValue()],
            as: 'first',
        }));
});
describe('Crud as Object list', () => {
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
    test('as Object set at root', async () => {
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
            test: 'hi',
        });
        expect(obs.get()).toEqual(new Map());
    });
    // TODO
    // test('as Map clear', async () => {
    //     let deleted = undefined;
    //     const obs = observable(
    //         syncedCrud({
    //             list: () => [ItemBasicValue()],
    //             as: 'Map',
    //             delete: async (input) => {
    //                 deleted = input;
    //             },
    //         }),
    //     );

    //     expect(obs.get()).toEqual(undefined);

    //     await promiseTimeout(0);

    //     obs.clear();

    //     await promiseTimeout(0);

    //     expect(deleted).toEqual({
    //         id: 'id1',
    //         test: 'hi',
    //     });
    //     expect(obs.get()).toEqual(new Map());
    // });
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
    test('as Array set at root', async () => {
        let created = undefined;
        let updated = undefined;
        const obs = observable(
            syncedCrud({
                list: () => [ItemBasicValue()],
                as: 'array',
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
                initial: { id1: { ...ItemBasicValue(), updatedAt: 'before' } },
                as: 'object',
                fieldUpdatedAt: 'updatedAt',
                create: async (input: BasicValue) => {
                    created = input;
                    return input;
                },
                update: async (input) => {
                    updated = input;
                    expect(input).toEqual({
                        id: 'id1',
                        test: 'hello',
                        updatedAt: 'before',
                    });
                    return input;
                },
                onSaved: (saved) => {
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
