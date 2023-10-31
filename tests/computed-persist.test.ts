import { activator } from '../src/activator';
import { persistObservable } from '../persist';
import { observable } from '../src/observable';
import type { ActivateParams } from '../src/observableInterfaces';
import { ObservablePersistLocalStorage } from '../src/persist-plugins/local-storage';
import { when } from '../src/when';
import { run } from './computedtests';
import { mockLocalStorage, promiseTimeout } from './testglobals';

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
        localStorage.setItem('nodesbasic', JSON.stringify({ key0: { key: 'key0' } }));
        const nodes = observable(
            activator({
                cache: {
                    pluginLocal: ObservablePersistLocalStorage,
                    local: 'nodesbasic',
                },
                // @ts-expect-error asdf
                get: async ({ value }) => {
                    const nodes = await new Promise<{ key: string }[]>((resolve) =>
                        setTimeout(() => resolve([{ key: 'key1' }]), 10),
                    );
                    return nodes.reduce((acc: Record<string, { key: string }>, node) => {
                        acc[node.key] = node;
                        return acc;
                    }, {});
                },
            }),
        );

        // @ts-expect-error asdf
        expect(nodes._state.isLoadedLocal.get()).toEqual(true);
        // @ts-expect-error asdf
        expect(nodes._state.isLoaded.get()).toEqual(false);
        expect(nodes.get()).toEqual({ key0: { key: 'key0' } });

        await when(nodes._state.isLoaded);
        expect(nodes.get()).toEqual({ key1: { key: 'key1' } });
    });
    test('cache makes get receive params', async () => {
        localStorage.setItem('cachedprops', JSON.stringify('cached'));
        const nodes = observable(
            activator({
                cache: {
                    pluginLocal: ObservablePersistLocalStorage,
                    local: 'cachedprops',
                },
                // @ts-expect-error asdf
                get: async ({ value }) => {
                    return value + '1';
                },
            }),
        );

        expect(nodes._state.isLoadedLocal.get()).toEqual(true);
        expect(nodes._state.isLoaded.get()).toEqual(false);
        expect(nodes.get()).toEqual('cached');

        await when(nodes._state.isLoaded);
        expect(nodes.get()).toEqual('cached1');
    });
    test('cache async', async () => {
        localStorage.setItem('nodes', JSON.stringify({ key0: { key: 'key0' } }));
        localStorage.setItem('nodes__m', JSON.stringify({ modified: 1000 }));

        const nodes = observable(async ({ cache }: ActivateParams) => {
            const { dateModified, value } = await cache({
                pluginLocal: ObservablePersistLocalStorage,
                local: 'nodes',
            });
            expect(dateModified).toEqual(1000);
            expect(value).toEqual({ key0: { key: 'key0' } });
            const nodes = await new Promise<{ key: string }[]>((resolve) =>
                setTimeout(() => resolve([{ key: 'key1' }]), 2),
            );
            return nodes.reduce((acc: Record<string, { key: string }>, node) => {
                acc[node.key] = node;
                return acc;
            }, {});
        });

        expect(nodes.get()).toEqual({ key0: { key: 'key0' } });
        await promiseTimeout(5);
        expect(nodes.get()).toEqual({ key1: { key: 'key1' } });
        await promiseTimeout(50);
    });
    // TODO asdf
    // test('cache async after onSet', async () => {
    //     localStorage.setItem('nodes2', JSON.stringify({ key0: { key: 'key0' } }));
    //     localStorage.setItem('nodes2__m', JSON.stringify({ modified: 1000 }));

    //     let lastSet;
    //     const nodes = observable(async ({ cache, onSet }: ActivateParams) => {
    //         const { dateModified, value } = await cache({
    //             pluginLocal: ObservablePersistLocalStorage,
    //             local: 'nodes2',
    //         });
    //         onSet(({ value }) => {
    //             lastSet = value;
    //         });
    //         expect(dateModified).toEqual(1000);
    //         expect(value).toEqual({ key0: { key: 'key0' } });
    //         const nodes = await new Promise<{ key: string }[]>((resolve) =>
    //             setTimeout(() => resolve([{ key: 'key1' }]), 2),
    //         );
    //         return nodes.reduce((acc: Record<string, { key: string }>, node) => {
    //             acc[node.key] = node;
    //             return acc;
    //         }, {});

    //         // const { dateModified, value } = await cache({
    //         //     pluginLocal: ObservablePersistLocalStorage,
    //         //     local: 'nodes2',
    //         // });
    //         // onSet(({ value }) => {
    //         //     lastSet = value;
    //         // });
    //         // expect(dateModified).toEqual(1000);
    //         // expect(value).toEqual({ key0: { key: 'key0' } });
    //         // const nodes = await new Promise<{ key: string }[]>((resolve) =>
    //         //     setTimeout(() => resolve([{ key: 'key1' }]), 2),
    //         // );
    //         // return nodes.reduce((acc: Record<string, { key: string }>, node) => {
    //         //     acc[node.key] = node;
    //         //     return acc;
    //         // }, {});
    //     });

    //     expect(nodes.get()).toEqual({ key0: { key: 'key0' } });
    //     await promiseTimeout(5);
    //     expect(nodes.get()).toEqual({ key1: { key: 'key1' } });

    //     await when(nodes._state.isLoaded);
    //     nodes.set({ key2: { key: 'key2' } });
    //     await promiseTimeout(5);

    //     expect(lastSet).toEqual({ key2: { key: 'key2' } });
    // });
});

describe('dateModified with new computed', () => {
    test('dateModified from updateLastSync', async () => {
        const nodes = observable(async ({ cache, updateLastSync }: ActivateParams) => {
            cache({
                pluginLocal: ObservablePersistLocalStorage,
                local: 'nodes-dateModified',
            });
            const nodes = await new Promise<{ key: string }[]>((resolve) =>
                setTimeout(() => resolve([{ key: 'key0' }]), 0),
            );
            updateLastSync(1000);
            return nodes.reduce((acc: Record<string, { key: string }>, node) => {
                acc[node.key] = node;
                return acc;
            }, {});
        });

        expect(nodes.get()).toEqual(undefined);

        await when(nodes._state.isLoadedLocal);
        await when(nodes._state.isLoaded);
        expect(nodes.get()).toEqual({ key0: { key: 'key0' } });

        await promiseTimeout(1);
        expect(localStorage.getItem('nodes-dateModified')).toEqual(JSON.stringify({ key0: { key: 'key0' } }));
        expect(localStorage.getItem('nodes-dateModified__m')).toEqual(JSON.stringify({ modified: 1000 }));
    });
    test('dateModified from subscribe', async () => {
        const value = observable(async ({ cache, subscribe }: ActivateParams) => {
            cache({
                pluginLocal: ObservablePersistLocalStorage,
                local: 'dateModified2',
            });
            subscribe(({ update }) => {
                setTimeout(() => {
                    update({ value: 'test2', dateModified: 1000 });
                }, 5);
            });
            return new Promise<string>((resolve) => setTimeout(() => resolve('test'), 1));
        });

        expect(value.get()).toEqual(undefined);
        await promiseTimeout(0);
        expect(value.get()).toEqual('test');

        await promiseTimeout(10);
        expect(value.get()).toEqual('test2');
        expect(localStorage.getItem('dateModified2__m')).toEqual(JSON.stringify({ modified: 1000 }));
    });
});

describe('retry', () => {
    test('retry a get', async () => {
        const attemptNum$ = observable(0);
        const obs$ = observable(async ({ retry }: ActivateParams) => {
            retry({
                delay: 1,
            });

            return new Promise((resolve, reject) => {
                attemptNum$.set((v) => v + 1);
                attemptNum$.get() > 2 ? resolve('hi') : reject();
            });
        });

        obs$.get();
        expect(attemptNum$.get()).toEqual(1);
        expect(obs$.get()).toEqual(undefined);
        await when(() => attemptNum$.get() === 2);
        expect(obs$.get()).toEqual(undefined);
        await when(() => attemptNum$.get() === 3);
        await promiseTimeout(0);
        expect(obs$.get()).toEqual('hi');
    });
    test('retry a set', async () => {
        const attemptNum$ = observable(0);
        let saved = false;
        const obs$ = observable(async ({ retry, onSet }: ActivateParams) => {
            retry({
                delay: 1,
            });

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            onSet(({ value }, { onError }) => {
                return new Promise<void>((resolve) => {
                    attemptNum$.set((v) => v + 1);
                    if (attemptNum$.get() > 2) {
                        saved = true;
                        resolve();
                    } else {
                        onError();
                    }
                });
            });

            return 1;
        });

        obs$.get();

        expect(attemptNum$.get()).toEqual(0);
        obs$.set(1);
        await when(() => attemptNum$.get() === 1);
        expect(attemptNum$.get()).toEqual(1);
        expect(saved).toEqual(false);
        await when(() => attemptNum$.get() === 2);
        expect(saved).toEqual(false);
        await when(() => attemptNum$.get() === 3);
        expect(saved).toEqual(true);
    });
});
