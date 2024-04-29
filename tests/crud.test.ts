import { observable } from '@legendapp/state';
import { syncedCrud } from '@legendapp/state/sync-plugins/crud';
import { promiseTimeout } from './testglobals';

interface BasicValue {
    id: string;
    test: string;
}
interface BasicValue2 {
    id: string;
    test2: string;
}

const ItemBasicValue: () => BasicValue = () => ({
    id: 'id1',
    test: 'hi',
});

type GetTestParams =
    | { get: () => BasicValue; list?: never; as?: never }
    | { list: () => BasicValue[]; as: 'first'; get?: never };

describe('Crud record get', () => {
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

            obs.test.set('hello');

            await promiseTimeout(0);

            expect(saved).toEqual({
                id: 'id1',
                test: 'hello',
            });
            expect(obs.get()).toEqual({
                id: 'id1',
                test: 'hello',
            });
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
        let saved = undefined;
        const obs = observable(
            syncedCrud({
                list: () => [ItemBasicValue()],
                as: 'Map',
                create: async (input: BasicValue) => {
                    saved = input;
                    return input;
                },
            }),
        );

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(0);

        obs.get('id1').test.set('hello');

        await promiseTimeout(0);

        expect(saved).toEqual({
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
    test('get/set transformed', async () => {
        let saved = undefined;
        const obs = observable(
            syncedCrud({
                get: ItemBasicValue,
                create: async (input) => {
                    saved = input;
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

        expect(saved).toEqual({
            id: 'id1',
            test: 'hello',
        });
        expect(obs.get()).toEqual({
            id: 'id1',
            test2: 'hello',
        });
    });
});
