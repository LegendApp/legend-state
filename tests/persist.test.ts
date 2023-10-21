import 'fake-indexeddb/auto';
import { transformOutData, persistObservable } from '../src/persist/persistObservable';
import { ObservablePersistLocalStorage } from '../src/persist-plugins/local-storage';

function promiseTimeout(time?: number) {
    return new Promise((resolve) => setTimeout(resolve, time || 0));
}

describe('Creating', () => {
    test('Create with object', () => {
        const obs$ = persistObservable(
            { test: 'hi' },
            {
                pluginLocal: ObservablePersistLocalStorage,
                local: 'jestlocal',
            },
        );

        expect(obs$.get()).toEqual({ test: 'hi' });

        expect(obs$.state.isLoadedLocal.get()).toEqual(true);
    });
    test('Create with no get', async () => {
        let setValue;
        const obs$ = persistObservable(
            { test: 'hi' },
            {
                pluginRemote: {
                    set({ value }) {
                        setValue = value.test;
                    },
                },
            },
        );

        expect(obs$.get()).toEqual({ test: 'hi' });

        expect(obs$._state.isLoadedLocal.get()).toEqual(true);

        obs$.test.set('hello');
        await promiseTimeout(10);
        expect(setValue).toEqual('hello');
    });
});

describe('Adjusting data', () => {
    test('transformOutData with transform', () => {
        const adjusted = transformOutData({ id: 'id', text: 'a' }, [], [], {
            transform: {
                out: (value) => {
                    value.text = 'b';
                    return value;
                },
            },
        });

        expect(adjusted).toEqual({ path: [], value: { id: 'id', text: 'b' } });
    });
    test('transformOutData with transform and fieldTransforms', () => {
        const adjusted = transformOutData({ id: 'id', text: 'a' }, [], [], {
            transform: {
                out: (value) => {
                    value.text = 'b';
                    return value;
                },
            },
            fieldTransforms: {
                id: 'id',
                text: 't',
            },
        });

        expect(adjusted).toEqual({ path: [], value: { id: 'id', t: 'b' } });
    });
    test('transformOutData with transform and fieldTransforms and path', () => {
        const adjusted = transformOutData({ id: 'id', text: 'a' }, ['path'], ['object'], {
            transform: {
                out: (value) => {
                    value.path.text = 'b';
                    return value;
                },
            },
            fieldTransforms: {
                _dict: {
                    id: 'id',
                    text: 't',
                },
            },
        });

        expect(adjusted).toEqual({ path: ['path'], value: { id: 'id', t: 'b' } });
    });
    test('transformOutData with transform promise and fieldTransforms and path', async () => {
        const adjusted = await transformOutData({ id: 'id', text: 'a' }, ['path'], ['object'], {
            transform: {
                out: async (value) => {
                    value.path.text = 'b';
                    await promiseTimeout(10);
                    return value;
                },
            },
            fieldTransforms: {
                _dict: {
                    id: 'id',
                    text: 't',
                },
            },
        });

        expect(adjusted).toEqual({ path: ['path'], value: { id: 'id', t: 'b' } });
    });
});
