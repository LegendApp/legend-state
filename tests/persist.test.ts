import 'fake-indexeddb/auto';
import { observable } from '../src/observable';
import { Change } from '../src/observableInterfaces';
import { syncObservable, transformSaveData } from '../src/sync/syncObservable';
import { when } from '../src/when';
import { mockLocalStorage } from './testglobals';
import { ObservableCacheLocalStorageBase } from '../src/cache-plugins/local-storage';

const localStorage = mockLocalStorage();
class ObservableCacheLocalStorage extends ObservableCacheLocalStorageBase {
    constructor() {
        super(localStorage);
    }
}

describe('Creating', () => {
    test('Loading state works correctly', async () => {
        const nodes = observable<Record<string, { key: string }>>({});
        let lastSet;
        const state = syncObservable(nodes, {
            cache: {
                plugin: ObservableCacheLocalStorage,
                name: 'nodes',
            },
            get: async () => {
                const nodes = await new Promise<{ key: string }[]>((resolve) =>
                    setTimeout(() => resolve([{ key: 'key0' }]), 10),
                );
                return nodes.reduce(
                    (acc, node) => {
                        acc[node.key] = node;
                        return acc;
                    },
                    {} as Record<string, { key: string }>,
                );
            },
            set: async ({ value }: { value: any; changes: Change[] }) => {
                lastSet = value;
            },
        });

        await when(state.isLoadedLocal);
        await when(state.isLoaded);
        expect(lastSet).toEqual(undefined);
        expect(nodes.get()).toEqual({ key0: { key: 'key0' } });
    });
});

describe('Adjusting data', () => {
    test('transformOutData with transform', () => {
        const adjusted = transformSaveData({ id: 'id', text: 'a' }, [], [], {
            transform: {
                save: (value) => {
                    value.text = 'b';
                    return value;
                },
            },
        });

        expect(adjusted).toEqual({ id: 'id', text: 'b' });
    });
});
