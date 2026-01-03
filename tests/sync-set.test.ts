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

    test('explicit update changes list preserves local changes on other paths', async () => {
        const obs$ = observable(
            synced({
                initial: { count: 0, note: 'init' },
                set: async ({ value, update }) => {
                    await promiseTimeout(10);
                    update({
                        value: { count: value.count + 1, note: 'from-server' },
                        changes: [
                            {
                                path: ['count'],
                                pathTypes: ['object'],
                                valueAtPath: value.count,
                                prevAtPath: value.count - 1,
                                pathStr: 'count',
                            },
                        ] as any,
                    });
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

    test('out-of-order updates do not overwrite newer local changes when both updates return snapshots', async () => {
        const allowFirst$ = observable(false);
        const allowSecond$ = observable(false);
        let setCalls = 0;
        const obs$ = observable(
            synced({
                initial: { count: 0 },
                set: async ({ value, update }) => {
                    setCalls += 1;
                    if (setCalls === 1) {
                        await when(allowFirst$);
                        update({ value: { count: value.count } });
                    } else if (setCalls === 2) {
                        await when(allowSecond$);
                        update({ value: { count: value.count } });
                    }
                },
            }),
        );

        obs$.get();

        obs$.count.set(1);
        await promiseTimeout(0);
        obs$.count.set(2);
        await promiseTimeout(0);

        allowSecond$.set(true);
        await promiseTimeout(0);
        allowFirst$.set(true);

        await promiseTimeout(20);

        expect(obs$.count.get()).toBe(2);
    });

    test('out-of-order root updates do not overwrite newer local root changes', async () => {
        const allowFirst$ = observable(false);
        const allowSecond$ = observable(false);
        let setCalls = 0;
        const obs$ = observable(
            synced({
                initial: { count: 0, note: 'init' },
                set: async ({ value, update }) => {
                    setCalls += 1;
                    if (setCalls === 1) {
                        await when(allowFirst$);
                        update({ value: { ...value } });
                    } else if (setCalls === 2) {
                        await when(allowSecond$);
                        update({ value: { ...value } });
                    }
                },
            }),
        );

        obs$.get();

        obs$.set({ count: 1, note: 'first' });
        await promiseTimeout(0);
        obs$.set({ count: 2, note: 'second' });
        await promiseTimeout(0);

        allowSecond$.set(true);
        await promiseTimeout(0);
        allowFirst$.set(true);

        await promiseTimeout(20);

        expect(obs$.get()).toEqual({ count: 2, note: 'second' });
    });

    test('out-of-order nested updates do not overwrite newer local changes', async () => {
        const allowFirst$ = observable(false);
        const allowSecond$ = observable(false);
        let setCalls = 0;
        const obs$ = observable(
            synced({
                initial: { user: { name: 'init', age: 1 } },
                set: async ({ value, update }) => {
                    setCalls += 1;
                    if (setCalls === 1) {
                        await when(allowFirst$);
                        update({ value: { user: { name: value.user.name } } });
                    } else if (setCalls === 2) {
                        await when(allowSecond$);
                        update({ value: { user: { name: value.user.name } } });
                    }
                },
            }),
        );

        obs$.get();

        obs$.user.name.set('first');
        await promiseTimeout(0);
        obs$.user.name.set('second');
        await promiseTimeout(0);

        allowSecond$.set(true);
        await promiseTimeout(0);
        allowFirst$.set(true);

        await promiseTimeout(20);

        expect(obs$.user.name.get()).toBe('second');
    });

    test('out-of-order array updates do not overwrite newer local changes', async () => {
        const allowFirst$ = observable(false);
        const allowSecond$ = observable(false);
        let setCalls = 0;
        const obs$ = observable(
            synced({
                initial: { items: ['init'] },
                set: async ({ value, update }) => {
                    setCalls += 1;
                    if (setCalls === 1) {
                        await when(allowFirst$);
                        update({ value: { items: value.items } });
                    } else if (setCalls === 2) {
                        await when(allowSecond$);
                        update({ value: { items: value.items } });
                    }
                },
            }),
        );

        obs$.get();

        obs$.items[0].set('first');
        await promiseTimeout(0);
        obs$.items[0].set('second');
        await promiseTimeout(0);

        allowSecond$.set(true);
        await promiseTimeout(0);
        allowFirst$.set(true);

        await promiseTimeout(20);

        expect(obs$.items[0].get()).toBe('second');
    });

    test('multiple rapid updates keep the latest value when the oldest update returns last', async () => {
        const allowFirst$ = observable(false);
        const allowSecond$ = observable(false);
        const allowThird$ = observable(false);
        let setCalls = 0;
        const obs$ = observable(
            synced({
                initial: { count: 0 },
                set: async ({ value, update }) => {
                    setCalls += 1;
                    if (setCalls === 1) {
                        await when(allowFirst$);
                        update({ value: { count: value.count } });
                    } else if (setCalls === 2) {
                        await when(allowSecond$);
                        update({ value: { count: value.count } });
                    } else if (setCalls === 3) {
                        await when(allowThird$);
                        update({ value: { count: value.count } });
                    }
                },
            }),
        );

        obs$.get();

        obs$.count.set(1);
        await promiseTimeout(0);
        obs$.count.set(2);
        await promiseTimeout(0);
        obs$.count.set(3);
        await promiseTimeout(0);

        allowSecond$.set(true);
        allowThird$.set(true);
        await promiseTimeout(0);
        allowFirst$.set(true);

        await promiseTimeout(20);

        expect(obs$.count.get()).toBe(3);
    });

    test('out-of-order child update does not overwrite newer parent update', async () => {
        const allowChild$ = observable(false);
        const allowParent$ = observable(false);
        let setCalls = 0;
        const obs$ = observable(
            synced({
                initial: { user: { name: 'init', age: 1 } },
                set: async ({ value, update }) => {
                    setCalls += 1;
                    if (setCalls === 1) {
                        await when(allowChild$);
                        update({ value: { user: { name: value.user.name } } });
                    } else if (setCalls === 2) {
                        await when(allowParent$);
                        update({ value: { user: { ...value.user } } });
                    }
                },
            }),
        );

        obs$.get();

        obs$.user.name.set('child');
        await promiseTimeout(0);
        obs$.user.set({ name: 'parent', age: 2 });
        await promiseTimeout(0);

        allowParent$.set(true);
        await promiseTimeout(0);
        allowChild$.set(true);

        await promiseTimeout(20);

        expect(obs$.user.get()).toEqual({ name: 'parent', age: 2 });
    });

    test('out-of-order parent update does not overwrite newer child change', async () => {
        const allowParent$ = observable(false);
        const allowChild$ = observable(false);
        let setCalls = 0;
        const obs$ = observable(
            synced({
                initial: { user: { name: 'init', age: 1 } },
                set: async ({ value, update }) => {
                    setCalls += 1;
                    if (setCalls === 1) {
                        const parentValue = { ...value.user };
                        await when(allowParent$);
                        update({
                            value: { user: { ...parentValue } },
                            changes: [
                                {
                                    path: ['user'],
                                    pathTypes: ['object'],
                                    valueAtPath: parentValue,
                                    prevAtPath: null,
                                    pathStr: 'user',
                                },
                            ] as any,
                        });
                    } else if (setCalls === 2) {
                        const childName = value.user.name;
                        await when(allowChild$);
                        update({
                            value: { user: { name: childName } },
                            changes: [
                                {
                                    path: ['user', 'name'],
                                    pathTypes: ['object', 'object'],
                                    valueAtPath: childName,
                                    prevAtPath: null,
                                    pathStr: 'user/name',
                                },
                            ] as any,
                        });
                    }
                },
            }),
        );

        obs$.get();

        obs$.user.set({ name: 'parent', age: 2 });
        await promiseTimeout(0);
        obs$.user.name.set('child');
        await promiseTimeout(0);

        allowChild$.set(true);
        await promiseTimeout(0);
        allowParent$.set(true);

        await promiseTimeout(20);

        expect(obs$.user.get()).toEqual({ name: 'child', age: 2 });
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
