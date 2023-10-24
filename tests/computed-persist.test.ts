import { mockLocalStorage } from './testglobals';
import { persistObservable } from '../src/persist/persistObservable';
import { run } from './computedtests';
import { observable } from '../src/observable';
import { ObservablePersistLocalStorage } from '../src/persist-plugins/local-storage';
import { when } from '../src/when';

persistObservable({} as any, {
    pluginRemote: {
        get() {
            return Promise.resolve({ test: 'hi' });
        },
    },
});

run(true);

mockLocalStorage();

describe('caching with new computed', () => {
    test('cache basic', async () => {
        localStorage.setItem('nodes', JSON.stringify({ key0: { key: 'key0' } }));
        // @ts-expect-error asdf
        const nodes = observable<Record<string, { key: string }>>(async ({ cache }) => {
            cache(() => ({
                pluginLocal: ObservablePersistLocalStorage,
                local: 'nodes',
            }));
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
        });

        expect(nodes.get()).toEqual({ key0: { key: 'key0' } });

        await when(nodes._state.isLoadedLocal);
        await when(nodes._state.isLoaded);
        expect(nodes.get()).toEqual({ key0: { key: 'key0' } });
    });
});
