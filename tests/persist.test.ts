import 'fake-indexeddb/auto';
import { transformOutData, persistObservable } from '../src/persist/persistObservable';
import { ObservablePersistLocalStorage } from '../src/persist-plugins/local-storage';

function promiseTimeout(time?: number) {
    return new Promise((resolve) => setTimeout(resolve, time || 0));
}

describe('Creating', () => {
    test('Create with object', () => {
        const [obs$, state$] = persistObservable(
            { test: 'hi' },
            {
                pluginLocal: ObservablePersistLocalStorage,
                local: 'jestlocal',
            },
        );

        expect(obs$.get()).toEqual({ test: 'hi' });

        expect(state$.isLoadedLocal.get()).toEqual(true);
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
