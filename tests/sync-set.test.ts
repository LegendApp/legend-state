import { observable } from '@legendapp/state';
import { synced } from '@legendapp/state/sync';
import { syncState } from '../src/syncState';
import { when } from '../src/when';
import { getPersistName, ObservablePersistLocalStorage, promiseTimeout } from './testglobals';

describe('sync set', () => {
    test('remote snapshot does not overwrite newer local changes', async () => {
        let didUpdate = false;
        const obs$ = observable(
            synced({
                initial: { count: 0, note: 'init' },
                set: async ({ value, update }) => {
                    await promiseTimeout(10);
                    update({ value: { count: value.count, note: 'from-server' } });
                    didUpdate = true;
                },
            }),
        );

        obs$.get();

        obs$.count.set(1);
        await promiseTimeout(0);
        obs$.note.set('local');

        await promiseTimeout(20);

        expect(didUpdate).toBe(true);
        expect(obs$.count.get()).toBe(1);
        expect(obs$.note.get()).toBe('local');
    });

    test('server canonicalization merges only the changed path when other fields changed locally', async () => {
        const obs$ = observable(
            synced({
                initial: { count: 0, note: 'init' },
                set: async ({ value, update }) => {
                    await promiseTimeout(10);
                    update({ value: { count: value.count + 1, note: 'from-server' } });
                },
            }),
        );

        obs$.get();

        obs$.count.set(1);
        await promiseTimeout(0);
        obs$.note.set('local');

        await promiseTimeout(20);

        expect(obs$.count.get()).toBe(2);
        expect(obs$.note.get()).toBe('local');
    });

    test('server snapshot does not overwrite newer local changes to the same path', async () => {
        let setCalls = 0;
        const obs$ = observable(
            synced({
                initial: { count: 0 },
                set: async ({ value, update }) => {
                    setCalls += 1;
                    if (setCalls === 1) {
                        await promiseTimeout(10);
                        update({ value: { count: value.count } });
                    }
                },
            }),
        );

        obs$.get();

        obs$.count.set(1);
        await promiseTimeout(0);
        obs$.count.set(2);

        await promiseTimeout(20);

        expect(obs$.count.get()).toBe(2);
    });

    test('nested path merges without overwriting sibling changes', async () => {
        const obs$ = observable(
            synced({
                initial: { user: { name: 'init', age: 1 } },
                set: async ({ value, update }) => {
                    await promiseTimeout(10);
                    update({
                        value: {
                            user: {
                                name: 'from-server',
                                age: value.user.age + 1,
                            },
                        },
                    });
                },
            }),
        );

        obs$.get();

        obs$.user.age.set(2);
        await promiseTimeout(0);
        obs$.user.name.set('local');

        await promiseTimeout(20);

        expect(obs$.user.age.get()).toBe(3);
        expect(obs$.user.name.get()).toBe('local');
    });

    test('root set merges snapshot when local value is unchanged', async () => {
        const obs$ = observable(
            synced({
                initial: { count: 0 },
                set: async ({ value, update }) => {
                    await promiseTimeout(10);
                    update({ value: { ...value, server: true } });
                },
            }),
        );

        obs$.get();

        obs$.set({ count: 1 });

        await promiseTimeout(20);

        expect(obs$.get()).toEqual({ count: 1, server: true });
    });

    test('root set snapshot does not overwrite newer local changes', async () => {
        let setCalls = 0;
        const obs$ = observable(
            synced({
                initial: { count: 0, note: 'init' },
                set: async ({ value, update }) => {
                    setCalls += 1;
                    if (setCalls === 1) {
                        await promiseTimeout(10);
                        update({ value: { count: value.count, note: 'from-server' } });
                    }
                },
            }),
        );

        obs$.get();

        obs$.set({ count: 1, note: 'init' });
        await promiseTimeout(0);
        obs$.note.set('local');

        await promiseTimeout(20);

        expect(obs$.count.get()).toBe(1);
        expect(obs$.note.get()).toBe('local');
    });

    test('pending is not cleared when a newer change occurs before set completes', async () => {
        const persistName = getPersistName();
        let setCalls = 0;
        const obs$ = observable(
            synced({
                initial: { test: 'init' },
                set: async () => {
                    setCalls += 1;
                    if (setCalls === 1) {
                        await promiseTimeout(20);
                        return;
                    }
                    throw new Error('set failed');
                },
                persist: {
                    plugin: ObservablePersistLocalStorage,
                    name: persistName,
                    retrySync: true,
                },
            }),
        );

        const state$ = syncState(obs$);
        obs$.get();
        await when(state$.isPersistLoaded);

        obs$.test.set('first');
        await promiseTimeout(0);
        obs$.test.set('second');

        await promiseTimeout(40);

        const pending = state$.getPendingChanges();
        expect(setCalls).toBeGreaterThanOrEqual(2);
        expect(pending?.test?.v).toBe('second');
    });

    test('pending clears after set completes without update result', async () => {
        const persistName = getPersistName();
        const obs$ = observable(
            synced({
                initial: { title: 'start' },
                set: async () => {
                    await promiseTimeout(10);
                },
                persist: {
                    plugin: ObservablePersistLocalStorage,
                    name: persistName,
                    retrySync: true,
                },
            }),
        );

        const state$ = syncState(obs$);
        obs$.get();
        await when(state$.isPersistLoaded);

        obs$.title.set('next');
        await promiseTimeout(0);

        expect(state$.getPendingChanges()?.title?.v).toBe('next');

        await promiseTimeout(30);

        expect(state$.getPendingChanges()).toEqual({});
    });
});
