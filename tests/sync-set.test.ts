import {
    internal,
    applyChanges,
    ObservableHint,
    batch,
    beginBatch,
    endBatch,
    observable,
    observablePrimitive,
} from '@legendapp/state';
import { configureLegendState } from '../src/config/configureLegendState';
import { synced, syncObservable } from '@legendapp/state/sync';
import { syncedCrud } from '../src/sync-plugins/crud';
import { clone, safeParse, symbolDelete } from '../src/globals';
import { ObservablePersistLocalStorageBase } from '../src/persist-plugins/local-storage';
import { syncState } from '../src/syncState';
import type { PendingChanges } from '../src/sync/syncTypes';
import { when } from '../src/when';
import { getPersistName, ObservablePersistLocalStorage, promiseTimeout } from './testglobals';

function cloneFixture<T>(value: T, seen = new Map<any, any>()): T {
    if (!value || typeof value !== 'object') return value;
    if (seen.has(value)) return seen.get(value);
    const out: any = Array.isArray(value)
        ? new Array(value.length)
        : value instanceof Map
          ? new Map()
          : value instanceof Set
            ? new Set()
            : value instanceof Date
              ? new Date(value.getTime())
              : {};
    seen.set(value, out);
    if (value instanceof Map) {
        value.forEach((item, key) => out.set(cloneFixture(key, seen), cloneFixture(item, seen)));
    } else if (value instanceof Set) {
        value.forEach((item) => out.add(cloneFixture(item, seen)));
    } else if (!(value instanceof Date)) {
        for (const key of Object.keys(value)) {
            Object.defineProperty(out, key, {
                value: cloneFixture((value as any)[key], seen),
                enumerable: true,
                configurable: true,
                writable: true,
            });
        }
    }
    return out;
}

describe('full save transform lifecycle', () => {
    test('transport waits for the full asynchronous save transform', async () => {
        let calls = 0;
        let release!: () => void;
        const sent: any[] = [];
        const obs = observable(
            synced({
                initial: { value: 0 },
                transform: {
                    save: (value) => {
                        const saved = { wire: value.value };
                        return ++calls === 3
                            ? new Promise<typeof saved>((resolve) => {
                                  release = () => resolve(saved);
                              })
                            : Promise.resolve(saved);
                    },
                    load: (value: any) => ({ value: value.wire }),
                },
                set: async (params) => {
                    sent.push(params.value);
                },
            }),
        );
        obs.get();
        obs.value.set(1);
        await promiseTimeout(10);
        const state = syncState(obs);
        expect(typeof release).toBe('function');
        expect(sent).toEqual([]);
        expect(state.isSetting.peek()).toBe(true);
        expect(state.numPendingSets.peek()).toBe(1);
        release();
        await promiseTimeout(10);
        expect(sent).toEqual([{ wire: 1 }]);
        expect(obs.peek()).toEqual({ value: 1 });
        expect(state.getPendingChanges()).toEqual({});
        expect(state.numPendingSets.peek()).toBe(0);
        expect(state.isSetting.peek()).toBe(false);
    });
    for (const asynchronous of [false, true])
        test(`failed full save transform settles and a fresh edit saves asynchronous=${asynchronous}`, async () => {
            const failure = Error('full save transform unavailable');
            const errors: Error[] = [];
            const sent: any[] = [];
            let calls = 0;
            const obs = observable(
                synced({
                    initial: { value: 0 },
                    transform: {
                        save: (value) => {
                            if (++calls === 3) {
                                if (asynchronous) return Promise.reject(failure);
                                throw failure;
                            }
                            return { wire: value.value };
                        },
                        load: (value: any) => ({ value: value.wire }),
                    },
                    set: async (params) => {
                        sent.push(params.value);
                    },
                    onError: (error) => errors.push(error),
                }),
            );
            obs.get();
            obs.value.set(1);
            await promiseTimeout(10);
            const state = syncState(obs);
            expect(errors).toEqual([failure]);
            expect(state.error.peek()).toBe(failure);
            expect(sent).toEqual([]);
            expect(state.numPendingSets.peek()).toBe(0);
            expect(state.isSetting.peek()).toBe(false);
            expect(state.getPendingChanges()).not.toEqual({});
            obs.value.set(2);
            await promiseTimeout(10);
            expect(sent).toEqual([{ wire: 2 }]);
            expect(obs.peek()).toEqual({ value: 2 });
            expect(state.getPendingChanges()).toEqual({});
            expect(state.numPendingSets.peek()).toBe(0);
        });
    for (const retry of [false, true])
        test(`terminal transport rejection settles and reports its error retry=${retry}`, async () => {
            const failure = Error('save unavailable');
            const errors: Error[] = [];
            let reject = true;
            let after = 0;
            const afterStates: (boolean | undefined)[] = [];
            const obs = observable(
                synced({
                    initial: { value: 0 },
                    retry: retry ? { times: 2, delay: 1, backoff: 'constant' } : undefined,
                    set: async () => {
                        if (reject) throw failure;
                    },
                    onError: (error) => errors.push(error),
                    onAfterSet: () => {
                        after++;
                        afterStates.push(syncState(obs).isSetting.peek());
                    },
                }),
            );
            obs.get();
            obs.value.set(1);
            await promiseTimeout(20);
            const state = syncState(obs);
            expect(errors).toEqual([failure]);
            expect(state.numPendingSets.peek()).toBe(0);
            expect(state.isSetting.peek()).toBe(false);
            expect(state.getPendingChanges()).not.toEqual({});
            expect(after).toBe(0);
            reject = false;
            obs.value.set(2);
            await promiseTimeout(10);
            expect(state.numPendingSets.peek()).toBe(0);
            expect(state.getPendingChanges()).toEqual({});
            expect(after).toBe(1);
            expect(afterStates).toEqual([false]);
        });
    test('a cancelled save drains its counters and a later edit can save', async () => {
        const sent: number[] = [];
        let cancel = true;
        const obs = observable(
            synced({
                initial: { value: 0 },
                onBeforeSet: (params) => {
                    params.cancel = cancel;
                },
                set: async (params) => {
                    sent.push(params.value.value);
                },
            }),
        );
        obs.get();
        obs.value.set(1);
        await promiseTimeout(10);
        const state = syncState(obs);
        expect(sent).toEqual([]);
        expect(state.numPendingSets.peek()).toBe(0);
        expect(state.isSetting.peek()).toBe(false);
        expect(state.getPendingChanges()).not.toEqual({});
        cancel = false;
        obs.value.set(2);
        await promiseTimeout(10);
        expect(sent).toEqual([2]);
        expect(state.numPendingSets.peek()).toBe(0);
        expect(state.getPendingChanges()).toEqual({});
    });
});

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
                        ],
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
                            ],
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
                            ],
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
            synced<{ count: number; server?: boolean }>({
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

    test('failed changes keep only their pending paths when sibling changes succeed', async () => {
        const persistName = getPersistName();
        const obs$ = observable(
            synced({
                initial: { count: 0, note: 'init' },
                set: async ({ changes, update }) => {
                    const countChange = changes.find((change) => change.pathStr === 'count')!;
                    const noteChange = changes.find((change) => change.pathStr === 'note')!;
                    update({
                        value: { count: 2 },
                        changes: [countChange],
                        failedChanges: [noteChange],
                    });
                    throw new Error('note failed');
                },
                onError: () => {},
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

        obs$.assign({ count: 1, note: 'local' });
        await promiseTimeout(20);

        expect(obs$.get()).toEqual({ count: 2, note: 'local' });
        expect(state$.getPendingChanges()).toEqual({
            note: { p: 'init', t: ['object'], v: 'local', h: [], c: true },
        });
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

test('Map pending overlay retains a newer array in a full remote snapshot', async () => {
    const requests: { update: (params: any) => void; resolve: () => void }[] = [];
    const obs: any = observable(
        synced<any>({
            initial: new Map([['id1', { scalar: 'old', list: [{ x: 0 }] }]]),
            set: ({ update }) => new Promise<void>((resolve) => requests.push({ update, resolve })),
        }),
    );
    obs.get();
    obs.id1.scalar.set('sent');
    await promiseTimeout(1);
    obs.id1.list.set([{ x: 2 }]);
    await promiseTimeout(1);
    expect(requests).toHaveLength(2);
    requests[0].update({ value: new Map([['id1', { scalar: 'normalized', list: [{ x: 0 }] }]]) });
    requests[0].resolve();
    await promiseTimeout(1);
    const during = cloneFixture(obs.peek().get('id1'));
    requests[1].resolve();
    await promiseTimeout(1);
    const expected = { scalar: 'normalized', list: [{ x: 2 }] };
    expect(during).toEqual(expected);
    expect(obs.peek().get('id1')).toEqual(expected);
    expect(obs.peek().size).toBe(1);
    expect(syncState(obs).getPendingChanges()).toEqual({});
});

test('explicit parent acknowledgement compares the captured snapshot rather than its live alias', async () => {
    const requests: { update: (params: any) => void; changes: any; resolve: () => void }[] = [];
    const obs = observable(
        synced({
            initial: { scalar: 0, user: { name: 'old', nested: { value: 0 } } },
            set: ({ update, changes }) => new Promise<void>((resolve) => requests.push({ update, changes, resolve })),
        }),
    );
    obs.get();
    obs.scalar.set(1);
    await promiseTimeout(1);
    obs.user.set({ name: 'sent', nested: { value: 1 } });
    await promiseTimeout(1);
    syncState(obs).isSyncEnabled.set(false);
    obs.user.nested.value.set(2);
    requests[1].update({ value: { user: { name: 'server', nested: { value: 1 } } }, changes: requests[1].changes });
    requests[1].resolve();
    await promiseTimeout(1);
    requests[0].resolve();
    await promiseTimeout(1);
    expect(obs.user.peek()).toEqual({ name: 'sent', nested: { value: 2 } });
    expect(syncState(obs).numPendingSets.peek()).toBe(0);
});

for (const mode of ['array', 'object'] as const) {
    test(`unchanged ${mode} refreshes retain a pending root and accept later remote changes`, async () => {
        let remote = [
            { id: 'a', value: 0, server: 0 },
            { id: 'b', value: 0, server: 0 },
        ];
        const pack = (rows: typeof remote) =>
            mode === 'array' ? rows : Object.fromEntries(rows.map((row) => [row.id, row]));
        let resolveSet!: () => void;
        const obs: any = observable(
            synced<any>({
                fieldId: 'id',
                get: async () => pack(clone(remote)),
                set: ({ update, changes }) =>
                    new Promise<void>((resolve) => {
                        resolveSet = () => {
                            update({ value: {}, changes });
                            resolve();
                        };
                    }),
            }),
        );
        obs.get();
        const state = syncState(obs);
        await when(state.isLoaded);
        const rows: typeof remote = clone(remote);
        rows[1].value = 1;
        obs.set(pack(rows));
        await when(state.isSetting);
        await state.sync();
        await state.sync();
        const readRows = () => (mode === 'array' ? obs.peek() : Object.values(obs.peek()));
        expect(readRows()).toEqual(rows);
        expect(state.getPendingChanges()?.['']).toBeDefined();
        remote = remote.map((row) => ({ ...row, server: 1 }));
        await state.sync();
        expect(readRows()).toEqual(rows.map((row) => ({ ...row, server: 1 })));
        resolveSet();
        await when(() => !state.isSetting.get());
        expect(state.getPendingChanges()).toEqual({});
    });
}

test('explicit root acknowledgement retains a remote refresh received during an overlapping save', async () => {
    let server = 0;
    const requests: { update: (params: any) => void; changes: any; resolve: () => void }[] = [];
    const obs = observable(
        synced({
            get: async () => ({ scalar: 0, user: { name: 'old', server } }),
            set: ({ update, changes }) => new Promise<void>((resolve) => requests.push({ update, changes, resolve })),
        }),
    );
    obs.get();
    const state = syncState(obs);
    await when(state.isLoaded);
    obs.scalar.set(1);
    await promiseTimeout(1);
    obs.set({ scalar: 1, user: { name: 'sent', server: 0 } });
    await promiseTimeout(1);
    server = 1;
    await state.sync();
    expect(obs.user.peek()).toEqual({ name: 'sent', server: 1 });
    requests[1].update({
        value: { scalar: 1, user: { name: 'normalized', server: 0 } },
        changes: requests[1].changes,
    });
    requests[1].resolve();
    await promiseTimeout(1);
    requests[0].resolve();
    await when(() => !state.isSetting.get());
    expect(obs.user.peek()).toEqual({ name: 'sent', server: 1 });
    expect(state.getPendingChanges()).toEqual({});
});

test('explicit root acknowledgement detects edits whose batch notification is still pending', async () => {
    const requests: { update: (params: any) => void; changes: any; resolve: () => void }[] = [];
    let complete!: () => void;
    const completed = new Promise<void>((resolve) => (complete = resolve));
    const obs = observable(
        synced({
            initial: { scalar: 0, user: { name: 'old' } },
            onAfterSet: complete,
            set: ({ update, changes }) => new Promise<void>((resolve) => requests.push({ update, changes, resolve })),
        }),
    );
    obs.get();
    obs.scalar.set(1);
    await promiseTimeout(1);
    obs.set({ scalar: 1, user: { name: 'sent' } });
    await promiseTimeout(1);
    const state = syncState(obs);
    state.isSyncEnabled.set(false);
    beginBatch();
    try {
        obs.user.name.set('newer');
        requests[1].update({ value: { user: { name: 'normalized' } }, changes: requests[1].changes });
        requests[1].resolve();
        await completed;
        expect(obs.user.name.peek()).toBe('newer');
    } finally {
        endBatch();
    }
    requests[0].resolve();
    await when(() => !state.isSetting.get());
    expect(obs.user.name.peek()).toBe('newer');
});

test('pending root refresh tolerates a serializable proxy rejecting key introspection once', async () => {
    let remote: any = { a: { value: 0, server: 0 } };
    let release!: () => void;
    const errors: string[] = [];
    const obs: any = observable(
        synced<any>({
            get: async () => remote,
            set: () => new Promise<void>((resolve) => (release = resolve)),
            onError: (error) => errors.push(error.message),
        }),
    );
    obs.get();
    const state = syncState(obs);
    await when(state.isLoaded);
    obs.set({ a: { value: 1, server: 0 } });
    await when(state.isSetting);
    const next = { a: { value: 0, server: 1 }, b: { value: 2, server: 1 } };
    const target = Object.defineProperty({ ...next }, 'toJSON', { value: () => next });
    let rejected = false;
    remote = new Proxy(target, {
        ownKeys(value) {
            if (!rejected) {
                rejected = true;
                throw Error('introspection unavailable');
            }
            return Reflect.ownKeys(value);
        },
    });
    await state.sync();
    expect(rejected).toBe(true);
    expect(errors).toEqual([]);
    expect(obs.peek()).toEqual({ a: { value: 1, server: 1 }, b: { value: 2, server: 1 } });
    release();
    await when(() => !state.isSetting.get());
});

test('wider replacements retain reversions from literal slash keys', async () => {
    let push!: (params: any) => void;
    const releases: (() => void)[] = [];
    const obs = observable(
        synced({
            get: async () => ({ 'a/b': 'A', other: 0 }),
            set: () => new Promise<void>((resolve) => releases.push(resolve)),
            subscribe: (params) => {
                push = params.update;
            },
        }),
    );
    obs.get();
    await when(syncState(obs).isLoaded);
    obs['a/b'].set('B');
    await promiseTimeout(0);
    obs['a/b'].set('A');
    await promiseTimeout(0);
    obs.set({ 'a/b': 'A', other: 1 });
    await promiseTimeout(0);
    push({ value: { 'a/b': 'B', other: 0, server: 1 }, mode: 'set' });
    await promiseTimeout(0);
    expect(obs.peek()).toEqual({ 'a/b': 'A', other: 1, server: 1 });
    expect(Object.keys(syncState(obs).getPendingChanges()!)).toHaveLength(1);
    push({ value: { 'a/b': 'A', other: 1, server: 1 }, mode: 'set' });
    await promiseTimeout(0);
    expect(syncState(obs).getPendingChanges()).toEqual({});
    for (const release of releases) release();
    await when(() => !syncState(obs).isSetting.get());
    expect(obs.peek()).toEqual({ 'a/b': 'A', other: 1, server: 1 });
    expect(syncState(obs).error.peek()).toBeUndefined();
});

test.each([null, undefined])(
    'failed roots ignore responses serialized to %s beside newer child edits',
    async (serialized) => {
        const requests: { update: (params: any) => void; changes: any; resolve: () => void }[] = [];
        const obs = observable(
            synced({
                initial: { keep: 0, saved: 0 },
                set: ({ update, changes }) =>
                    new Promise<void>((resolve) => requests.push({ update, changes, resolve })),
            }),
        );
        obs.get();
        obs.set({ keep: 1, saved: 1 });
        await promiseTimeout(0);
        obs.keep.set(2);
        await promiseTimeout(0);
        let reads = 0;
        requests[0].update({
            value: {
                toJSON: () => {
                    reads++;
                    return serialized;
                },
            },
            changes: requests[0].changes,
            failedChanges: requests[0].changes,
        });
        requests[0].resolve();
        await promiseTimeout(5);
        expect(reads).toBe(1);
        expect(obs.peek()).toEqual({ keep: 2, saved: 1 });
        expect(syncState(obs).numPendingSets.peek()).toBe(1);
        requests[1].resolve();
        await when(() => !syncState(obs).isSetting.get());
        expect(obs.peek()).toEqual({ keep: 2, saved: 1 });
        expect(syncState(obs).error.peek()).toBeUndefined();
    },
);

for (const source of ['get', 'subscribe'] as const)
    for (const indexed of [false, true])
        test(`${source}: an absorbed primitive array keeps server-only fields (indexed=${indexed})`, async () => {
            const initial = { title: 'old', tags: ['A'], removed: 1 };
            let remote: any = clone(initial);
            let push!: (params: any) => void;
            const releases: (() => void)[] = [];
            const obs: any = observable(
                synced<any>({
                    get: async () => clone(remote),
                    set: () => new Promise<void>((resolve) => releases.push(resolve)),
                    subscribe: (params) => {
                        push = params.update;
                    },
                }),
            );
            obs.get();
            await when(syncState(obs).isLoaded);
            if (indexed) {
                obs.tags[0].set('B');
                await promiseTimeout(0);
                obs.tags[0].set('A');
            } else obs.tags.set(['A', 'B']);
            await promiseTimeout(0);
            obs.set({ title: 'local', tags: ['A', 'B'] });
            await promiseTimeout(0);
            remote = { title: 'remote', tags: ['stale'], removed: 1, serverField: 1 };
            if (source === 'get') await syncState(obs).sync();
            else push({ value: remote, mode: 'merge' });
            await promiseTimeout(0);
            expect(obs.peek()).toEqual({ title: 'local', tags: ['A', 'B'], serverField: 1 });
            expect(Object.keys(syncState(obs).getPendingChanges()!)).toEqual(['']);
            push({ value: { title: 'local', tags: ['A', 'B'], serverField: 1 }, mode: 'set' });
            await promiseTimeout(0);
            expect(syncState(obs).getPendingChanges()).toEqual({});
            for (const release of releases) release();
            await when(() => !syncState(obs).isSetting.get());
        });

for (const source of ['get', 'subscribe'] as const)
    test(`${source}: repeated merge deltas retain the complete pending server baseline`, async () => {
        let remote: any = { a: 0 };
        let push!: (params: any) => void;
        let release!: () => void;
        const obs: any = observable(
            synced<any>({
                mode: 'merge',
                get: async () => clone(remote),
                set: () =>
                    new Promise<void>((resolve) => {
                        release = resolve;
                    }),
                subscribe: (params) => {
                    push = params.update;
                },
            }),
        );
        obs.get();
        await when(syncState(obs).isLoaded);
        obs.set({ a: 1 });
        await when(syncState(obs).isSetting);
        const update = async (value: any) => {
            if (source === 'get') {
                remote = value;
                await syncState(obs).sync();
            } else push({ value, mode: 'merge' });
            await promiseTimeout(0);
        };
        await update({ b: { x: 1, keep: 1 } });
        await update({ c: { x: 1 } });
        await update({ b: { x: 2 } });
        expect(obs.peek()).toEqual({ a: 1, b: { x: 2, keep: 1 }, c: { x: 1 } });
        expect(syncState(obs).getPendingChanges()!['']).toBeDefined();
        push({ value: { a: 1, b: { x: 2, keep: 1 }, c: { x: 1 } }, mode: 'set' });
        await promiseTimeout(0);
        expect(syncState(obs).getPendingChanges()).toEqual({});
        release();
        await when(() => !syncState(obs).isSetting.get());
        expect(obs.peek()).toEqual({ a: 1, b: { x: 2, keep: 1 }, c: { x: 1 } });
        expect(syncState(obs).error.peek()).toBeUndefined();
    });

for (const echo of [false, true])
    for (const key of ['removed', 'toString', '__proto__'])
        for (const ownUndefined of [false, true])
            test(`an unchanged pending field accepts remote ${ownUndefined ? 'undefined' : 'removal'} of ${key} (echo=${echo})`, async () => {
                let push!: (params: any) => void;
                let release!: () => void;
                const initial = Object.defineProperty({ title: 'old' }, key, {
                    value: 1,
                    enumerable: true,
                    configurable: true,
                    writable: true,
                });
                const obs: any = observable(
                    synced<any>({
                        get: async () => clone(initial),
                        set: () =>
                            new Promise<void>((resolve) => {
                                release = resolve;
                            }),
                        subscribe: (params) => {
                            push = params.update;
                        },
                    }),
                );
                obs.get();
                await when(syncState(obs).isLoaded);
                const local = { ...initial, title: 'new' };
                obs.set(local);
                await when(syncState(obs).isSetting);
                if (echo) {
                    push({ value: { ...local }, mode: 'merge' });
                    await promiseTimeout(0);
                }
                expect(Object.keys(syncState(obs).getPendingChanges()!)).toEqual(['']);
                const remote = ownUndefined
                    ? Object.defineProperty({ title: echo ? 'new' : 'old' }, key, {
                          value: undefined,
                          enumerable: true,
                          configurable: true,
                          writable: true,
                      })
                    : { title: echo ? 'new' : 'old' };
                push({ value: remote, mode: 'set' });
                await promiseTimeout(0);
                expect(obs.peek().title).toBe('new');
                expect(Object.hasOwn(obs.peek(), key)).toBe(ownUndefined);
                if (ownUndefined) expect(obs.peek()[key]).toBeUndefined();
                expect(Object.getPrototypeOf(obs.peek())).toBe(Object.prototype);
                if (!echo) {
                    expect(syncState(obs).getPendingChanges()!['']).toBeDefined();
                    push({ value: { ...remote, title: 'new' }, mode: 'set' });
                    await promiseTimeout(0);
                }
                expect(syncState(obs).getPendingChanges()).toEqual({});
                release();
                await when(() => !syncState(obs).isSetting.get());
            });

for (const shape of ['nested', 'Map'] as const)
    test(`${shape}: a complete response accepts an unowned undefined beside a pending field`, async () => {
        const pack = (title: string, server: number | undefined): any =>
            shape === 'Map'
                ? new Map([
                      ['title', title],
                      ['server', server],
                  ] as [string, any][])
                : { row: { title, server } };
        let push!: (params: any) => void;
        let release!: () => void;
        const obs: any = observable(
            synced<any>({
                get: async () => pack('old', 1),
                set: () =>
                    new Promise<void>((resolve) => {
                        release = resolve;
                    }),
                subscribe: (params) => {
                    push = params.update;
                },
            }),
        );
        obs.get();
        await when(syncState(obs).isLoaded);
        obs.set(pack('new', 1));
        await when(syncState(obs).isSetting);
        push({ value: pack('old', undefined), mode: 'set' });
        await promiseTimeout(0);
        expect(obs.peek()).toEqual(pack('new', undefined));
        expect(syncState(obs).getPendingChanges()!['']).toBeDefined();
        push({ value: pack('new', undefined), mode: 'set' });
        await promiseTimeout(0);
        expect(syncState(obs).getPendingChanges()).toEqual({});
        release();
        await when(() => !syncState(obs).isSetting.get());
        expect(obs.peek()).toEqual(pack('new', undefined));
        expect(syncState(obs).error.peek()).toBeUndefined();
    });

for (const key of ['__proto__', 'constructor', 'toString', 'set', 'peek', 'assign', 'get'])
    test('literal pending merge key ' + key, async () => {
        const proto = Object.getOwnPropertyDescriptors(Object.prototype);
        let push!: (p: any) => void;
        let release!: () => void;
        const obs: any = observable(
            synced<any>({
                get: async () => ({ a: 0 }),
                set: () => new Promise<void>((resolve) => (release = resolve)),
                subscribe: (p) => {
                    push = p.update;
                },
            }),
        );
        try {
            obs.get();
            const state = syncState(obs);
            await when(state.isLoaded);
            obs.set({ a: 1 });
            await when(state.isSetting);
            const first: any = Object.defineProperty({}, key, { value: { x: 1, keep: 1 }, enumerable: true });
            push({ value: first, mode: 'merge' });
            await promiseTimeout(0);
            push({ value: { c: 1 }, mode: 'merge' });
            await promiseTimeout(0);
            const second: any = Object.defineProperty({}, key, { value: { x: 2 }, enumerable: true });
            push({ value: second, mode: 'merge' });
            await promiseTimeout(0);
            const expected = Object.defineProperty({ a: 1, c: 1 }, key, {
                value: { x: 2, keep: 1 },
                enumerable: true,
                configurable: true,
                writable: true,
            });
            expect(obs.peek()).toEqual(expected);
            expect(Object.hasOwn(obs.peek(), key)).toBe(true);
            expect(Object.getPrototypeOf(obs.peek())).toBe(Object.prototype);
            expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(proto);
            expect(first[key]).toEqual({ x: 1, keep: 1 });
            expect(second[key]).toEqual({ x: 2 });
            expect(state.numPendingSets.peek()).toBe(1);
            expect(state.getPendingChanges()!['']).toBeDefined();
            push({ value: expected, mode: 'set' });
            await promiseTimeout(0);
            expect(state.getPendingChanges()).toEqual({});
            release();
            await when(() => !state.isSetting.get());
            expect(state.numPendingSets.peek()).toBe(0);
        } finally {
            release?.();
            for (const p of Reflect.ownKeys(Object.prototype)) {
                if (!Object.hasOwn(proto, p)) delete (Object.prototype as any)[p];
            }
            Object.defineProperties(Object.prototype, proto);
        }
    });
test('typed Map pending merge keys stay distinct', async () => {
    let push!: (p: any) => void;
    let release!: () => void;
    const initial = new Map<any, any>([
        [1, { x: 0, keep: 1 }],
        ['1', { x: 0, keep: 2 }],
        ['a', 0],
    ]);
    const obs: any = observable(
        synced<any>({
            get: async () => clone(initial),
            set: () => new Promise<void>((resolve) => (release = resolve)),
            subscribe: (p) => {
                push = p.update;
            },
        }),
    );
    obs.get();
    const state = syncState(obs);
    await when(state.isLoaded);
    obs.set(new Map([...initial, ['a', 1]]));
    await when(state.isSetting);
    push({ value: new Map([[1, { x: 2 }]]), mode: 'merge' });
    await promiseTimeout(0);
    push({ value: new Map([['c', 1]]), mode: 'merge' });
    await promiseTimeout(0);
    push({ value: new Map([['1', { x: 3 }]]), mode: 'merge' });
    await promiseTimeout(0);
    const expected = new Map<any, any>([
        [1, { x: 2, keep: 1 }],
        ['1', { x: 3, keep: 2 }],
        ['a', 1],
        ['c', 1],
    ]);
    expect(obs.peek()).toEqual(expected);
    expect(state.numPendingSets.peek()).toBe(1);
    push({ value: expected, mode: 'set' });
    await promiseTimeout(0);
    expect(state.getPendingChanges()).toEqual({});
    release();
    await when(() => !state.isSetting.get());
    expect(state.numPendingSets.peek()).toBe(0);
});

test('a rejected acknowledgement metadata write reports its error and drains set counters', async () => {
    const failure = Error('metadata unavailable');
    let rejectMetadata = false;
    class Persist extends ObservablePersistLocalStorage {
        async setMetadata(...args: Parameters<ObservablePersistLocalStorage['setMetadata']>) {
            if (rejectMetadata) throw failure;
            super.setMetadata(...args);
        }
    }
    let release!: () => void;
    let calls = 0;
    let after = 0;
    const errors: Error[] = [];
    const obs = observable(
        synced({
            initial: { value: 0 },
            set: () => {
                if (++calls === 1)
                    return new Promise<void>((resolve) => {
                        release = resolve;
                    });
            },
            persist: { name: getPersistName(), plugin: new Persist(), retrySync: true },
            onError: (error) => errors.push(error),
            onAfterSet: () => {
                after++;
            },
        }),
    );
    obs.get();
    const state = syncState(obs);
    await when(state.isPersistLoaded);
    obs.value.set(1);
    await when(state.isSetting);
    rejectMetadata = true;
    release();
    await promiseTimeout(10);
    expect(state.numPendingSets.peek()).toBe(0);
    expect(state.isSetting.peek()).toBe(false);
    expect(state.error.peek()).toBe(failure);
    expect(errors).toEqual([failure]);
    expect(after).toBe(1);
    rejectMetadata = false;
    obs.value.set(2);
    await when(() => !state.isSetting.get() && calls === 2);
    expect(state.numPendingSets.peek()).toBe(0);
    expect(state.getPendingChanges()).toEqual({});
    expect(after).toBe(2);
});

test('a rejected local write stays with its observable and does not poison later saves', async () => {
    const badName = getPersistName();
    const failure = Error('local storage unavailable');
    let rejectLocal = true;
    class Persist extends ObservablePersistLocalStorage {
        async set(...args: Parameters<ObservablePersistLocalStorage['set']>) {
            if (args[0] === badName && rejectLocal) throw failure;
            super.set(...args);
        }
    }
    const persist = new Persist();
    const badSaved: number[] = [];
    const goodSaved: number[] = [];
    const errors: Error[] = [];
    const make = (name: string, saved: number[]) =>
        observable(
            synced({
                initial: { value: 0 },
                set: async ({ value }) => {
                    saved.push(value.value);
                },
                persist: { name, plugin: persist, retrySync: true },
                onError: (error) => errors.push(error),
            }),
        );
    const bad = make(badName, badSaved);
    const good = make(getPersistName(), goodSaved);
    bad.get();
    good.get();
    await when(syncState(bad).isPersistLoaded);
    await when(syncState(good).isPersistLoaded);
    bad.value.set(1);
    await promiseTimeout(10);
    expect(syncState(bad).error.peek()).toBe(failure);
    expect(badSaved).toEqual([]);
    expect(syncState(bad).numPendingSets.peek()).toBe(0);
    expect(syncState(bad).getPendingChanges()).not.toEqual({});
    good.value.set(1);
    await promiseTimeout(10);
    expect(goodSaved).toEqual([1]);
    expect(syncState(good).getPendingChanges()).toEqual({});
    expect(syncState(good).numPendingSets.peek()).toBe(0);
    rejectLocal = false;
    bad.value.set(2);
    await promiseTimeout(10);
    expect(badSaved).toEqual([2]);
    expect(syncState(bad).getPendingChanges()).toEqual({});
    expect(syncState(bad).numPendingSets.peek()).toBe(0);
    expect(errors).toEqual([failure]);
});

for (const shape of ['Map', 'object'] as const)
    for (const mode of ['set', 'merge'] as const)
        test(`${shape}: an unowned undefined baseline accepts its next server value (${mode})`, async () => {
            const pack = (server: number | undefined): any =>
                shape === 'Map'
                    ? new Map<any, any>([
                          ['title', 'old'],
                          ['server', server],
                      ])
                    : { title: 'old', server };
            let push!: (params: any) => void;
            let release!: () => void;
            const obs: any = observable(
                synced<any>({
                    get: async () => pack(1),
                    set: () =>
                        new Promise<void>((resolve) => {
                            release = resolve;
                        }),
                    subscribe: (params) => {
                        push = params.update;
                    },
                }),
            );
            obs.get();
            const state = syncState(obs);
            await when(state.isLoaded);
            const local = pack(1);
            if (shape === 'Map') local.set('title', 'new');
            else local.title = 'new';
            obs.set(local);
            await when(state.isSetting);
            const first = pack(undefined);
            push({ value: first, mode });
            await promiseTimeout(0);
            const baseline = state.getPendingChanges()![''].p;
            expect(shape === 'Map' ? baseline.has('server') : Object.hasOwn(baseline, 'server')).toBe(true);
            expect(shape === 'Map' ? baseline.get('server') : baseline.server).toBeUndefined();
            if (shape === 'Map') first.set('server', 99);
            else first.server = 99;
            push({ value: pack(2), mode: 'set' });
            await promiseTimeout(0);
            const expected = pack(2);
            if (shape === 'Map') expected.set('title', 'new');
            else expected.title = 'new';
            expect(obs.peek()).toEqual(expected);
            push({ value: expected, mode: 'set' });
            await promiseTimeout(0);
            expect(state.getPendingChanges()).toEqual({});
            release();
            await when(() => !state.isSetting.get());
            expect(state.numPendingSets.peek()).toBe(0);
            expect(state.error.peek()).toBeUndefined();
        });

for (const shape of ['object', 'Map', 'array'] as const)
    for (const intent of ['edit', 'partial edit', 'remove', 'add'] as const)
        test(`${shape}: a ${intent} echo cannot erase root ownership before complete confirmation`, async () => {
            const a = { id: 'a', value: 0 };
            const b = { id: 'b', value: 0 };
            const initial = [a, b];
            const local =
                intent === 'remove'
                    ? [{ ...b, value: 1 }]
                    : intent === 'add'
                      ? [{ ...a, value: 1 }, b, { id: 'c', value: 1 }]
                      : [
                            { ...a, value: 1 },
                            { ...b, value: 1 },
                        ];
            const echo =
                intent === 'remove'
                    ? [b]
                    : intent === 'add'
                      ? [a, b, { id: 'c', value: 1 }]
                      : intent === 'partial edit'
                        ? [{ ...a, value: 1 }]
                        : [{ ...a, value: 1 }, b];
            const pack = (rows: any[]): any =>
                shape === 'array'
                    ? rows
                    : shape === 'Map'
                      ? new Map(rows.map((row) => [row.id, row]))
                      : Object.fromEntries(rows.map((row) => [row.id, row]));
            let push!: (params: any) => void;
            let release!: () => void;
            const obs: any = observable(
                synced<any>({
                    get: async () => clone(pack(initial)),
                    set: () =>
                        new Promise<void>((resolve) => {
                            release = resolve;
                        }),
                    subscribe: (params) => {
                        push = params.update;
                    },
                }),
            );
            obs.get();
            const state = syncState(obs);
            await when(state.isLoaded);
            obs.set(clone(pack(local)));
            await when(state.isSetting);
            const mode = intent === 'partial edit' ? (shape === 'array' ? 'append' : 'assign') : 'set';
            push({ value: clone(pack(echo)), mode });
            await promiseTimeout(0);
            expect(obs.peek()).toEqual(pack(local));
            expect(state.getPendingChanges()!['']).toBeDefined();
            push({ value: clone(pack(initial)), mode: 'set' });
            await promiseTimeout(0);
            expect(obs.peek()).toEqual(pack(local));
            expect(state.getPendingChanges()!['']).toBeDefined();
            push({ value: clone(pack(local)), mode: 'set' });
            await promiseTimeout(0);
            expect(state.getPendingChanges()).toEqual({});
            release();
            await when(() => !state.isSetting.get());
            expect(obs.peek()).toEqual(pack(local));
            expect(state.numPendingSets.peek()).toBe(0);
            expect(state.error.peek()).toBeUndefined();
        });

test('pending snapshots preserve non-enumerable own array indices', async () => {
    let push!: (params: any) => void;
    let release!: () => void;
    const obs: any = observable(
        synced<any>({
            get: async () => ({ title: 'old', items: [1] }),
            set: () =>
                new Promise<void>((resolve) => {
                    release = resolve;
                }),
            subscribe: (params) => {
                push = params.update;
            },
        }),
    );
    obs.get();
    const state = syncState(obs);
    await when(state.isLoaded);
    obs.set({ title: 'new', items: [1] });
    await when(state.isSetting);
    const items = Object.defineProperty(new Array(1), '0', { value: 1, configurable: true, writable: true });
    push({ value: { title: 'old', items }, mode: 'set' });
    await promiseTimeout(0);
    const baseline = state.getPendingChanges()![''].p.items;
    expect(Object.hasOwn(baseline, 0)).toBe(true);
    expect(baseline[0]).toBe(1);
    push({ value: { title: 'old', items: [2] }, mode: 'set' });
    await promiseTimeout(0);
    expect(obs.peek()).toEqual({ title: 'new', items: [2] });
    push({ value: { title: 'new', items: [2] }, mode: 'set' });
    await promiseTimeout(0);
    expect(state.getPendingChanges()).toEqual({});
    release();
    await when(() => !state.isSetting.get());
});

test('pending merge snapshots do not mutate retained class instances', async () => {
    class Box {
        value = 0;
    }
    const original = new Box();
    let push!: (params: any) => void;
    let release!: () => void;
    const obs: any = observable(
        synced<any>({
            get: async () => ({ title: 'old', box: original }),
            set: () =>
                new Promise<void>((resolve) => {
                    release = resolve;
                }),
            subscribe: (params) => {
                push = params.update;
            },
        }),
    );
    obs.get();
    const state = syncState(obs);
    await when(state.isLoaded);
    obs.set({ title: 'new', box: original });
    await when(state.isSetting);
    push({ value: { box: { value: 2 } }, mode: 'merge' });
    await promiseTimeout(0);
    expect(original.value).toBe(0);
    expect(obs.peek()).toEqual({ title: 'new', box: { value: 2 } });
    push({ value: { title: 'new', box: { value: 2 } }, mode: 'set' });
    await promiseTimeout(0);
    expect(state.getPendingChanges()).toEqual({});
    release();
    await when(() => !state.isSetting.get());
});

const setMergeBoundaryCases = [
    'nested Set updater',
    'nested Set existing updater',
    'root Set updater',
    'root Set observable undefined',
    'nested Set observable undefined',
    'observable dense array',
    'raw dense array',
    'observable updater Set',
    'single observable peek',
    'direct observable function Set',
    'computed observable dense array',
];
for (const name of setMergeBoundaryCases)
    test(name, async () => {
        const root = name.startsWith('root Set');
        const calls: any[] = [];
        let peeks = 0;
        let push!: (p: any) => void;
        let release!: () => void;
        const initial: any = root
            ? new Set([0])
            : {
                  title: 'old',
                  serverSet: new Set(name === 'nested Set existing updater' ? [0, 'label'] : [0]),
                  rows: [1, 2, 3],
              };
        const local: any = root ? new Set([0, 1]) : { ...clone(initial), title: 'local' };
        const obs: any = observable(
            synced<any>({
                get: async () => clone(initial),
                set: () => new Promise<void>((r) => (release = r)),
                subscribe: (p) => {
                    push = p.update;
                },
            }),
        );
        obs.get();
        const state = syncState(obs);
        await when(state.isLoaded);
        obs.set(local);
        await when(state.isSetting);
        let incoming: any, serverExpected: any;
        if (name === 'nested Set updater' || name === 'nested Set existing updater' || name === 'root Set updater') {
            const fields = {
                label: (p: any) => {
                    calls.push(p);
                    return String(p) + ':x';
                },
            };
            incoming = root ? fields : { serverSet: fields };
            serverExpected = new Set(name === 'nested Set existing updater' ? [0, 'label', 'label:x'] : [0, 'label:x']);
        } else if (name.includes('observable undefined')) {
            incoming = root ? { label: observable(undefined) } : { serverSet: { label: observable(undefined) } };
            serverExpected = root ? new Set([0]) : new Set([0, undefined]);
        } else if (name === 'direct observable function Set') {
            const source: any = observable(
                ObservableHint.plain({
                    label: (p: any) => {
                        calls.push(p);
                        return String(p) + ':x';
                    },
                }),
            );
            source.peek();
            incoming = { serverSet: { label: source.label } };
            serverExpected = new Set([0]);
        } else if (name === 'observable updater Set') {
            const source: any = observablePrimitive(undefined);
            source.peek = () => {
                peeks++;
                return (p: any) => {
                    calls.push(p);
                    return String(p) + ':x';
                };
            };
            incoming = { serverSet: { label: source } };
            serverExpected = new Set([0, 'label:x']);
        } else {
            const raw = [9];
            let value: any = raw;
            if (name !== 'raw dense array') {
                value =
                    name === 'computed observable dense array'
                        ? observable(() => raw)
                        : name === 'single observable peek'
                          ? observablePrimitive(raw)
                          : observable(raw);
                if (name === 'single observable peek') {
                    const peek = value.peek;
                    value.peek = () => {
                        peeks++;
                        return peek();
                    };
                }
            }
            incoming = { rows: value };
            serverExpected = name === 'raw dense array' || name === 'computed observable dense array' ? [9] : [9, 2, 3];
        }
        push({ value: incoming, mode: 'merge' });
        await promiseTimeout(0);
        await promiseTimeout(0);
        expect(state.getPendingChanges()!['']).toBeDefined();
        expect(state.numPendingSets.peek()).toBe(1);
        const baseline = state.getPendingChanges()![''].p;
        if (root) {
            expect(baseline).toEqual(serverExpected);
            expect(obs.peek()).toEqual(local);
        } else if (name.includes('array') || name === 'single observable peek') {
            expect(obs.peek()).toEqual({ ...local, rows: serverExpected });
            expect(baseline.rows).toEqual(serverExpected);
        } else {
            expect(obs.peek().title).toBe(local.title);
            expect(obs.peek().rows).toEqual(local.rows);
            expect(obs.peek().serverSet).toEqual(serverExpected);
        }
        if (name.includes('updater')) expect(calls).toEqual(['label']);
        if (name === 'direct observable function Set') expect(calls).toEqual([]);
        if (name === 'single observable peek' || name === 'observable updater Set') expect(peeks).toBe(1);
        const final = obs.peek();
        push({ value: final, mode: 'set' });
        await promiseTimeout(0);
        expect(state.getPendingChanges()).toEqual({});
        release();
        await when(() => !state.isSetting.get());
        expect(state.numPendingSets.peek()).toBe(0);
        expect(obs.peek()).toEqual(final);
        expect(state.error.peek()).toBeUndefined();
    });

test('repeated assign deltas preserve a literal constructor baseline', async () => {
    let push!: (p: any) => void;
    let release!: () => void;
    const initial = { title: 'old', constructor: { x: 0, keep: 1 } };
    const obs: any = observable(
        synced<any>({
            get: async () => clone(initial),
            set: () => new Promise<void>((r) => (release = r)),
            subscribe: (p) => {
                push = p.update;
            },
        }),
    );
    obs.get();
    const state = syncState(obs);
    await when(state.isLoaded);
    obs.set({ ...clone(initial), title: 'local' });
    await when(state.isSetting);
    for (const value of [{ constructor: { x: 1, keep: 1 } }, { c: { x: 1 } }, { constructor: { x: 2 } }]) {
        push({ value, mode: 'assign' });
        await promiseTimeout(0);
        await promiseTimeout(0);
    }
    const expected = { title: 'local', constructor: { x: 2 }, c: { x: 1 } };
    expect(obs.peek()).toEqual(expected);
    expect(state.getPendingChanges()![''].p).toEqual({ title: 'old', constructor: { x: 2 }, c: { x: 1 } });
    expect(state.numPendingSets.peek()).toBe(1);
    push({ value: expected, mode: 'set' });
    await promiseTimeout(0);
    expect(state.getPendingChanges()).toEqual({});
    release();
    await when(() => !state.isSetting.get());
    expect(state.numPendingSets.peek()).toBe(0);
});

for (const asyncLoad of [false, true])
    test(`failed transformed roots compare successful normalization with the local snapshot (asyncLoad=${asyncLoad})`, async () => {
        const scale = (input: any, factor: number) =>
            Object.fromEntries(Object.entries(input).map(([key, row]: any) => [key, { value: row.value * factor }]));
        const requests: { params: any; resolve: () => void }[] = [];
        let push!: (params: any) => void;
        const errors: Error[] = [];
        const obs: any = observable(
            synced<any>({
                get: async () => ({ a: { value: 0 }, b: { value: 0 } }),
                set: (params) =>
                    new Promise<void>((resolve) => {
                        requests.push({ params, resolve });
                    }),
                transform: {
                    save: (value) => scale(value, 10),
                    load: asyncLoad ? async (value) => scale(value, 0.1) : (value) => scale(value, 0.1),
                },
                subscribe: (params) => {
                    push = params.update;
                },
                onError: (error) => errors.push(error),
            }),
        );
        obs.get();
        const state = syncState(obs);
        await when(state.isLoaded);
        obs.set({ a: { value: 1 }, b: { value: 1 } });
        await when(state.isSetting);
        expect(requests[0].params.value).toEqual({ a: { value: 10 }, b: { value: 10 } });
        obs.a.value.set(2);
        await promiseTimeout(0);
        expect(requests.length).toBe(2);
        requests[0].params.update({
            value: { b: { value: 3 } },
            changes: requests[0].params.changes,
            failedChanges: requests[0].params.changes,
        });
        requests[0].resolve();
        await promiseTimeout(0);
        await promiseTimeout(0);
        expect(obs.peek()).toEqual({ a: { value: 2 }, b: { value: 3 } });
        expect(state.isSetting.peek()).toBe(true);
        push({ value: { a: { value: 20 }, b: { value: 30 } }, mode: 'set' });
        await promiseTimeout(0);
        await promiseTimeout(0);
        expect(state.getPendingChanges()).toEqual({});
        requests[1].resolve();
        await when(() => !state.isSetting.get());
        expect(state.numPendingSets.peek()).toBe(0);
        expect(obs.peek()).toEqual({ a: { value: 2 }, b: { value: 3 } });
        expect(errors).toEqual([]);
    });

describe('pending root sibling acknowledgements', () => {
    const tick = () => promiseTimeout(0);
    const settle = async () => {
        await tick();
        await tick();
    };
    for (const map of [false, true])
        for (const renamed of [false, true])
            for (const newer of [false, true])
                test(`failed-root sibling ACK lifecycle map=${map} renamed=${renamed} newer=${newer}`, async () => {
                    const fromEntries = (entries: any[]) => (map ? new Map(entries) : Object.fromEntries(entries));
                    const entries = (x: any): any[] => (x instanceof Map ? [...x] : Object.entries(x));
                    const data = (a: number, b: number) =>
                        fromEntries([
                            ['a', { value: a }],
                            ['b', { value: b }],
                        ]);
                    const row = (x: any, key: string) => (x instanceof Map ? x.get(key) : x[key]);
                    const wire = (x: any, save: boolean) =>
                        (save ? Object.fromEntries : fromEntries)(
                            entries(x).map(([k, v]) => [
                                save ? 'wire_' + k : k.replace(/^wire_/, ''),
                                { value: v.value * (save ? 10 : 0.1) },
                            ]),
                        );
                    const requests: any[] = [];
                    let push!: (p: any) => void;
                    const errors: any[] = [];
                    const persist = new ObservablePersistLocalStorage();
                    const name = getPersistName();
                    const obs: any = observable(
                        synced<any>({
                            get: async () => (renamed ? wire(data(0, 0), true) : data(0, 0)),
                            set: (params) => new Promise<void>((resolve) => requests.push({ params, resolve })),
                            transform: renamed
                                ? { save: (x) => wire(x, true), load: (x) => wire(x, false) }
                                : undefined,
                            subscribe: (p) => {
                                push = p.update;
                            },
                            persist: { name, plugin: persist, retrySync: true },
                            onError: (e) => errors.push(String(e)),
                        }),
                    );
                    obs.get();
                    const state: any = syncState(obs);
                    await when(state.isLoaded);
                    await when(state.isPersistLoaded);
                    const child = (key: string) => (map ? obs.get(key) : obs[key]);
                    obs.set(data(1, 1));
                    await when(state.isSetting);
                    child('a').value.set(2);
                    await settle();
                    if (newer) {
                        child('b').value.set(2);
                        await settle();
                    }
                    requests[0].params.update({
                        value: fromEntries([['b', { value: 3 }]]),
                        changes: requests[0].params.changes,
                        failedChanges: requests[0].params.changes,
                    });
                    requests[0].resolve();
                    await settle();
                    const afterAck = {
                        data: cloneFixture(obs.peek()),
                        pending: cloneFixture(state.getPendingChanges()),
                        metadata: cloneFixture(persist.getMetadata(name)),
                    };
                    push({ value: renamed ? wire(data(0, 4), true) : data(0, 4), mode: 'set' });
                    await settle();
                    const afterB = cloneFixture(obs.peek());
                    requests[1].params.update({
                        value: fromEntries([['a', { value: 2 }]]),
                        changes: requests[1].params.changes,
                    });
                    requests[1].resolve();
                    await settle();
                    if (newer) {
                        requests[2].params.update({
                            value: fromEntries([['b', { value: 5 }]]),
                            changes: requests[2].params.changes,
                        });
                        requests[2].resolve();
                        await settle();
                    }
                    const finalB = newer ? 5 : 4;
                    push({ value: renamed ? wire(data(2, finalB), true) : data(2, finalB), mode: 'set' });
                    await settle();
                    expect(row(afterAck.data, 'b').value).toBe(newer ? 2 : 3);
                    expect(row(afterAck.pending[''].p, 'b').value).toBe(3);
                    expect(row(afterAck.metadata.pending[''].p, 'b').value).toBe(3);
                    expect(afterAck.pending['']).toBeDefined();
                    expect(row(afterB, 'a').value).toBe(2);
                    expect(row(afterB, 'b').value).toBe(newer ? 2 : 4);
                    expect(obs.peek()).toEqual(data(2, finalB));
                    expect(state.getPendingChanges()).toEqual({});
                    expect(persist.getMetadata(name).pending).toEqual({});
                    expect(persist.getTable(name, {})).toEqual(data(2, finalB));
                    expect(state.numPendingSets.peek()).toBe(0);
                    expect(state.isSetting.peek()).toBe(false);
                    expect(errors).toEqual([]);
                });
    for (const kind of ['prototype', 'accessor'])
        test(`ACK root introspection failure is atomic: ${kind}`, async () => {
            let armed = false,
                release!: () => void,
                params: any;
            const errors: any[] = [];
            let reads = 0;
            const value: any = { a: { value: 1 }, b: { value: 1 }, z: 0 };
            const initial: any = { a: { value: 0 }, b: { value: 0 }, z: 0 };
            if (kind === 'accessor')
                Object.defineProperty(initial, 'z', {
                    enumerable: true,
                    configurable: true,
                    get() {
                        if (armed && new Error().stack?.includes('acknowledgePendingRoot')) {
                            reads++;
                            throw Error('unsupported ACK baseline accessor');
                        }
                        return 0;
                    },
                });
            const input =
                kind === 'prototype'
                    ? new Proxy(value, {
                          getPrototypeOf(target) {
                              if (armed && new Error().stack?.includes('acknowledgePendingRoot')) {
                                  reads++;
                                  throw Error('unsupported prototype');
                              }
                              return Reflect.getPrototypeOf(target);
                          },
                      })
                    : value;
            const obs: any = observable(
                synced({
                    initial,
                    set: (p) =>
                        new Promise<void>((r) => {
                            params = p;
                            release = r;
                        }),
                    onError: (e) => errors.push(e),
                }),
            );
            obs.get();
            const state: any = syncState(obs);
            obs.set(input);
            await when(state.isSetting);
            const before = cloneFixture(state.getPendingChanges()[''].p);
            const history = cloneFixture(state.getPendingChanges()[''].h);
            armed = true;
            params.update({ value: { b: { value: 3 } }, changes: params.changes, failedChanges: params.changes });
            release();
            await tick();
            await tick();
            armed = false;
            expect(reads).toBeGreaterThan(0);
            expect(state.getPendingChanges()[''].p).toEqual(before);
            expect(state.getPendingChanges()[''].h).toEqual(history);
            expect(state.numPendingSets.peek()).toBe(0);
            expect(state.isSetting.peek()).toBe(false);
            expect(errors).toEqual([]);
        });

    test('unknown Map root history survives a partial sibling ACK at equal baseline', async () => {
        const marker = Symbol('unsupported history key');
        const data = (a: number, b: number) =>
            new Map<any, any>([
                ['a', { value: a }],
                ['b', { value: b }],
                [marker, 0],
            ]);
        let push!: (p: any) => void;
        const requests: any[] = [];
        const obs: any = observable(
            synced({
                get: () => data(0, 0),
                subscribe: (p) => {
                    push = p.update;
                },
                set: (params) => new Promise<void>((resolve) => requests.push({ params, resolve })),
            }),
        );
        obs.get();
        const state: any = syncState(obs);
        await when(state.isLoaded);
        obs.set(data(1, 1));
        await when(state.isSetting);
        obs.get('a').value.set(0);
        await tick();
        await tick();
        push({ value: data(0, 0), mode: 'set' });
        await tick();
        await tick();
        expect(state.getPendingChanges()[''].h).toBeUndefined();
        requests[0].params.update({
            value: new Map([['b', { value: 3 }]]),
            changes: requests[0].params.changes,
            failedChanges: requests[0].params.changes,
        });
        requests[0].resolve();
        await tick();
        await tick();
        expect(state.getPendingChanges()['']).toBeDefined();
        expect(state.getPendingChanges()[''].h).toBeUndefined();
        expect(state.getPendingChanges()[''].p).toEqual(obs.peek());
        requests[1].resolve();
        await tick();
        await tick();
        push({ value: data(0, 3), mode: 'set' });
        await tick();
        await tick();
        expect(state.getPendingChanges()).toEqual({});
        expect(state.numPendingSets.peek()).toBe(0);
    });

    test('ambiguous numeric and string Map failed paths decline root baseline rebase', async () => {
        const data = (n: number, s: number) =>
            new Map<any, any>([
                [1, { value: n }],
                ['1', { value: s }],
            ]);
        const requests: any[] = [];
        let push!: (p: any) => void;
        const obs: any = observable(
            synced({
                get: () => data(0, 0),
                subscribe: (p) => {
                    push = p.update;
                },
                set: (params) => new Promise<void>((resolve) => requests.push({ params, resolve })),
            }),
        );
        obs.get();
        const state: any = syncState(obs);
        await when(state.isLoaded);
        obs.set(data(1, 1));
        await when(state.isSetting);
        obs.get('1').value.set(2);
        await tick();
        await tick();
        const before = cloneFixture(state.getPendingChanges()[''].p);
        const history = cloneFixture(state.getPendingChanges()[''].h);
        requests[0].params.update({
            value: new Map([[1, { value: 3 }]]),
            changes: requests[0].params.changes,
            failedChanges: [
                ...requests[0].params.changes,
                {
                    path: ['1', 'value'],
                    pathStr: '1/value',
                    pathTypes: ['map', 'object'],
                    valueAtPath: 2,
                    prevAtPath: 1,
                },
            ],
        });
        requests[0].resolve();
        await tick();
        await tick();
        expect(state.getPendingChanges()[''].p).toEqual(before);
        expect(state.getPendingChanges()[''].h).toEqual(history);
        expect(state.numPendingSets.peek()).toBe(1);
        requests[1].resolve();
        await tick();
        await tick();
        push({ value: cloneFixture(obs.peek()), mode: 'set' });
        await tick();
        await tick();
        expect(state.getPendingChanges()).toEqual({});
        expect(state.numPendingSets.peek()).toBe(0);
    });
    for (const map of [false, true])
        test(`successful root ACK retains explicitly failed deletion map=${map}`, async () => {
            const make = (entries: any[]) => (map ? new Map(entries) : Object.fromEntries(entries));
            const initial = make([
                ['a', { value: 1 }],
                ['b', { value: 0 }],
            ]);
            let push!: (p: any) => void;
            const requests: any[] = [];
            const obs: any = observable(
                synced({
                    get: () => initial,
                    subscribe: (p) => {
                        push = p.update;
                    },
                    set: (params) => new Promise<void>((resolve) => requests.push({ params, resolve })),
                }),
            );
            obs.get();
            const state: any = syncState(obs);
            await when(state.isLoaded);
            obs.set(make([['b', { value: 1 }]]));
            await when(state.isSetting);
            (map ? obs.get('b') : obs.b).value.set(2);
            await settle();
            const sentRoot = {
                ...requests[0].params.changes[0],
                valueAtPath: cloneFixture(requests[0].params.value),
            };
            requests[0].params.update({
                changes: [sentRoot],
                failedChanges: [
                    {
                        path: ['a'],
                        pathStr: 'a',
                        pathTypes: [map ? 'map' : 'object'],
                        valueAtPath: undefined,
                        prevAtPath: { value: 1 },
                    },
                ],
            });
            requests[0].resolve();
            await settle();
            const p = state.getPendingChanges()[''].p;
            expect(map ? p.has('a') : Object.prototype.hasOwnProperty.call(p, 'a')).toBe(true);
            push({ value: initial, mode: 'set' });
            await settle();
            expect(map ? obs.peek().has('a') : Object.prototype.hasOwnProperty.call(obs.peek(), 'a')).toBe(false);
            expect((map ? obs.peek().get('b') : obs.peek().b).value).toBe(2);
            requests[1].resolve();
            await settle();
            push({ value: make([['b', { value: 2 }]]), mode: 'set' });
            await settle();
            expect(state.getPendingChanges()).toEqual({});
            expect(state.numPendingSets.peek()).toBe(0);
        });
});

describe('pending ASSIGN reconciliation', () => {
    const tick = () => promiseTimeout(0);

    for (const map of [false, true]) {
        const pack = (entries: [string, any][]) => (map ? new Map(entries) : Object.fromEntries(entries));
        const get = (value: any, key: string) => (map ? value.get(key) : value[key]);
        const setup = async (initial: any) => {
            let push!: (params: any) => void;
            const releases: (() => void)[] = [];
            const obs: any = observable(
                synced<any>({
                    get: async () => initial,
                    set: () => new Promise<void>((resolve) => releases.push(resolve)),
                    subscribe: (params) => {
                        push = params.update;
                    },
                }),
            );
            obs.get();
            await when(syncState(obs).isLoaded);
            const send = async (value: any) => {
                push({ value, mode: 'assign' });
                await tick();
            };
            const finish = async () => {
                push({ value: obs.peek(), mode: 'set' });
                await tick();
                for (let i = 0; i < 20 && syncState(obs).isSetting.peek(); i++) {
                    releases.splice(0).forEach((release) => release());
                    await tick();
                }
                expect(syncState(obs).getPendingChanges()).toEqual({});
                expect(syncState(obs).isSetting.peek()).toBe(false);
            };
            return { obs, send, finish };
        };
        test(`${map ? 'Map' : 'object'} partial ASSIGN preserves live edits and later server-only changes`, async () => {
            const { obs, send, finish } = await setup(
                pack([
                    ['a', { value: 0 }],
                    ['b', { value: 0 }],
                ]),
            );
            obs.set(
                pack([
                    ['a', { value: 1 }],
                    ['b', { value: 0 }],
                ]),
            );
            await tick();
            await send(pack([['c', { value: 1 }]]));
            await send(pack([['b', { value: 2 }]]));
            if (map) obs.get('a').value.set(2);
            else obs.a.value.set(2);
            await send(pack([['c', { value: 3 }]]));
            expect(get(obs.peek(), 'a')).toEqual({ value: 2 });
            expect(get(obs.peek(), 'b')).toEqual({ value: 2 });
            expect(get(obs.peek(), 'c')).toEqual({ value: 3 });
            expect(syncState(obs).getPendingChanges()!['']).toBeDefined();
            await finish();
        });
        test(`${map ? 'Map' : 'object'} own undefined baseline remains unowned across omitted ASSIGN deltas`, async () => {
            const { obs, send, finish } = await setup(
                pack([
                    ['a', 0],
                    ['b', undefined],
                ]),
            );
            obs.set(
                pack([
                    ['a', 1],
                    ['b', undefined],
                ]),
            );
            await tick();
            await send(pack([['c', 1]]));
            await send(pack([['b', 2]]));
            expect(get(obs.peek(), 'a')).toBe(1);
            expect(get(obs.peek(), 'b')).toBe(2);
            await finish();
        });
        for (const key of ['__proto__', 'constructor', '_']) {
            test(`${map ? 'Map' : 'object'} ASSIGN literal key ${key} and tombstone preserve the root`, async () => {
                const { obs, send, finish } = await setup(
                    pack([
                        ['a', 0],
                        [key, { value: 0 }],
                    ]),
                );
                obs.set(
                    pack([
                        ['a', 1],
                        [key, { value: 0 }],
                    ]),
                );
                await tick();
                await send(pack([[key, { value: 2 }]]));
                expect(get(obs.peek(), 'a')).toBe(1);
                expect(get(obs.peek(), key)).toEqual({ value: 2 });
                await send(pack([[key, symbolDelete]]));
                expect(map ? obs.peek().has(key) : Object.hasOwn(obs.peek(), key)).toBe(false);
                if (!map) expect(Object.getPrototypeOf(obs.peek())).toBe(Object.prototype);
                await finish();
            });
        }
    }

    test('Map ASSIGN uses observable setters and writes server-only changes to the persisted consumer', async () => {
        const stored = new Map<string, string>();
        const name = 'assign-delta-notification';
        const storage = {
            getItem: (key: string) => stored.get(key) ?? null,
            setItem: (key: string, value: string) => stored.set(key, value),
            removeItem: (key: string) => stored.delete(key),
        };
        let push!: (params: any) => void;
        let release!: () => void;
        const obs: any = observable(
            synced<any>({
                get: async () => new Map([['a', { value: 0 }]]),
                set: () =>
                    new Promise<void>((resolve) => {
                        release = resolve;
                    }),
                subscribe: (params) => {
                    push = params.update;
                },
                persist: { name, plugin: new ObservablePersistLocalStorageBase(storage as any), retrySync: true },
            }),
        );
        obs.get();
        await when(syncState(obs).isLoaded);
        obs.set(new Map([['a', { value: 1 }]]));
        await tick();
        let changes = 0;
        const off = obs.onChange(() => changes++);
        push({ value: new Map([['b', { value: 2 }]]), mode: 'assign' });
        for (let i = 0; i < 100 && !safeParse(stored.get(name) || '{}')?.get?.('b'); i++) await tick();
        expect(changes).toBeGreaterThan(0);
        expect(safeParse(stored.get(name)!).get('b')).toEqual({ value: 2 });
        expect(obs.peek().get('a')).toEqual({ value: 1 });
        push({ value: obs.peek(), mode: 'set' });
        await tick();
        release();
        await when(() => !syncState(obs).isSetting.get());
        off();
        expect(syncState(obs).getPendingChanges()).toEqual({});
    });

    test('typed Map ASSIGN keys remain distinct and preserve current insertion order', async () => {
        let push!: (params: any) => void;
        const releases: (() => void)[] = [];
        const initial = new Map<any, any>([
            ['authored', 0],
            [1, { value: 0 }],
            ['1', { value: 10 }],
        ]);
        const obs: any = observable(
            synced<any>({
                get: async () => initial,
                set: () => new Promise<void>((resolve) => releases.push(resolve)),
                subscribe: (p) => {
                    push = p.update;
                },
            }),
        );
        obs.get();
        const state = syncState(obs);
        await when(state.isLoaded);
        obs.set(
            new Map<any, any>([
                ['authored', 1],
                [1, { value: 0 }],
                ['1', { value: 10 }],
            ]),
        );
        await when(state.isSetting);
        try {
            const changed = { value: 2 };
            push({ value: new Map([[1, changed]]), mode: 'assign' });
            await tick();
            expect(obs.peek().get(1)).toEqual({ value: 2 });
            expect(obs.peek().get('1')).toEqual({ value: 10 });
            expect([...obs.peek().keys()]).toEqual(['authored', 1, '1']);
            changed.value = 99;
            expect(state.getPendingChanges()![''].p.get(1)).toEqual({ value: 2 });
            push({ value: new Map([['1', { value: 20 }]]), mode: 'assign' });
            await tick();
            expect(obs.peek().get(1)).toEqual({ value: 99 });
            expect(obs.peek().get('1')).toEqual({ value: 20 });
            push({ value: obs.peek(), mode: 'set' });
            await tick();
            expect(state.getPendingChanges()).toEqual({});
        } finally {
            releases.splice(0).forEach((resolve) => resolve());
        }
        await when(() => !state.isSetting.get());
    });

    for (const map of [false, true])
        test(`${map ? 'Map' : 'object'} local membership changes use complete reconciliation`, async () => {
            const pack = (entries: [string, any][]) => (map ? new Map(entries) : Object.fromEntries(entries));
            let push!: (p: any) => void;
            const releases: (() => void)[] = [];
            const initial = pack([
                ['a', 0],
                ['removed', { value: 0 }],
            ]);
            const obs: any = observable(
                synced<any>({
                    get: async () => initial,
                    set: () => new Promise<void>((resolve) => releases.push(resolve)),
                    subscribe: (p) => {
                        push = p.update;
                    },
                }),
            );
            obs.get();
            const state = syncState(obs);
            await when(state.isLoaded);
            obs.set(
                pack([
                    ['a', 1],
                    ['local', { value: 1 }],
                ]),
            );
            await when(state.isSetting);
            try {
                push({
                    value: pack([
                        ['removed', { value: 2 }],
                        ['server', { value: 2 }],
                    ]),
                    mode: 'assign',
                });
                await tick();
                expect(obs.peek()).toEqual(
                    pack([
                        ['a', 1],
                        ['local', { value: 1 }],
                        ['server', { value: 2 }],
                    ]),
                );
                push({ value: obs.peek(), mode: 'set' });
                await tick();
                expect(state.getPendingChanges()).toEqual({});
            } finally {
                releases.splice(0).forEach((resolve) => resolve());
            }
            await when(() => !state.isSetting.get());
        });

    test('reordered local Map keys retain the existing complete-path ordering', async () => {
        let push!: (p: any) => void;
        let release!: () => void;
        const obs: any = observable(
            synced<any>({
                get: async () =>
                    new Map([
                        ['a', 0],
                        ['b', 0],
                    ]),
                set: () =>
                    new Promise<void>((resolve) => {
                        release = resolve;
                    }),
                subscribe: (p) => {
                    push = p.update;
                },
            }),
        );
        obs.get();
        const state = syncState(obs);
        await when(state.isLoaded);
        obs.set(
            new Map([
                ['b', 0],
                ['a', 1],
            ]),
        );
        await when(state.isSetting);
        try {
            push({ value: new Map([['b', 2]]), mode: 'assign' });
            await tick();
            expect([...obs.peek().keys()]).toEqual(['a', 'b']);
            expect(obs.peek().get('a')).toBe(1);
            expect(obs.peek().get('b')).toBe(2);
            push({ value: obs.peek(), mode: 'set' });
            await tick();
            expect(state.getPendingChanges()).toEqual({});
        } finally {
            release();
        }
        await when(() => !state.isSetting.get());
    });

    test('ASSIGN reads an incoming root getter once', async () => {
        let push!: (p: any) => void;
        let release!: () => void;
        let reads = 0;
        const obs: any = observable(
            synced<any>({
                get: async () => ({ a: 0, b: { value: 0 } }),
                set: () =>
                    new Promise<void>((resolve) => {
                        release = resolve;
                    }),
                subscribe: (p) => {
                    push = p.update;
                },
            }),
        );
        obs.get();
        const state = syncState(obs);
        await when(state.isLoaded);
        obs.set({ a: 1, b: { value: 0 } });
        await when(state.isSetting);
        try {
            push({
                value: {
                    get b() {
                        reads++;
                        return { value: 2 };
                    },
                },
                mode: 'assign',
            });
            await tick();
            expect(reads).toBe(1);
            expect(obs.peek()).toEqual({ a: 1, b: { value: 2 } });
            push({ value: obs.peek(), mode: 'set' });
            await tick();
            expect(state.getPendingChanges()).toEqual({});
        } finally {
            release();
        }
        await when(() => !state.isSetting.get());
    });

    test('first ASSIGN detaches unchanged rows before later live child edits', async () => {
        let push!: (p: any) => void;
        const releases: (() => void)[] = [];
        const initial = { a: 0, b: { value: 0 } };
        const obs: any = observable(
            synced<any>({
                get: async () => initial,
                set: () => new Promise<void>((resolve) => releases.push(resolve)),
                subscribe: (p) => {
                    push = p.update;
                },
            }),
        );
        obs.get();
        const state = syncState(obs);
        await when(state.isLoaded);
        obs.set({ a: 1, b: initial.b });
        await when(state.isSetting);
        try {
            push({ value: { server: 1 }, mode: 'assign' });
            await tick();
            obs.b.value.set(5);
            await tick();
            expect(state.getPendingChanges()![''].p.b.value).toBe(0);
            push({ value: { b: { value: 2 } }, mode: 'assign' });
            await tick();
            expect(obs.peek()).toEqual({ a: 1, b: { value: 5 }, server: 1 });
            push({ value: obs.peek(), mode: 'set' });
            await tick();
            expect(state.getPendingChanges()).toEqual({});
        } finally {
            releases.splice(0).forEach((resolve) => resolve());
        }
        await when(() => !state.isSetting.get());
    });

    test('nested ASSIGN getter preserves the observed value and detached baseline', async () => {
        let push!: (p: any) => void;
        let release!: () => void;
        let reads = 0;
        const obs: any = observable(
            synced<any>({
                get: async () => ({ a: 0, b: { value: 0 } }),
                set: () =>
                    new Promise<void>((resolve) => {
                        release = resolve;
                    }),
                subscribe: (p) => {
                    push = p.update;
                },
            }),
        );
        obs.get();
        const state = syncState(obs);
        await when(state.isLoaded);
        obs.set({ a: 1, b: { value: 0 } });
        await when(state.isSetting);
        try {
            const row = {
                get value() {
                    reads++;
                    return 2;
                },
            };
            push({ value: { b: row }, mode: 'assign' });
            await tick();
            const readsAfterDelivery = reads;
            expect(state.getPendingChanges()![''].p.b.value).toBe(2);
            expect(obs.peek().a).toBe(1);
            expect(obs.peek().b.value).toBe(2);
            expect(readsAfterDelivery).toBeLessThanOrEqual(4);
            push({ value: { a: 1, b: { value: 2 } }, mode: 'set' });
            await tick();
            expect(state.getPendingChanges()).toEqual({});
        } finally {
            release();
        }
        await when(() => !state.isSetting.get());
    });

    for (const map of [false, true])
        for (const generation of [false, true])
            test(`${map ? 'Map' : 'object'} exact root ACK preserves overlapping ${generation ? 'cleared-generation' : 'child'} saves`, async () => {
                const pack = (value: number, server: number): any =>
                    map
                        ? new Map<any, any>([
                              ['a', { value }],
                              ['server', server],
                          ])
                        : { a: { value }, server };
                const store = new Map<string, string>();
                const name = `ack-${map}-${generation}`;
                const storage = {
                    getItem: (key: string) => store.get(key) ?? null,
                    setItem: (key: string, value: string) => store.set(key, value),
                    removeItem: (key: string) => store.delete(key),
                };
                let push!: (p: any) => void;
                let clear!: () => Promise<void>;
                const requests: { params: any; resolve: () => void }[] = [];
                const obs: any = observable(
                    synced<any>({
                        get: async () => pack(0, 0),
                        set: (params) => new Promise<void>((resolve) => requests.push({ params, resolve })),
                        subscribe: (p) => {
                            push = p.update;
                        },
                        onBeforeGet: (p) => {
                            clear = p.clearPendingChanges;
                        },
                        persist: {
                            name,
                            plugin: new ObservablePersistLocalStorageBase(storage as any),
                            retrySync: true,
                        },
                    }),
                );
                obs.get();
                const state = syncState(obs);
                await when(state.isLoaded);
                obs.set(pack(1, 0));
                await when(state.isSetting);
                try {
                    push({ value: map ? new Map([['server', 1]]) : { server: 1 }, mode: 'assign' });
                    await tick();
                    if (generation) await clear();
                    if (generation) obs.set(pack(2, 1));
                    else if (map) obs.get('a').value.set(2);
                    else obs.a.value.set(2);
                    await tick();
                    if (generation) {
                        push({ value: map ? new Map([['server', 2]]) : { server: 2 }, mode: 'assign' });
                        await tick();
                    } else expect(Object.keys(state.getPendingChanges()!).some((key) => key !== '')).toBe(true);
                    const server = generation ? 2 : 1;
                    push({ value: pack(2, server), mode: 'set' });
                    await tick();
                    expect(state.getPendingChanges()).toEqual({});
                    expect(safeParse(store.get(name + '__m')!).pending).toEqual({});
                    expect(state.isSetting.peek()).toBe(true);
                    if (map) obs.get('a').value.set(3);
                    else obs.a.value.set(3);
                    await tick();
                    requests[0].params.update({ value: pack(10, 0), changes: requests[0].params.changes });
                    requests[0].resolve();
                    await tick();
                    expect(map ? obs.peek().get('a').value : obs.peek().a.value).toBe(3);
                    expect(Object.keys(state.getPendingChanges()!).length).toBeGreaterThan(0);
                    push({ value: pack(3, server), mode: 'set' });
                    await tick();
                    expect(state.getPendingChanges()).toEqual({});
                } finally {
                    requests.forEach((request) => request.resolve());
                }
                await when(() => !state.isSetting.get());
                expect(state.numPendingSets.peek()).toBe(0);
                expect(state.error.peek()).toBeUndefined();
            });

    test('ASSIGN-proven exact ACK compares the original complete class domain', async () => {
        class Box {
            value = 1;
            toJSON() {
                return { value: 0 };
            }
        }
        let push!: (p: any) => void;
        let release!: () => void;
        const obs: any = observable(
            synced<any>({
                get: async () => ({ a: 0, box: { value: 0 }, server: 0 }),
                set: () =>
                    new Promise<void>((resolve) => {
                        release = resolve;
                    }),
                subscribe: (p) => {
                    push = p.update;
                },
            }),
        );
        obs.get();
        const state = syncState(obs);
        await when(state.isLoaded);
        obs.set({ a: 1, box: { value: 0 }, server: 0 });
        await when(state.isSetting);
        try {
            push({ value: { server: 1 }, mode: 'assign' });
            await tick();
            push({ value: { a: 1, box: new Box(), server: 1 }, mode: 'set' });
            await tick();
            expect(obs.peek().box.value).toBe(1);
            expect(Object.getPrototypeOf(obs.peek().box)).toBe(Box.prototype);
            expect(state.getPendingChanges()).toEqual({});
        } finally {
            release();
        }
        await when(() => !state.isSetting.get());
        expect(state.numPendingSets.peek()).toBe(0);
    });
});

describe('pending history after a cached remote merge', () => {
    const tick = () => promiseTimeout(0);
    for (const map of [false, true]) {
        test(`${map ? 'Map' : 'object'} newly authored history is honored after a cached remote merge`, async () => {
            const pack = (a: number, b: number, server: number) =>
                map
                    ? new Map([
                          ['a', a],
                          ['b', b],
                          ['server', server],
                      ])
                    : { a, b, server };
            let push!: (params: any) => void;
            const releases: (() => void)[] = [];
            const obs: any = observable(
                synced<any>({
                    get: async () => pack(0, 0, 0),
                    set: () => new Promise<void>((resolve) => releases.push(resolve)),
                    subscribe: (params) => {
                        push = params.update;
                    },
                }),
            );
            obs.get();
            await when(syncState(obs).isLoaded);
            obs.set(pack(1, 0, 0));
            await tick();
            obs.set(pack(0, 0, 0));
            await tick();
            push({ value: pack(1, 0, 1), mode: 'set' });
            await tick();
            expect(obs.peek()).toEqual(pack(0, 0, 1));
            const entry = syncState(obs).getPendingChanges()![''] as PendingChanges[string];
            const history = entry.h!;
            const lengthBefore = history.length;
            obs.set(pack(0, 1, 1));
            await tick();
            obs.set(pack(0, 0, 1));
            await tick();
            expect(entry.h).toBe(history);
            expect(history.length).toBeGreaterThan(lengthBefore);
            push({ value: pack(1, 1, 2), mode: 'set' });
            await tick();
            expect(obs.peek()).toEqual(pack(0, 0, 2));
            expect(syncState(obs).getPendingChanges()!['']).toBeDefined();
            push({ value: pack(0, 0, 2), mode: 'set' });
            await tick();
            for (let i = 0; i < 20 && syncState(obs).isSetting.peek(); i++) {
                releases.splice(0).forEach((release) => release());
                await tick();
            }
            expect(syncState(obs).getPendingChanges()).toEqual({});
            expect(syncState(obs).isSetting.peek()).toBe(false);
        });
    }
});

describe('remote load completion', () => {
    const tick = () => promiseTimeout(0);
    const settle = async () => {
        await tick();
        await tick();
    };
    for (const asyncGet of [false, true])
        test(`loaded waits for async transform completion asyncGet=${asyncGet}`, async () => {
            let finish!: (value: any) => void;
            const obs: any = observable(
                synced({
                    initial: { value: 0 },
                    get: () => (asyncGet ? Promise.resolve({ value: 2 }) : { value: 2 }),
                    transform: {
                        load: () =>
                            new Promise<any>((resolve) => {
                                finish = resolve;
                            }),
                    },
                }),
            );
            obs.get();
            const state = syncState(obs);
            await settle();
            expect(typeof finish).toBe('function');
            expect(state.isLoaded.peek()).toBe(false);
            expect(obs.peek()).toEqual({ value: 0 });
            finish({ value: 2 });
            await when(state.isLoaded);
            expect(obs.peek()).toEqual({ value: 2 });
            expect(state.numPendingGets.peek()).toBe(0);
            expect(state.isGetting.peek()).toBe(false);
            expect(state.error.peek()).toBeUndefined();
        });
    for (const asyncLoad of [false, true])
        test(`sync get reports transform rejection asyncLoad=${asyncLoad}`, async () => {
            const failure = Error('load failed');
            const errors: any[] = [];
            const obs: any = observable(
                synced({
                    initial: { value: 0 },
                    get: () => ({ value: 1 }),
                    transform: {
                        load: () => {
                            if (asyncLoad) return Promise.reject(failure);
                            throw failure;
                        },
                    },
                    onError: (error, params) => errors.push({ error, source: params.source }),
                }),
            );
            obs.get();
            const state = syncState(obs);
            await settle();
            expect(errors).toEqual([{ error: failure, source: 'get' }]);
            expect(state.error.peek()).toBe(failure);
            expect(state.isLoaded.peek()).toBe(false);
            expect(state.numPendingGets.peek()).toBe(0);
            expect(state.isGetting.peek()).toBe(false);
            expect(obs.peek()).toEqual({ value: 0 });
        });
    test('async load completion preserves stale get ordering', async () => {
        const requests: ((value: any) => void)[] = [];
        const obs: any = observable(
            synced({
                initial: { value: 0 },
                get: () => new Promise<any>((resolve) => requests.push(resolve)),
                transform: { load: async (x) => x },
            }),
        );
        const dispose = obs.onChange(() => {});
        obs.get();
        const state = syncState(obs);
        await settle();
        const syncing = state.sync();
        await settle();
        expect(requests).toHaveLength(2);
        requests[1]({ value: 2 });
        await syncing;
        await when(state.isLoaded);
        requests[0]({ value: 1 });
        await settle();
        expect(obs.peek()).toEqual({ value: 2 });
        expect(state.numPendingGets.peek()).toBe(0);
        expect(state.isGetting.peek()).toBe(false);
        dispose();
    });
    test('subscribe transform rejection uses its error callback', async () => {
        const failure = Error('subscribe load failed');
        let push!: (p: any) => void;
        const errors: any[] = [];
        const obs: any = observable(
            synced({
                initial: { value: 0 },
                subscribe: (p) => {
                    push = p.update;
                },
                transform: {
                    load: async () => {
                        throw failure;
                    },
                },
                onError: (error, params) => errors.push({ error, source: params.source }),
            }),
        );
        obs.get();
        const state = syncState(obs);
        push({ value: { value: 1 }, mode: 'set' });
        await settle();
        expect(errors).toEqual([{ error: failure, source: 'subscribe' }]);
        expect(state.error.peek()).toBe(failure);
        expect(obs.peek()).toEqual({ value: 0 });
    });
    for (const syncThrow of [false, true])
        test(`get rejection drains request counters syncThrow=${syncThrow}`, async () => {
            const failure = Error('get failed');
            const errors: any[] = [];
            const obs: any = observable(
                synced({
                    initial: { value: 0 },
                    get: () => {
                        if (syncThrow) throw failure;
                        return Promise.reject(failure);
                    },
                    onError: (e) => errors.push(e),
                }),
            );
            obs.get();
            const state = syncState(obs);
            await settle();
            expect(errors).toEqual([failure]);
            expect(state.numPendingGets.peek()).toBe(0);
            expect(state.isGetting.peek()).toBe(false);
            expect(state.isLoaded.peek()).toBe(false);
        });
    for (const rejected of [false, true])
        test(`older async transform cannot replace newer result rejected=${rejected}`, async () => {
            let call = 0,
                finishOld!: (x: any) => void,
                rejectOld!: (e: any) => void;
            const errors: any[] = [];
            const obs: any = observable(
                synced({
                    initial: { value: 0 },
                    get: () => ({ value: ++call }),
                    transform: {
                        load: (x) =>
                            x.value === 1
                                ? new Promise<any>((resolve, reject) => {
                                      finishOld = resolve;
                                      rejectOld = reject;
                                  })
                                : Promise.resolve(x),
                    },
                    onError: (e) => errors.push(e),
                }),
            );
            const dispose = obs.onChange(() => {});
            obs.get();
            const state = syncState(obs);
            await settle();
            expect(state.numPendingRemoteLoads.peek()).toBe(1);
            expect(state.isLoaded.peek()).toBe(false);
            await state.sync();
            await when(state.isLoaded);
            expect(obs.peek()).toEqual({ value: 2 });
            if (rejected) rejectOld(Error('stale load'));
            else finishOld({ value: 1 });
            await settle();
            expect(obs.peek()).toEqual({ value: 2 });
            expect(errors).toEqual([]);
            expect(state.error.peek()).toBeUndefined();
            expect(state.numPendingGets.peek()).toBe(0);
            expect(state.numPendingRemoteLoads.peek()).toBe(0);
            expect(state.isGetting.peek()).toBe(false);
            dispose();
        });
    for (const rejected of [false, true])
        test(`ignored older get cannot release a newer held transform rejected=${rejected}`, async () => {
            const requests: { resolve: (v: any) => void; reject: (e: any) => void }[] = [];
            let finish!: (x: any) => void;
            const errors: any[] = [];
            const obs: any = observable(
                synced({
                    initial: { value: 0 },
                    get: () => new Promise<any>((resolve, reject) => requests.push({ resolve, reject })),
                    transform: {
                        load: () =>
                            new Promise<any>((resolve) => {
                                finish = resolve;
                            }),
                    },
                    onError: (e) => errors.push(e),
                }),
            );
            const dispose = obs.onChange(() => {});
            obs.get();
            const state = syncState(obs);
            await settle();
            let didSync = false;
            const syncing = state.sync().then(() => (didSync = true));
            await settle();
            requests[1].resolve({ value: 2 });
            await settle();
            expect(didSync).toBe(false);
            expect(state.isLoaded.peek()).toBe(false);
            expect(state.numPendingRemoteLoads.peek()).toBe(1);
            if (rejected) requests[0].reject(Error('ignored old get'));
            else requests[0].resolve({ value: 1 });
            await settle();
            expect(state.isLoaded.peek()).toBe(false);
            expect(state.numPendingRemoteLoads.peek()).toBe(1);
            expect(state.isGetting.peek()).toBe(true);
            expect(errors).toEqual([]);
            expect(didSync).toBe(false);
            finish({ value: 2 });
            await syncing;
            await when(state.isLoaded);
            expect(obs.peek()).toEqual({ value: 2 });
            expect(state.numPendingGets.peek()).toBe(0);
            expect(state.numPendingRemoteLoads.peek()).toBe(0);
            dispose();
        });
    test('older transform completion cannot clear a newer load error', async () => {
        let call = 0,
            finishOld!: (x: any) => void;
        const failure = Error('latest load failed');
        const errors: any[] = [];
        const obs: any = observable(
            synced({
                initial: { value: 0 },
                get: () => ({ value: ++call }),
                transform: {
                    load: (x) =>
                        x.value === 1
                            ? new Promise<any>((resolve) => {
                                  finishOld = resolve;
                              })
                            : x.value === 2
                              ? Promise.reject(failure)
                              : Promise.resolve(x),
                },
                onError: (e) => errors.push(e),
            }),
        );
        const dispose = obs.onChange(() => {});
        obs.get();
        const state = syncState(obs);
        await settle();
        await state.sync();
        await settle();
        expect(state.error.peek()).toBe(failure);
        finishOld({ value: 1 });
        await settle();
        expect(state.error.peek()).toBe(failure);
        expect(state.isLoaded.peek()).toBe(false);
        expect(state.numPendingRemoteLoads.peek()).toBe(1);
        expect(obs.peek()).toEqual({ value: 0 });
        expect(errors).toEqual([failure]);
        await state.sync();
        await when(state.isLoaded);
        expect(obs.peek()).toEqual({ value: 3 });
        expect(state.error.peek()).toBeUndefined();
        expect(state.numPendingRemoteLoads.peek()).toBe(0);
        dispose();
    });
    for (const olderTransform of [false, true])
        test(`two sync owners release independent initial holds olderTransform=${olderTransform}`, async () => {
            let finishA!: (value: any) => void, finishB!: (value: any) => void, finishLoadA!: (value: any) => void;
            const obs: any = observable({ value: 0 });
            const dispose = obs.onChange(() => {});
            syncObservable(obs, {
                get: () =>
                    new Promise<any>((resolve) => {
                        finishA = resolve;
                    }),
                transform: olderTransform
                    ? {
                          load: () =>
                              new Promise<any>((resolve) => {
                                  finishLoadA = resolve;
                              }),
                      }
                    : undefined,
            });
            syncObservable(obs, {
                get: () =>
                    new Promise<any>((resolve) => {
                        finishB = resolve;
                    }),
            });
            obs.get();
            const state = syncState(obs);
            await settle();
            if (olderTransform) {
                finishA({ value: 1 });
                await settle();
            }
            finishB({ value: 2 });
            await settle();
            expect(state.isLoaded.peek()).toBe(false);
            expect(state.numPendingRemoteLoads.peek()).toBe(1);
            if (olderTransform) finishLoadA({ value: 1 });
            else finishA({ value: 1 });
            await when(state.isLoaded);
            expect(obs.peek()).toEqual({ value: 2 });
            expect(state.numPendingRemoteLoads.peek()).toBe(0);
            expect(state.numPendingGets.peek()).toBe(0);
            expect(state.isGetting.peek()).toBe(false);
            dispose();
        });
    test('newer get rejection wins over an older pending transform', async () => {
        let call = 0,
            finishOld!: (x: any) => void;
        const failure = Error('newer get failed');
        const errors: any[] = [];
        const obs: any = observable(
            synced({
                initial: { value: 0 },
                get: () => (++call === 1 ? { value: 1 } : Promise.reject(failure)),
                transform: {
                    load: () =>
                        new Promise<any>((resolve) => {
                            finishOld = resolve;
                        }),
                },
                onError: (e) => errors.push(e),
            }),
        );
        const dispose = obs.onChange(() => {});
        obs.get();
        const state = syncState(obs);
        await settle();
        await state.sync();
        await settle();
        expect(state.error.peek()).toBe(failure);
        finishOld({ value: 1 });
        await settle();
        expect(state.error.peek()).toBe(failure);
        expect(state.isLoaded.peek()).toBe(false);
        expect(state.numPendingRemoteLoads.peek()).toBe(1);
        expect(state.numPendingGets.peek()).toBe(0);
        expect(state.isGetting.peek()).toBe(false);
        expect(obs.peek()).toEqual({ value: 0 });
        expect(errors).toEqual([failure]);
        dispose();
    });
});

describe('durable persistence write order', () => {
    const tick = () => promiseTimeout(0);
    const settle = async () => {
        await tick();
        await tick();
    };
    class Persist {
        table: any;
        metadata: any = {};
        getTable() {
            return cloneFixture(this.table);
        }
        getMetadata() {
            return cloneFixture(this.metadata);
        }
        set(_name: string, changes: any[]) {
            this.table = cloneFixture(applyChanges(this.table, changes));
        }
        setMetadata(_name: string, m: any) {
            this.metadata = cloneFixture(m);
        }
        deleteTable() {}
        deleteMetadata() {}
    }
    for (const map of [false, true])
        test(`remote cache waits for its canonical metadata write map=${map}`, async () => {
            const data = (a: number, b: number) =>
                map
                    ? new Map([
                          ['a', { value: a }],
                          ['b', { value: b }],
                      ])
                    : { a: { value: a }, b: { value: b } };
            const row = (x: any, k: string) => (map ? x.get(k) : x[k]);
            let hold = false;
            let release!: (fail?: boolean) => void;
            class HeldMetadata extends Persist {
                override setMetadata(name: string, m: any) {
                    const captured = cloneFixture(m);
                    if (hold) {
                        hold = false;
                        return new Promise<void>(
                            (resolve, reject) =>
                                (release = (fail) => {
                                    if (fail) reject(Error('metadata unavailable'));
                                    else {
                                        super.setMetadata(name, captured);
                                        resolve();
                                    }
                                }),
                        );
                    }
                    return super.setMetadata(name, captured);
                }
            }
            const store = new HeldMetadata();
            store.table = data(1, 5);
            store.metadata = { pending: { '': { p: data(0, 5), v: data(1, 5), h: [['a', 'value']], t: [] } } };
            let push!: (p: any) => void;
            const requests: any[] = [];
            const obs: any = observable(
                synced({
                    get: () => data(0, 5),
                    subscribe: (p) => {
                        push = p.update;
                    },
                    persist: { name: 'order' + map, plugin: store, retrySync: true },
                    set: (p) => new Promise<void>((resolve) => requests.push({ p, resolve })),
                }),
            );
            obs.get();
            const state = syncState(obs);
            await when(state.isSetting);
            await settle();
            hold = true;
            push({ value: data(0, 6), mode: 'set' });
            await settle();
            expect(typeof release).toBe('function');
            const held = cloneFixture({ table: store.table, metadata: store.metadata });
            release();
            await settle();
            await settle();
            expect(row(held.metadata.pending[''].p, 'b').value).toBe(5);
            expect(row(held.table, 'b').value).toBe(5);
            expect(row(store.metadata.pending[''].p, 'b').value).toBe(6);
            expect(row(store.table, 'b').value).toBe(6);
            for (const request of requests) request.resolve();
            await settle();
            expect(state.numPendingSets.peek()).toBe(0);
        });
    test('remote cache writes keep their order across a held predecessor', async () => {
        let hold = false;
        const writes: any[] = [];
        class HeldCache extends Persist {
            override set(name: string, changes: any[]) {
                const captured = cloneFixture(changes);
                if (hold)
                    return new Promise<void>((resolve) =>
                        writes.push({
                            run: () => {
                                super.set(name, captured);
                                resolve();
                            },
                        }),
                    );
                return super.set(name, captured);
            }
        }
        const store = new HeldCache();
        store.table = { a: { value: 1 }, b: { value: 0 } };
        store.metadata = {
            pending: {
                '': {
                    p: { a: { value: 0 }, b: { value: 0 } },
                    v: { a: { value: 1 }, b: { value: 0 } },
                    h: [['a', 'value']],
                    t: [],
                },
            },
        };
        let push!: (p: any) => void;
        const requests: any[] = [];
        const obs: any = observable(
            synced({
                get: () => ({ a: { value: 0 }, b: { value: 0 } }),
                subscribe: (p) => {
                    push = p.update;
                },
                persist: { name: 'cache-order', plugin: store, retrySync: true },
                set: (p) => new Promise<void>((resolve) => requests.push({ p, resolve })),
            }),
        );
        obs.get();
        const state = syncState(obs);
        await when(state.isSetting);
        await settle();
        hold = true;
        push({ value: { a: { value: 0 }, b: { value: 1 } }, mode: 'set' });
        await settle();
        expect(writes.length).toBe(1);
        push({ value: { a: { value: 0 }, b: { value: 2 } }, mode: 'set' });
        await settle();
        const concurrent = writes.length;
        if (writes[1]) writes[1].run();
        writes[0].run();
        await settle();
        await settle();
        if (concurrent === 1) {
            expect(writes.length).toBe(2);
            writes[1].run();
            await settle();
        }
        for (const request of requests) request.resolve();
        await settle();
        expect(concurrent).toBe(1);
        expect(store.table.b.value).toBe(2);
        expect(state.numPendingSets.peek()).toBe(0);
    });
    test('rejected metadata predecessor drains and a fresh update can persist', async () => {
        let hold = false;
        let rejectMetadata!: () => void;
        const errors: any[] = [];
        class RejectedMetadata extends Persist {
            override setMetadata(name: string, m: any) {
                const captured = cloneFixture(m);
                if (hold) {
                    hold = false;
                    return new Promise<void>(
                        (_resolve, reject) => (rejectMetadata = () => reject(Error('metadata unavailable'))),
                    );
                }
                return super.setMetadata(name, captured);
            }
        }
        const store = new RejectedMetadata();
        store.table = { a: { value: 1 }, b: { value: 0 } };
        store.metadata = {
            pending: {
                '': {
                    p: { a: { value: 0 }, b: { value: 0 } },
                    v: { a: { value: 1 }, b: { value: 0 } },
                    h: [['a', 'value']],
                    t: [],
                },
            },
        };
        let push!: (p: any) => void;
        const requests: any[] = [];
        const obs: any = observable(
            synced({
                get: () => ({ a: { value: 0 }, b: { value: 0 } }),
                subscribe: (p) => {
                    push = p.update;
                },
                onError: (error, params) => {
                    errors.push({ error, source: params.source });
                },
                persist: { name: 'cache-rejection', plugin: store, retrySync: true },
                set: (p) => new Promise<void>((resolve) => requests.push({ p, resolve })),
            }),
        );
        obs.get();
        const state = syncState(obs);
        await when(state.isSetting);
        await settle();
        hold = true;
        push({ value: { a: { value: 0 }, b: { value: 1 } }, mode: 'set' });
        await settle();
        rejectMetadata();
        await settle();
        await settle();
        expect(errors.some((x) => x.error.message === 'metadata unavailable')).toBe(true);
        push({ value: { a: { value: 0 }, b: { value: 2 } }, mode: 'set' });
        await settle();
        await settle();
        expect(store.metadata.pending[''].p.b.value).toBe(2);
        expect(store.table.b.value).toBe(2);
        for (const request of requests) request.resolve();
        await settle();
        expect(state.numPendingSets.peek()).toBe(0);
        expect(state.numPendingGets.peek()).toBe(0);
        expect(state.isGetting.peek()).toBe(false);
    });
    test('failed cache write prevents dependent ACK metadata clearing and later local save recovers', async () => {
        let hold = false;
        let failCache!: () => void;
        const errors: any[] = [];
        class RejectedCache extends Persist {
            override set(name: string, changes: any[]) {
                if (hold) {
                    hold = false;
                    return new Promise<void>(
                        (_resolve, reject) => (failCache = () => reject(Error('cache unavailable'))),
                    );
                }
                return super.set(name, changes);
            }
        }
        const store = new RejectedCache();
        store.table = { a: { value: 1 }, b: { value: 0 } };
        store.metadata = {
            pending: {
                '': {
                    p: { a: { value: 0 }, b: { value: 0 } },
                    v: { a: { value: 1 }, b: { value: 0 } },
                    h: [['a', 'value']],
                    t: [],
                },
            },
        };
        let push!: (p: any) => void;
        const requests: any[] = [];
        const obs: any = observable(
            synced({
                get: () => ({ a: { value: 0 }, b: { value: 0 } }),
                subscribe: (p) => {
                    push = p.update;
                },
                onError: (error, params) => errors.push({ error, source: params.source }),
                persist: { name: 'cache-failure', plugin: store, retrySync: true },
                set: (p) => new Promise<void>((resolve) => requests.push({ p, resolve })),
            }),
        );
        obs.get();
        const state = syncState(obs);
        await when(state.isSetting);
        await settle();
        hold = true;
        push({ value: { a: { value: 0 }, b: { value: 1 } }, mode: 'set' });
        await settle();
        requests[0].p.update({ value: undefined, changes: requests[0].p.changes });
        requests[0].resolve();
        await settle();
        failCache();
        await settle();
        await settle();
        expect(errors.some((x) => x.error.message === 'cache unavailable')).toBe(true);
        expect(Object.keys(store.metadata.pending || {}).length).toBeGreaterThan(0);
        expect(state.numPendingSets.peek()).toBe(0);
        obs.a.value.set(2);
        await settle();
        await settle();
        expect(store.table.a.value).toBe(2);
        expect(Object.keys(store.metadata.pending || {}).length).toBeGreaterThan(0);
        for (const request of requests.slice(1)) request.resolve();
        await settle();
        expect(state.numPendingSets.peek()).toBe(0);
    });
    test('failed A cache followed by a fresh B save retains uncached A across restart', async () => {
        let hold = false;
        let failCache!: () => void;
        const errors: any[] = [];
        class RejectedCache extends Persist {
            override set(name: string, changes: any[]) {
                if (hold) {
                    hold = false;
                    return new Promise<void>(
                        (_resolve, reject) => (failCache = () => reject(Error('cache unavailable'))),
                    );
                }
                return super.set(name, changes);
            }
        }
        const store = new RejectedCache();
        store.table = { a: 0, b: 0 };
        let server: any = { a: 0, b: 0 };
        const sent: any[] = [];
        const obs: any = observable(
            synced({
                get: () => cloneFixture(server),
                onError: (error) => {
                    errors.push(error);
                },
                persist: { name: 'fresh-B', plugin: store, retrySync: true },
                set: (p) => {
                    sent.push(cloneFixture(p.changes));
                    server = applyChanges(server, p.changes);
                    p.update({ value: undefined, changes: p.changes });
                },
            }),
        );
        obs.get();
        const state = syncState(obs);
        await when(state.isLoaded);
        await settle();
        hold = true;
        obs.a.set(1);
        await settle();
        expect(typeof failCache).toBe('function');
        failCache();
        await settle();
        await settle();
        expect(errors.some((error) => error.message === 'cache unavailable')).toBe(true);
        expect(sent).toHaveLength(0);
        obs.b.set(1);
        await settle();
        await settle();
        expect(server).toEqual({ a: 0, b: 1 });
        expect(store.table).toEqual({ a: 0, b: 1 });
        expect(store.metadata.pending.a.v).toBe(1);
        const fresh = new Persist();
        fresh.table = cloneFixture(store.table);
        fresh.metadata = cloneFixture(store.metadata);
        let release!: () => void;
        const restored: any = observable(
            synced({
                get: async () => undefined,
                persist: { name: 'fresh-B-restored', plugin: fresh, retrySync: true },
                set: (p) =>
                    new Promise<void>((resolve) => {
                        server = applyChanges(server, p.changes);
                        release = resolve;
                    }),
            }),
        );
        restored.get();
        const next = syncState(restored);
        await when(next.isSetting);
        await settle();
        expect(server).toEqual({ a: 1, b: 1 });
        expect(fresh.metadata.pending.a.v).toBe(1);
        expect(next.getPendingChanges()!.a.v).toBe(1);
        expect(state.numPendingSets.peek()).toBe(0);
        release();
        await settle();
        expect(next.numPendingSets.peek()).toBe(0);
    });
});
for (const equal of [false, true]) {
    test(`array history preserves baseline getter reads for ${equal ? 'equal' : 'changed'} rows`, async () => {
        let push!: (params: any) => void;
        const requests: (() => void)[] = [];
        const obs: any = observable([{ id: 'a', value: 0 }]);
        syncObservable(obs, {
            fieldId: 'id',
            get: async () => [{ id: 'a', value: 0 }],
            set: () => new Promise<void>((resolve) => requests.push(resolve)),
            subscribe: (params) => {
                push = params.update;
            },
        });
        obs.get();
        await promiseTimeout(0);
        obs.set([{ id: 'a', value: 1 }]);
        await promiseTimeout(0);
        expect(requests).toHaveLength(1);
        if (equal) {
            push({ value: [{ id: 'a', value: 1 }], mode: 'append' });
            await promiseTimeout(0);
        }
        const entry = (syncState(obs).getPendingChanges() as PendingChanges)[''];
        let reads = 0;
        entry.p = equal
            ? [
                  {
                      get id() {
                          reads++;
                          return 'a';
                      },
                      value: 1,
                  },
              ]
            : [
                  {
                      id: 'a',
                      get value() {
                          reads++;
                          return 0;
                      },
                  },
              ];
        push({ value: obs.peek(), mode: 'set' });
        await promiseTimeout(0);
        expect(reads).toBe(equal ? 1 : 3);
        expect(obs.peek()).toEqual([{ id: 'a', value: 1 }]);
        expect(syncState(obs).getPendingChanges()).toEqual({});
        expect(syncState(obs).error.peek()).toBeUndefined();
        for (const resolve of requests) resolve();
        await promiseTimeout(0);
    });
}
describe('save counters after resetting sync state', () => {
    for (const reset of [false, true])
        for (const rejectOld of [false, true])
            for (const oldFirst of [false, true])
                test(`${reset ? 'reset' : 'clearPendingChanges'} preserves request counts: old ${rejectOld ? 'failure' : 'success'}, oldFirst=${oldFirst}`, async () => {
                    const requests: { resolve: () => void; reject: (error: Error) => void }[] = [];
                    let clear!: () => Promise<void>;
                    const obs = observable({ value: 0 });
                    const state = syncObservable(obs, {
                        initial: { value: 0 },
                        get: async () => ({ value: 0 }),
                        set: () => new Promise<void>((resolve, reject) => requests.push({ resolve, reject })),
                        onBeforeGet: (params) => {
                            clear = params.clearPendingChanges;
                        },
                        onError: () => {},
                    });
                    obs.get();
                    await when(state.isLoaded);
                    obs.value.set(1);
                    await promiseTimeout(0);
                    expect(requests).toHaveLength(1);
                    expect(state.numPendingSets.peek()).toBe(1);
                    if (reset) {
                        await state.reset();
                        obs.get();
                        await when(state.isLoaded);
                    } else await clear();
                    obs.value.set(2);
                    await promiseTimeout(0);
                    expect(requests).toHaveLength(2);
                    const observed: { count: number | undefined; setting: boolean | undefined }[] = [];
                    const record = () =>
                        observed.push({ count: state.numPendingSets.peek(), setting: state.isSetting.peek() });
                    record();
                    const finishOld = () =>
                        rejectOld ? requests[0].reject(Error('old request failed')) : requests[0].resolve();
                    try {
                        if (oldFirst) finishOld();
                        else requests[1].resolve();
                        await promiseTimeout(0);
                        record();
                        if (oldFirst) requests[1].resolve();
                        else finishOld();
                        await promiseTimeout(0);
                        record();
                        expect(observed).toEqual(
                            reset
                                ? [
                                      { count: 1, setting: true },
                                      { count: oldFirst ? 1 : 0, setting: oldFirst },
                                      { count: 0, setting: false },
                                  ]
                                : [
                                      { count: 2, setting: true },
                                      { count: 1, setting: true },
                                      { count: 0, setting: false },
                                  ],
                        );
                        expect(obs.peek()).toEqual({ value: 2 });
                        expect(state.getPendingChanges()).toEqual({});
                    } finally {
                        for (const request of requests) request.resolve();
                    }
                });
});
for (const field of ['numPendingSets', 'isSetting'] as const)
    for (const starting of [false, true])
        test(`reset from ${field} listener during ${starting ? 'start' : 'completion'} preserves counters`, async () => {
            const requests: (() => void)[] = [];
            const obs = observable({ value: 0 });
            const state = syncObservable(obs, {
                initial: { value: 0 },
                get: async () => ({ value: 0 }),
                set: () => new Promise<void>((resolve) => requests.push(resolve)),
            });
            obs.get();
            await when(state.isLoaded);
            let armed = true;
            let resetting: Promise<void> | undefined;
            const dispose = state[field].onChange(({ value }) => {
                if (armed && value === (field === 'numPendingSets' ? Number(starting) : starting)) {
                    armed = false;
                    resetting = state.reset();
                }
            });
            try {
                obs.value.set(1);
                await promiseTimeout(0);
                expect(requests).toHaveLength(1);
                if (!starting) {
                    requests[0]();
                    await promiseTimeout(0);
                }
                expect(resetting).toBeDefined();
                await resetting;
                expect(state.numPendingSets.peek()).toBe(0);
                expect(state.isSetting.peek()).toBe(false);
                if (starting) {
                    requests[0]();
                    await promiseTimeout(0);
                    expect(state.numPendingSets.peek()).toBe(0);
                    expect(state.isSetting.peek()).toBe(false);
                }
                obs.get();
                await when(state.isLoaded);
                obs.value.set(2);
                await promiseTimeout(0);
                expect(requests).toHaveLength(2);
                expect(state.numPendingSets.peek()).toBe(1);
                expect(state.isSetting.peek()).toBe(true);
                requests[1]();
                await promiseTimeout(0);
                expect(state.numPendingSets.peek()).toBe(0);
                expect(state.isSetting.peek()).toBe(false);
            } finally {
                dispose();
                for (const resolve of requests) resolve();
            }
        });
describe('persistence preparation reservations', () => {
    test('held older persistence transform cannot overwrite a newer write', async () => {
        const tick = () => new Promise<any>((resolve) => setTimeout(resolve, 5));
        let release: (() => void) | undefined;
        let hold = true;
        let server = { a: 0 };
        const writes: any[] = [];
        class Persist {
            table = { a: 0 };
            metadata: any = {};
            getTable(): any {
                return cloneFixture(this.table);
            }
            getMetadata() {
                return cloneFixture(this.metadata);
            }
            set(_name: string, changes: any[]) {
                this.table = applyChanges(this.table, changes);
                writes.push(cloneFixture(this.table));
            }
            setMetadata(_name: string, value: any) {
                this.metadata = cloneFixture(value);
            }
            deleteTable() {}
            deleteMetadata() {}
        }
        const store = new Persist();
        const obs = observable(
            synced({
                get: () => ({ a: 0 }),
                persist: {
                    name: 'held-transform',
                    plugin: store,
                    retrySync: true,
                    transform: {
                        save: (value) => {
                            if (hold) {
                                hold = false;
                                return new Promise<any>((resolve) => {
                                    release = () => resolve(value);
                                });
                            }
                            return value;
                        },
                    },
                },
                set: (p) => {
                    server = applyChanges(server, p.changes);
                },
            }),
        );
        obs.get();
        await when(syncState(obs).isLoaded);
        obs.a.set(1);
        await tick();
        expect(typeof release).toBe('function');
        obs.a.set(2);
        await tick();
        release!();
        await tick();
        await tick();
        expect(store.table).toEqual({ a: 2 });
        expect(server).toEqual({ a: 2 });
        expect(obs.peek()).toEqual({ a: 2 });
    });
    const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));
    const settle = async () => {
        await tick();
        await tick();
    };

    class Persist {
        table: any = { a: 0, b: 0 };
        metadata: any = {};
        getTable() {
            return cloneFixture(this.table);
        }
        getMetadata() {
            return cloneFixture(this.metadata);
        }
        set(_name: string, changes: any[]) {
            this.table = applyChanges(this.table, changes);
        }
        setMetadata(_name: string, value: any) {
            this.metadata = cloneFixture(value);
        }
        deleteTable() {}
        deleteMetadata() {}
    }

    test('a held persistence transform does not block another sync owner', async () => {
        let release!: () => void;
        let held = true;
        const first = new Persist();
        const second = new Persist();
        const firstObs = observable(
            synced({
                initial: { a: 0, b: 0 },
                persist: {
                    name: 'first-held-transform',
                    plugin: first,
                    transform: {
                        save: (value) =>
                            held
                                ? ((held = false),
                                  new Promise<any>((resolve) => {
                                      release = () => resolve(value);
                                  }))
                                : value,
                    },
                },
            }),
        );
        const secondObs = observable(
            synced({ initial: { a: 0, b: 0 }, persist: { name: 'second-independent', plugin: second } }),
        );
        firstObs.get();
        secondObs.get();
        await when(syncState(firstObs).isPersistLoaded);
        await when(syncState(secondObs).isPersistLoaded);
        firstObs.a.set(1);
        await tick();
        secondObs.a.set(2);
        await settle();
        expect(second.table.a).toBe(2);
        expect(first.table.a).toBe(0);
        release();
        await settle();
        expect(first.table.a).toBe(1);
    });

    test('transport change readiness and ACK metadata follow the reserved cache unit', async () => {
        let releaseFirst!: () => void;
        let releaseSecond!: () => void;
        let call = 0;
        const requests: any[] = [];
        class HeldCache extends Persist {
            override set(name: string, changes: any[]) {
                const captured = cloneFixture(changes);
                return new Promise<void>((resolve) => {
                    const finish = () => {
                        super.set(name, captured);
                        resolve();
                    };
                    if (++call === 1) releaseFirst = finish;
                    else if (call === 2) releaseSecond = finish;
                    else finish();
                });
            }
        }
        const store = new HeldCache();
        const errors: any[] = [];
        const obs = observable(
            synced({
                initial: { a: 0, b: 0 },
                persist: { name: 'ready-cache-ack', plugin: store, retrySync: true },
                set: (params) => {
                    requests.push({ changes: cloneFixture(params.changes), value: cloneFixture(params.value) });
                    params.update({ value: params.value, changes: params.changes });
                },
                onError: (error) => errors.push(error),
            }),
        );
        obs.get();
        const state = syncState(obs);
        await when(state.isPersistLoaded);
        obs.a.set(1);
        await settle();
        expect(typeof releaseFirst).toBe('function');
        obs.b.set(2);
        await settle();
        expect(requests).toHaveLength(0);
        releaseFirst();
        await settle();
        expect(typeof releaseSecond).toBe('function');
        expect(store.table).toEqual({ a: 1, b: 0 });
        expect(requests).toHaveLength(1);
        expect(requests[0].changes.map((change: any) => change.path)).toEqual([['a']]);
        // Latest-root value is intentional; only ready change records are gated.
        expect(requests[0].value).toEqual({ a: 1, b: 2 });
        expect(store.metadata.pending.b.v).toBe(2);
        expect(Object.keys(store.metadata.pending)).not.toHaveLength(0);
        releaseSecond();
        await settle();
        await when(() => !state.isSetting.get());
        expect(store.table).toEqual({ a: 1, b: 2 });
        expect(requests).toHaveLength(2);
        expect(requests[1].changes.map((change: any) => change.path)).toEqual([['b']]);
        expect(state.getPendingChanges()).toEqual({});
        expect(store.metadata.pending).toEqual({});
        expect(errors).toEqual([]);
    });

    test('a rejected preparation releases reservations and permits a later fresh write', async () => {
        let reject!: (error: Error) => void;
        let held = true;
        const store = new Persist();
        const errors: any[] = [];
        const sends: any[] = [];
        const obs = observable(
            synced({
                initial: { a: 0, b: 0 },
                persist: {
                    name: 'rejected-preparation',
                    plugin: store,
                    retrySync: true,
                    transform: {
                        save: (value) =>
                            held
                                ? ((held = false),
                                  new Promise<any>((_resolve, rejectValue) => {
                                      reject = rejectValue;
                                  }))
                                : value,
                    },
                },
                set: (params) => {
                    sends.push(cloneFixture(params.changes));
                    params.update({ value: params.value, changes: params.changes });
                },
                onError: (error) => errors.push(error),
            }),
        );
        obs.get();
        const state = syncState(obs);
        await when(state.isPersistLoaded);
        obs.a.set(1);
        await tick();
        obs.a.set(2);
        await tick();
        reject(Error('persist transform unavailable'));
        await settle();
        expect(errors.map((error) => error.message)).toEqual(['persist transform unavailable']);
        expect(store.table.a).toBe(2);
        expect(sends).toHaveLength(1);
        expect(state.getPendingChanges()).toEqual({});
        obs.a.set(3);
        await settle();
        expect(store.table.a).toBe(3);
        expect(sends).toHaveLength(2);
        expect(state.getPendingChanges()).toEqual({});
    });
});

describe('same-batch preparation owner isolation', () => {
    for (const domain of ['persist', 'remote'] as const) {
        for (const rejected of [false, true]) {
            test(`${domain} transform ${rejected ? 'rejected' : 'held'} does not misattribute failure to a healthy owner`, async () => {
                const tick = () => promiseTimeout(5);
                const failure = Error('only first owner preparation failed');
                const errorsA: any[] = [];
                const errorsB: any[] = [];
                const sentA: any[] = [];
                const sentB: any[] = [];
                let release!: () => void;
                let first = true;
                const transform = {
                    save: (value: any) => {
                        if (!first) return value;
                        first = false;
                        if (rejected) return Promise.reject(failure);
                        return new Promise<any>((resolve) => {
                            release = () => resolve(value);
                        });
                    },
                };
                class Persist {
                    table: any = { a: 0 };
                    metadata: any = {};
                    getTable() {
                        return cloneFixture(this.table);
                    }
                    getMetadata() {
                        return cloneFixture(this.metadata);
                    }
                    set(_name: string, changes: any[]) {
                        this.table = applyChanges(this.table, changes);
                    }
                    setMetadata(_name: string, value: any) {
                        this.metadata = cloneFixture(value);
                    }
                    deleteTable() {}
                    deleteMetadata() {}
                }
                const storeA = new Persist();
                const storeB = new Persist();
                const make = (store: Persist, sends: any[], errors: any[], bad: boolean) =>
                    observable(
                        synced({
                            initial: { a: 0 },
                            persist: {
                                name: getPersistName(),
                                plugin: store,
                                retrySync: true,
                                transform: bad && domain === 'persist' ? transform : undefined,
                            },
                            transform: bad && domain === 'remote' ? transform : undefined,
                            set: (params) => {
                                sends.push(cloneFixture(params.value));
                                params.update({ value: params.value, changes: params.changes });
                            },
                            onError: (error) => errors.push(error),
                        }),
                    );
                const a = make(storeA, sentA, errorsA, true);
                const b = make(storeB, sentB, errorsB, false);
                a.get();
                b.get();
                await when(syncState(a).isPersistLoaded);
                await when(syncState(b).isPersistLoaded);
                batch(() => {
                    a.a.set(1);
                    b.a.set(2);
                });
                await tick();
                await tick();
                if (!rejected) {
                    expect(typeof release).toBe('function');
                    expect(errorsB).toEqual([]);
                    release();
                }
                await tick();
                await tick();
                expect(errorsB).toEqual([]);
                expect(storeB.table).toEqual({ a: 2 });
                expect(sentB).toEqual([{ a: 2 }]);
                expect(syncState(b).getPendingChanges()).toEqual({});
                if (rejected) {
                    expect(errorsA).toEqual([failure]);
                    expect(sentA).toEqual([]);
                } else {
                    expect(errorsA).toEqual([]);
                    expect(storeA.table).toEqual({ a: 1 });
                    expect(sentA).toEqual([{ a: 1 }]);
                }
            });
        }
    }
});
describe('metadata write rejection owners', () => {
    const settle = async () => {
        await promiseTimeout(5);
        await promiseTimeout(5);
    };
    class Persist {
        table: any = { a: 0 };
        metadata: any = { lastSync: 0 };
        failure = Error('metadata storage unavailable');
        failNext = false;
        writes: any[] = [];
        getTable(): any {
            return cloneFixture(this.table);
        }
        getMetadata(): any {
            return cloneFixture(this.metadata);
        }
        set(_name: string, changes: any[]) {
            this.table = applyChanges(this.table, changes);
        }
        async setMetadata(_name: string, value: any) {
            this.writes.push(cloneFixture(value));
            if (this.failNext) {
                this.failNext = false;
                throw this.failure;
            }
            this.metadata = cloneFixture(value);
        }
        deleteTable() {}
        deleteMetadata() {}
    }
    test('direct lastSync metadata rejection reports to the local set owner and recovers', async () => {
        const store = new Persist();
        const errors: any[] = [];
        const obs = observable(
            synced({
                initial: { a: 0 },
                persist: { name: getPersistName(), plugin: store },
                onError: (error, params) => errors.push({ error, source: params.source, type: params.type }),
            }),
        );
        obs.get();
        const state = syncState(obs);
        await when(state.isPersistLoaded);
        store.failNext = true;
        state.lastSync.set(1);
        await settle();
        expect(errors).toEqual([{ error: store.failure, source: 'set', type: 'set' }]);
        expect(state.error.peek()).toBe(store.failure);
        expect(store.metadata.lastSync).toBe(0);
        state.lastSync.set(2);
        await settle();
        expect(store.metadata.lastSync).toBe(2);
        expect(errors).toHaveLength(1);
        expect(state.numPendingGets.peek()).toBe(0);
        expect(state.numPendingSets.peek()).toBe(0);
    });
    test('get lastSync timer metadata rejection reports to the get owner and recovers', async () => {
        const store = new Persist();
        const errors: any[] = [];
        let version = 0;
        const obs = observable(
            synced({
                initial: { a: 0 },
                persist: { name: getPersistName(), plugin: store },
                get: (params) => {
                    if (version) params.updateLastSync(version);
                    return { a: version };
                },
                onError: (error, params) => errors.push({ error, source: params.source, type: params.type }),
            }),
        );
        const dispose = obs.onChange(() => {});
        obs.get();
        const state = syncState(obs);
        await when(state.isLoaded);
        await settle();
        store.failNext = true;
        version = 1;
        await state.sync();
        await settle();
        expect(errors).toEqual([{ error: store.failure, source: 'get', type: 'get' }]);
        expect(state.error.peek()).toBe(store.failure);
        expect(store.metadata.lastSync).toBe(0);
        version = 2;
        await state.sync();
        await settle();
        expect(store.metadata.lastSync).toBe(2);
        expect(state.error.peek()).toBeUndefined();
        expect(errors).toHaveLength(1);
        expect(state.numPendingGets.peek()).toBe(0);
        expect(state.isGetting.peek()).toBe(false);
        dispose();
    });
    test('subscribe lastSync timer metadata rejection reports to the subscribe owner and recovers', async () => {
        const store = new Persist();
        const errors: any[] = [];
        let push!: (params: any) => void;
        const obs = observable(
            synced({
                initial: { a: 0 },
                persist: { name: getPersistName(), plugin: store },
                subscribe: (params) => {
                    push = params.update;
                },
                onError: (error, params) => errors.push({ error, source: params.source, type: params.type }),
            }),
        );
        obs.get();
        const state = syncState(obs);
        await when(state.isPersistLoaded);
        await settle();
        store.failNext = true;
        push({ value: { a: 1 }, lastSync: 1, mode: 'set' });
        await settle();
        expect(errors).toEqual([{ error: store.failure, source: 'subscribe', type: 'get' }]);
        expect(state.error.peek()).toBe(store.failure);
        expect(store.metadata.lastSync).toBe(0);
        push({ value: { a: 2 }, lastSync: 2, mode: 'set' });
        await settle();
        expect(store.metadata.lastSync).toBe(2);
        expect(errors).toHaveLength(1);
        expect(state.numPendingGets.peek()).toBe(0);
        expect(state.numPendingSets.peek()).toBe(0);
    });
    test('successful set ACK metadata rejection already reports to its set owner and drains', async () => {
        const store = new Persist();
        const errors: any[] = [];
        const sent: any[] = [];
        let failAck = true;
        const obs = observable(
            synced({
                initial: { a: 0 },
                persist: { name: getPersistName(), plugin: store, retrySync: true },
                set: (params) => {
                    sent.push(cloneFixture(params.value));
                    if (failAck) {
                        failAck = false;
                        store.failNext = true;
                    }
                    params.update({ value: params.value, changes: params.changes });
                },
                onError: (error, params) => errors.push({ error, source: params.source, type: params.type }),
            }),
        );
        obs.get();
        const state = syncState(obs);
        await when(state.isPersistLoaded);
        obs.a.set(1);
        await settle();
        expect(sent).toEqual([{ a: 1 }]);
        expect(errors).toEqual([{ error: store.failure, source: 'set', type: 'set' }]);
        expect(state.error.peek()).toBe(store.failure);
        expect(state.isSetting.peek()).toBe(false);
        expect(state.numPendingSets.peek()).toBe(0);
        obs.a.set(2);
        await settle();
        expect(sent).toEqual([{ a: 1 }, { a: 2 }]);
        expect(store.table).toEqual({ a: 2 });
        expect(store.metadata.pending).toEqual({});
        expect(errors).toHaveLength(1);
        expect(state.numPendingSets.peek()).toBe(0);
    });
});

describe('save error revert uses local paths', () => {
    for (const failureAt of ['backend', 'full-transform'])
        test(`renamed save revert restores the local field after ${failureAt} rejection`, async () => {
            const failure = Error('save unavailable');
            const errors: Error[] = [];
            let revert: (() => void) | undefined;
            let calls = 0;
            let rejectBackend = failureAt === 'backend';
            const sent: any[] = [];
            const obs = observable(
                synced({
                    initial: { local: 0 },
                    transform: {
                        save: (value) => {
                            if (++calls === 3 && failureAt === 'full-transform') return Promise.reject(failure);
                            return { wire: value.local };
                        },
                        load: (value: any) => ({ local: value.wire }),
                    },
                    set: async (params) => {
                        sent.push({ value: params.value, paths: params.changes.map((change) => change.path) });
                        if (rejectBackend) {
                            rejectBackend = false;
                            throw failure;
                        }
                    },
                    onError: (error, params) => {
                        errors.push(error);
                        revert = params.revert;
                    },
                }),
            );
            obs.get();
            obs.local.set(1);
            await promiseTimeout(10);
            const state = syncState(obs);
            expect(errors).toEqual([failure]);
            expect(typeof revert).toBe('function');
            expect(obs.peek()).toEqual({ local: 1 });
            expect(state.numPendingSets.peek()).toBe(0);
            expect(state.isSetting.peek()).toBe(false);
            if (failureAt === 'backend') expect(sent).toEqual([{ value: { wire: 1 }, paths: [['wire']] }]);
            else expect(sent).toEqual([]);
            revert!();
            expect(obs.peek()).toEqual({ local: 0 });
            expect(Object.prototype.hasOwnProperty.call(obs.peek(), 'wire')).toBe(false);
            obs.local.set(2);
            await promiseTimeout(10);
            expect(sent[sent.length - 1].value).toEqual({ wire: 2 });
            expect(state.numPendingSets.peek()).toBe(0);
            expect(state.getPendingChanges()).toEqual({});
        });
});

describe('pending child data-key ownership', () => {
    for (const key of ['constructor', '__proto__'])
        test(`${key} child edit has an own pending record and survives refresh`, async () => {
            const prototypeBefore = Object.getOwnPropertyDescriptors(Object.prototype);
            const constructorBefore = Object.getOwnPropertyDescriptors(Object);
            const restore = (target: object, descriptors: PropertyDescriptorMap) => {
                for (const name of Reflect.ownKeys(target))
                    if (!Object.prototype.hasOwnProperty.call(descriptors, name)) Reflect.deleteProperty(target, name);
                Object.defineProperties(target, descriptors);
            };
            const makeValue = (field: number, stable: number) => ({ [key]: field, stable });
            let server = makeValue(0, 0);
            let release: (() => void) | undefined;
            const errors: Error[] = [];
            const sent: any[] = [];
            const obs: any = observable(
                synced<any>({
                    get: async () => server,
                    set: (params) =>
                        new Promise<void>((resolve) => {
                            sent.push(params);
                            release = resolve;
                        }),
                    onError: (error) => errors.push(error),
                }),
            );
            try {
                obs.get();
                const state = syncState(obs);
                await when(state.isLoaded);
                if (key === 'constructor') obs.assign({ [key]: 1 });
                else obs[key].set(1);
                await promiseTimeout(10);
                const pending = state.getPendingChanges()!;
                expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(prototypeBefore);
                expect(Object.getOwnPropertyDescriptors(Object)).toEqual(constructorBefore);
                expect(Object.getPrototypeOf(pending)).toBe(Object.prototype);
                expect(Object.prototype.hasOwnProperty.call(pending, key)).toBe(true);
                expect(pending[key]).toMatchObject({ p: 0, v: 1, t: ['object'] });
                expect(sent).toHaveLength(1);
                expect(sent[0].changes.map((change: any) => change.path)).toEqual([[key]]);
                expect(errors).toEqual([]);
                server = makeValue(9, 1);
                await state.sync();
                await promiseTimeout(10);
                expect(obs.peek()).toEqual(makeValue(1, 1));
                expect(Object.prototype.hasOwnProperty.call(state.getPendingChanges()!, key)).toBe(true);
                expect(state.getPendingChanges()![key].v).toBe(1);
                release!();
                release = undefined;
                await promiseTimeout(10);
                expect(state.numPendingSets.peek()).toBe(0);
                expect(state.getPendingChanges()).toEqual({});
            } finally {
                release?.();
                await promiseTimeout(10);
                restore(Object.prototype, prototypeBefore);
                restore(Object, constructorBefore);
            }
        });
});

describe('canonical pending replay', () => {
    const tick = () => promiseTimeout(0);
    const settle = async () => {
        await tick();
        await tick();
    };
    class Persist {
        table: any;
        metadata: any = {};
        getTable() {
            return cloneFixture(this.table);
        }
        getMetadata() {
            return cloneFixture(this.metadata);
        }
        set(_n: string, changes: any[]) {
            this.table = cloneFixture(applyChanges(this.table, changes));
        }
        setMetadata(_n: string, m: any) {
            this.metadata = cloneFixture(m);
        }
        deleteTable() {}
        deleteMetadata() {}
    }
    describe('ordinary pending explicit nil ancestors', () => {
        const until = async (test: () => boolean, label: string) => {
            for (let i = 0; i < 100; i++) {
                if (test()) return;
                await promiseTimeout(0);
            }
            throw Error('Unreached ' + label);
        };
        const settle = async () => {
            await promiseTimeout(0);
            await promiseTimeout(0);
        };
        for (const channel of ['get', 'subscribe'] as const)
            for (const address of [null, undefined])
                for (const frozen of ['none', 'root', 'profile', 'nonenumerable'] as const)
                    test(`${channel} overlays ordinary nil ancestry without dropping the refresh address=${address} frozen=${frozen}`, async () => {
                        const initial = { profile: { address: { city: 'old', zip: 7 } }, y: 0 };
                        const store = new Persist();
                        store.table = cloneFixture(initial);
                        let push: any;
                        let release!: () => void;
                        let requests = 0;
                        let next: any;
                        const errors: any[] = [];
                        const obs: any = observable();
                        const state = syncObservable(obs, {
                            get: (params) => {
                                if (next) {
                                    params.updateLastSync(1);
                                    return next;
                                }
                                return cloneFixture(initial);
                            },
                            subscribe: ({ update }) => {
                                push = update;
                            },
                            set: () =>
                                new Promise<void>((resolve) => {
                                    requests++;
                                    release = resolve;
                                }),
                            persist: { name: getPersistName(), plugin: store, retrySync: true },
                            onError: (error) => errors.push(error),
                        });
                        obs.get();
                        await until(() => state.isLoaded.peek() && !!push, 'loaded');
                        await settle();
                        obs.profile.address.city.set('local');
                        await until(() => requests === 1, 'set');
                        try {
                            const entry = state.getPendingChanges()!['profile/address/city'] as PendingChanges[string];
                            expect(entry.k).toBeUndefined();
                            const incoming = { profile: { address, server: 9 }, y: 6 };
                            if (frozen === 'root') Object.freeze(incoming);
                            if (frozen === 'profile') Object.freeze(incoming.profile);
                            if (frozen === 'nonenumerable')
                                Object.defineProperty(incoming.profile, 'address', {
                                    value: address,
                                    enumerable: false,
                                    configurable: true,
                                    writable: true,
                                });
                            if (channel === 'get') {
                                next = incoming;
                                state.sync();
                            } else push({ value: incoming, mode: 'set', lastSync: 1 });
                            await settle();
                            await settle();
                            const expected = { profile: { address: { city: 'local' }, server: 9 }, y: 6 };
                            if (frozen === 'nonenumerable')
                                Object.defineProperty(expected.profile, 'address', {
                                    value: { city: 'local' },
                                    enumerable: false,
                                    configurable: true,
                                    writable: true,
                                });
                            expect(obs.peek()).toEqual(expected);
                            expect(obs.profile.address.city.peek()).toBe('local');
                            expect(Object.getOwnPropertyDescriptor(obs.peek().profile, 'address')!.enumerable).toBe(
                                frozen !== 'nonenumerable',
                            );
                            expect(state.lastSync.peek()).toBe(1);
                            expect(store.metadata.lastSync).toBe(1);
                            expect(state.getPendingChanges()!['profile/address/city']).toBe(entry);
                            expect(entry.v).toBe('local');
                            expect(entry.k).toBeUndefined();
                            expect(entry.d).toBeUndefined();
                            expect(store.metadata.pending['profile/address/city'].v).toBe('local');
                            expect(incoming.profile.address).toBe(address);
                            expect(Object.prototype.hasOwnProperty.call(incoming.profile, 'address')).toBe(true);
                            expect(errors).toEqual([]);
                            expect(state.error.peek()).toBeUndefined();
                            expect(state.numPendingGets.peek()).toBe(0);
                            expect(state.numPendingSets.peek()).toBe(1);
                        } finally {
                            release();
                            await until(() => state.numPendingSets.peek() === 0, 'done');
                        }
                        expect(state.getPendingChanges()).toEqual({});
                        expect(state.isSetting.peek()).toBe(false);
                    });
        for (const channel of ['get', 'subscribe'] as const)
            for (const conflict of ['primitive', 'class', 'missing class', 'sealed class'] as const)
                test(`${channel} restores ordinary nil ancestry without error conflict=${conflict}`, async () => {
                    class Profile {
                        address: any = null;
                        server = 9;
                    }
                    class Bare {
                        server = 9;
                    }
                    const initial = { profile: { address: { city: 'old', zip: 7 } }, y: 0 };
                    const store = new Persist();
                    store.table = cloneFixture(initial);
                    let push: any;
                    let release!: () => void;
                    let requests = 0;
                    let next: any;
                    const errors: any[] = [];
                    const obs: any = observable();
                    const state = syncObservable(obs, {
                        get: (params) => {
                            if (next) {
                                params.updateLastSync(1);
                                return next;
                            }
                            return cloneFixture(initial);
                        },
                        subscribe: ({ update }) => {
                            push = update;
                        },
                        set: () =>
                            new Promise<void>((resolve) => {
                                requests++;
                                release = resolve;
                            }),
                        persist: { name: getPersistName(), plugin: store, retrySync: true },
                        onError: (error) => errors.push(error),
                    });
                    obs.get();
                    await until(() => state.isLoaded.peek() && !!push, 'loaded');
                    await settle();
                    obs.profile.address.city.set('local');
                    await until(() => requests === 1, 'set');
                    try {
                        const before = cloneFixture(obs.peek());
                        const entry = state.getPendingChanges()!['profile/address/city'];
                        const metadata = cloneFixture(entry);
                        const profile =
                            conflict === 'class'
                                ? new Profile()
                                : conflict === 'sealed class'
                                  ? Object.seal(new Profile())
                                  : conflict === 'missing class'
                                    ? new Bare()
                                    : { address: 5 };
                        const incoming = { profile, y: 6 };
                        if (channel === 'get') {
                            next = incoming;
                            state.sync();
                        } else push({ value: incoming, mode: 'set', lastSync: 1 });
                        await settle();
                        await settle();
                        expect(state.getPendingChanges()!['profile/address/city']).toBe(entry);
                        expect(entry).toEqual(metadata);
                        if (conflict === 'primitive') {
                            expect(obs.peek()).toEqual(before);
                            expect(state.lastSync.peek()).not.toBe(1);
                        } else {
                            expect(obs.profile.peek()).toBe(profile);
                            expect(obs.profile.address.city.peek()).toBe('local');
                            expect(obs.profile.server.peek()).toBe(9);
                            expect(obs.y.peek()).toBe(6);
                            expect(state.lastSync.peek()).toBe(1);
                        }
                        expect(errors).toEqual([]);
                        expect(state.error.peek()).toBeUndefined();
                        expect(state.numPendingGets.peek()).toBe(0);
                    } finally {
                        release();
                        await until(() => state.numPendingSets.peek() === 0, 'done');
                    }
                    expect(state.getPendingChanges()).toEqual({});
                });
    });
    describe('typed child tombstones', () => {
        const until = async (ready: () => boolean, boundary: string) => {
            for (let i = 0; i < 100; i++) {
                if (ready()) return;
                await tick();
            }
            throw new Error('Unreached fixture boundary ' + boundary);
        };
        for (const key of ['x', 1, '1', 'a/b'])
            test(`new Map deletion accepts unrelated subscription and replays typed tombstone ${typeof key}:${key}`, async () => {
                const sibling = key === 1 ? '1' : key === '1' ? 1 : 'y';
                const initial = [
                    { id: key, value: 0 },
                    { id: sibling, value: 0 },
                ];
                const store = new Persist();
                store.table = new Map(initial.map((r) => [r.id, { ...r }]));
                let push: any;
                const releases: (() => void)[] = [];
                const calls: any[] = [];
                const errors: any[] = [];
                const obs: any = observable(
                    syncedCrud({
                        as: 'Map',
                        list: () => initial.map((r) => ({ ...r })),
                        delete: async (row: any) => {
                            calls.push(row);
                            await new Promise<void>((r) => releases.push(r));
                        },
                        subscribe: ({ update }: any) => {
                            push = update;
                        },
                        persist: { name: 'live', plugin: store, retrySync: true },
                        onError: (e: any) => errors.push(e),
                    }),
                );
                try {
                    obs.get();
                    await until(() => syncState(obs).isLoaded.peek() && !!push, 'initial');
                    await settle();
                    obs.delete(key);
                    await until(() => calls.length === 1, 'delete called');
                    await settle();
                    await push({ value: [{ id: sibling, value: 5 }], mode: 'assign' });
                    await settle();
                    expect(obs.peek().has(key)).toBe(false);
                    expect(obs.peek().get(sibling).value).toBe(5);
                    // A stale server row must not recreate a locally deleted membership.
                    await push({
                        value: [
                            { id: key, value: 9 },
                            { id: sibling, value: 6 },
                        ],
                        mode: 'set',
                    });
                    await settle();
                    expect(obs.peek().has(key)).toBe(false);
                    expect(obs.peek().get(sibling).value).toBe(6);
                    const fresh = new Persist();
                    fresh.table = cloneFixture(store.table);
                    fresh.metadata = cloneFixture(store.metadata);
                    const replayCalls: any[] = [];
                    const replayReleases: (() => void)[] = [];
                    const restarted: any = observable(
                        syncedCrud({
                            as: 'Map',
                            list: () => initial.map((r) => ({ ...r })),
                            delete: async (row: any) => {
                                replayCalls.push(row);
                                await new Promise<void>((r) => replayReleases.push(r));
                            },
                            persist: { name: 'restart', plugin: fresh, retrySync: true },
                            onError: (e: any) => errors.push(e),
                        }),
                    );
                    try {
                        restarted.get();
                        await until(() => syncState(restarted).isLoaded.peek(), 'restart loaded');
                        await settle();
                        expect(restarted.peek().has(key)).toBe(false);
                        expect(replayCalls.map((r) => r.id)).toEqual([key]);
                        expect(restarted.peek().has(sibling)).toBe(true);
                        expect(errors).toEqual([]);
                    } finally {
                        replayReleases.forEach((r) => r());
                        await until(() => syncState(restarted).numPendingSets.peek() === 0, 'replay settled');
                    }
                    expect(syncState(restarted).getPendingChanges()).toEqual({});
                    expect(restarted.peek().has(key)).toBe(false);
                } finally {
                    releases.forEach((r) => r());
                    await until(() => syncState(obs).numPendingSets.peek() === 0, 'original settled');
                }
                expect(errors).toEqual([]);
            });
        for (const key of [1, '1'])
            test(`new Map own undefined is distinct from deletion ${typeof key}`, async () => {
                const sibling = key === 1 ? '1' : 1;
                const initial = new Map<any, any>([
                    [key, { value: 0 }],
                    [sibling, { value: 0 }],
                ]);
                const store = new Persist();
                store.table = cloneFixture(initial);
                const releases: (() => void)[] = [];
                let push: any;
                let calls = 0;
                const obs: any = observable(undefined);
                syncObservable(obs, {
                    get: () => cloneFixture(initial),
                    set: () => {
                        calls++;
                        return new Promise<void>((r) => releases.push(r));
                    },
                    subscribe: ({ update }) => {
                        push = update;
                    },
                    persist: { name: 'undefined', plugin: store, retrySync: true },
                });
                try {
                    obs.get();
                    await until(() => syncState(obs).isLoaded.peek() && !!push, 'initial');
                    obs.set(key, undefined);
                    await until(() => calls === 1, 'set called');
                    await settle();
                    expect(obs.peek().has(key)).toBe(true);
                    await push({
                        value: new Map([
                            [key, { value: 9 }],
                            [sibling, { value: 5 }],
                        ]),
                        mode: 'set',
                    });
                    await settle();
                    expect(obs.peek().has(key)).toBe(true);
                    expect(obs.peek().get(key)).toBeUndefined();
                    expect(obs.peek().get(sibling).value).toBe(5);
                    const fresh = new Persist();
                    fresh.table = cloneFixture(store.table);
                    fresh.metadata = cloneFixture(store.metadata);
                    let finish: any;
                    const replayReleases: (() => void)[] = [];
                    const restarted: any = observable(undefined);
                    syncObservable(restarted, {
                        get: () => new Promise((r) => (finish = r)),
                        set: () => new Promise<void>((r) => replayReleases.push(r)),
                        persist: { name: 'restart-undefined', plugin: fresh, retrySync: true },
                    });
                    await until(() => syncState(restarted).isPersistLoaded.peek(), 'persist loaded');
                    expect(restarted.peek().has(key)).toBe(true);
                    expect(restarted.peek().get(key)).toBeUndefined();
                    finish(cloneFixture(initial));
                    await until(() => syncState(restarted).isLoaded.peek(), 'loaded');
                    await settle();
                    expect(restarted.peek().has(key)).toBe(true);
                    expect(restarted.peek().get(key)).toBeUndefined();
                    replayReleases.forEach((r) => r());
                    await until(() => syncState(restarted).numPendingSets.peek() === 0, 'replay done');
                } finally {
                    releases.forEach((r) => r());
                    await until(() => syncState(obs).numPendingSets.peek() === 0, 'original done');
                }
            });
        test('an older delete ACK does not clear newer present undefined intent', async () => {
            const initial = new Map([
                ['x', { value: 0 }],
                ['y', { value: 0 }],
            ]);
            const releases: (() => void)[] = [];
            let calls = 0;
            const obs: any = observable(undefined);
            syncObservable(obs, {
                get: () => cloneFixture(initial),
                set: () => {
                    calls++;
                    return new Promise<void>((r) => releases.push(r));
                },
            });
            obs.get();
            await until(() => syncState(obs).isLoaded.peek(), 'initial');
            obs.delete('x');
            await until(() => calls === 1, 'delete');
            obs.set('x', { value: 2 });
            obs.set('x', undefined);
            await until(() => calls === 2, 'new undefined');
            try {
                releases[0]();
                await settle();
                expect(obs.peek().has('x')).toBe(true);
                expect(obs.peek().get('x')).toBeUndefined();
                expect(Object.keys(syncState(obs).getPendingChanges()!)).toEqual(['x']);
            } finally {
                releases.forEach((r) => r());
                await until(() => syncState(obs).numPendingSets.peek() === 0, 'done');
            }
        });
        for (const deleted of [false, true])
            test(`a complete subscription acknowledges matching terminal membership deleted=${deleted}`, async () => {
                const initial = new Map([
                    ['x', { value: 0 }],
                    ['y', { value: 0 }],
                ]);
                let push: any, release: any;
                let calls = 0;
                const obs: any = observable(undefined);
                syncObservable(obs, {
                    get: () => cloneFixture(initial),
                    subscribe: ({ update }) => {
                        push = update;
                    },
                    set: () => {
                        calls++;
                        return new Promise<void>((r) => (release = r));
                    },
                });
                obs.get();
                await until(() => syncState(obs).isLoaded.peek(), 'initial');
                if (deleted) obs.delete('x');
                else obs.set('x', undefined);
                await until(() => calls === 1, 'set');
                try {
                    const remote = new Map<any, any>([['y', { value: 5 }]]);
                    if (!deleted) remote.set('x', undefined);
                    await push({ value: remote, mode: 'set' });
                    await settle();
                    expect(obs.peek().has('x')).toBe(!deleted);
                    expect(obs.peek().get('y').value).toBe(5);
                    expect(syncState(obs).getPendingChanges()).toEqual({});
                } finally {
                    release();
                    await until(() => syncState(obs).numPendingSets.peek() === 0, 'done');
                }
            });
        test('a pending deletion does not call an incoming Map own set method', async () => {
            const initial = new Map([
                ['x', { value: 0 }],
                ['y', { value: 0 }],
            ]);
            let push: any, release: any;
            let requested = false,
                methodCalls = 0;
            const obs: any = observable(undefined);
            syncObservable(obs, {
                get: () => cloneFixture(initial),
                subscribe: ({ update }) => {
                    push = update;
                },
                set: () => {
                    requested = true;
                    return new Promise<void>((r) => (release = r));
                },
            });
            obs.get();
            await until(() => syncState(obs).isLoaded.peek(), 'initial');
            obs.delete('x');
            await until(() => requested, 'set');
            try {
                const remote = new Map([
                    ['x', { value: 9 }],
                    ['y', { value: 5 }],
                ]);
                Object.defineProperty(remote, 'set', {
                    enumerable: true,
                    value: () => {
                        methodCalls++;
                        throw Error('incoming own set must remain data');
                    },
                });
                await push({ value: remote, mode: 'set' });
                await settle();
                expect(methodCalls).toBe(0);
                expect(obs.peek().has('x')).toBe(false);
                expect(obs.peek().get('y').value).toBe(5);
            } finally {
                release();
                await until(() => syncState(obs).numPendingSets.peek() === 0, 'done');
            }
        });
        for (const key of [1, '1'])
            test(`root Map non-nil child intent keeps its actual typed path key=${typeof key}`, async () => {
                const sibling = key === 1 ? '1' : 1;
                const initial = new Map<any, any>([
                    [key, { id: key, value: 0, other: 7 }],
                    [sibling, { id: sibling, value: 0 }],
                ]);
                let push!: (params: any) => void;
                let release!: () => void;
                let requested = false;
                const obs: any = observable();
                const state = syncObservable(obs, {
                    get: () => cloneFixture(initial),
                    subscribe: ({ update }) => {
                        push = update;
                    },
                    set: () => {
                        requested = true;
                        return new Promise<void>((resolve) => {
                            release = resolve;
                        });
                    },
                });
                obs.get();
                await until(() => state.isLoaded.peek(), 'initial');
                obs.get(key).value.set(1);
                await until(() => requested, 'set');
                try {
                    expect((state.getPendingChanges() as PendingChanges)['1/value'].t).toEqual(['object', 'object']);
                    expect((state.getPendingChanges()!['1/value'] as any).k).toEqual([key, 'value']);
                    push({
                        value: new Map<any, any>([
                            [key, { id: key, value: 9, other: 7 }],
                            [sibling, { id: sibling, value: 5 }],
                        ]),
                        mode: 'set',
                    });
                    await settle();
                    expect(obs.peek().get(key).value).toBe(1);
                    expect(obs.peek().get(sibling).value).toBe(5);
                    for (const missing of ['undefined', 'null', 'primitive', 'absent']) {
                        for (const mode of ['assign', 'set'] as const) {
                            const before = cloneFixture(obs.peek());
                            const pending = state.getPendingChanges()!['1/value'];
                            const metadata = cloneFixture(pending);
                            const history = (pending as any).h;
                            const remote = new Map<any, any>([[sibling, { id: sibling, value: 6 }]]);
                            if (missing !== 'absent')
                                remote.set(key, missing === 'null' ? null : missing === 'primitive' ? 5 : undefined);
                            push({ value: remote, mode });
                            await settle();
                            if (missing === 'absent') {
                                expect(obs.peek().get(key)).toEqual(before.get(key));
                                expect(obs.peek().get(sibling).value).toBe(6);
                            } else {
                                expect(obs.peek()).toEqual(before);
                                expect(state.getPendingChanges()!['1/value']).toBe(pending);
                                expect(state.getPendingChanges()!['1/value']).toEqual(metadata);
                                expect((state.getPendingChanges()!['1/value'] as any).h).toBe(history);
                            }
                        }
                    }
                } finally {
                    release();
                    await until(() => state.numPendingSets.peek() === 0, 'done');
                }
                push({ value: cloneFixture(obs.peek()), mode: 'set' });
                await settle();
                expect(state.getPendingChanges()).toEqual({});
                expect(state.error.peek()).toBeUndefined();
            });
        for (const key of ['__proto__'])
            test(`canonical deletion keeps an inherited leaf absent key=${key}`, async () => {
                const initial: any = { y: 0 };
                Object.defineProperty(initial, key, { value: 1, enumerable: true, configurable: true, writable: true });
                let push!: (params: any) => void;
                let release!: () => void;
                let requested = false;
                const obs: any = observable();
                const state = syncObservable(obs, {
                    get: () => cloneFixture(initial),
                    subscribe: ({ update }) => {
                        push = update;
                    },
                    set: () => {
                        requested = true;
                        return new Promise<void>((resolve) => {
                            release = resolve;
                        });
                    },
                });
                obs.get();
                await until(() => state.isLoaded.peek(), 'initial');
                obs[key].delete();
                await until(() => requested, 'delete');
                try {
                    const remote: any = { y: 5 };
                    Object.defineProperty(remote, key, {
                        value: 9,
                        enumerable: true,
                        configurable: true,
                        writable: true,
                    });
                    push({ value: remote, mode: 'set' });
                    await settle();
                    expect(Object.prototype.hasOwnProperty.call(obs.peek(), key)).toBe(false);
                    expect(obs.peek().y).toBe(5);
                    expect(state.getPendingChanges()![key].v).toBeUndefined();
                } finally {
                    release();
                    await until(() => state.numPendingSets.peek() === 0, 'done');
                }
                expect(state.getPendingChanges()).toEqual({});
                expect(state.error.peek()).toBeUndefined();
            });
        for (const map of [false, true])
            for (const rootPending of [false, true])
                for (const subscription of [false, true])
                    test(`a frozen omitted parent restores on the published value map=${map} root=${rootPending} subscription=${subscription}`, async () => {
                        const rowKey = map ? 'row' : 'a/b';
                        const make = (row: any, y: number) =>
                            map
                                ? new Map<any, any>([
                                      [rowKey, row],
                                      ['y', y],
                                  ])
                                : { [rowKey]: row, y };
                        const initial = make({ inner: { x: 0 }, other: 7 }, 0);
                        let remote: any = cloneFixture(initial);
                        let push: any;
                        const releases: (() => void)[] = [];
                        const errors: any[] = [];
                        let requests = 0;
                        const obs: any = observable();
                        const state = syncObservable(obs, {
                            get: () => remote,
                            subscribe: ({ update }) => {
                                push = update;
                            },
                            set: () => {
                                requests++;
                                return new Promise<void>((resolve) => releases.push(resolve));
                            },
                            onError: (error) => errors.push(error),
                        });
                        obs.get();
                        await until(() => state.isLoaded.peek() && !!push, 'initial');
                        const row = () => (map ? obs.get(rowKey) : obs[rowKey]);
                        if (rootPending) {
                            obs.set(make({ inner: { x: 1 }, other: 7 }, 0));
                            await until(() => requests === 1, 'root save');
                        }
                        row().inner.x.set(rootPending ? 2 : 1);
                        await until(() => requests === (rootPending ? 2 : 1), 'child save');
                        const entry = state.getPendingChanges()![rowKey + '/inner/x'];
                        expect((entry as any).k).toEqual([rowKey, 'inner', 'x']);
                        if (rootPending) expect(state.getPendingChanges()!['']).toBeDefined();
                        const frozen = Object.freeze({ other: 9 });
                        remote = make(frozen, 6);
                        if (!map) Object.freeze(remote);
                        try {
                            if (subscription) push({ value: remote, mode: 'set' });
                            else await state.sync();
                            await settle();
                            expect(obs.peek()).toEqual(make({ inner: { x: rootPending ? 2 : 1 }, other: 9 }, 6));
                            expect(frozen).toEqual({ other: 9 });
                            expect(Object.prototype.hasOwnProperty.call(frozen, 'inner')).toBe(false);
                            expect(state.getPendingChanges()![rowKey + '/inner/x']).toBe(entry);
                            expect((entry as any).k).toEqual([rowKey, 'inner', 'x']);
                            expect(errors).toEqual([]);
                            expect(state.numPendingGets.peek()).toBe(0);
                            expect(state.isGetting.peek()).toBe(false);
                        } finally {
                            releases.forEach((release) => release());
                            await until(() => state.numPendingSets.peek() === 0, 'saves settled');
                        }
                        remote = make({ inner: { x: rootPending ? 2 : 1 }, other: 9 }, 6);
                        if (subscription) push({ value: remote, mode: 'set' });
                        else await state.sync();
                        await settle();
                        expect(state.getPendingChanges()).toEqual({});
                        expect(state.error.peek()).toBeUndefined();
                        expect(errors).toEqual([]);
                    });
        for (const sparse of [false, true])
            test(`pending baselines keep array shape and extra keys sparse=${sparse}`, async () => {
                const tag = Symbol('tag');
                const make = () => {
                    const items: any = [1, 2, 3];
                    if (sparse) delete items[1];
                    Object.defineProperty(items, 0, {
                        value: 1,
                        enumerable: false,
                        writable: true,
                        configurable: true,
                    });
                    items.extra = { e: 1 };
                    items[tag] = 't';
                    return items;
                };
                let push: any;
                let release!: () => void;
                let requested = false;
                const obs: any = observable();
                const state = syncObservable(obs, {
                    get: () => ({ items: [0] }),
                    subscribe: ({ update }) => {
                        push = update;
                    },
                    set: () => {
                        requested = true;
                        return new Promise<void>((resolve) => {
                            release = resolve;
                        });
                    },
                });
                obs.get();
                await until(() => state.isLoaded.peek() && !!push, 'initial');
                obs.items.set([9]);
                await until(() => requested, 'save');
                const incoming = make();
                try {
                    push({ value: { items: incoming }, mode: 'set' });
                    await settle();
                    const baseline = state.getPendingChanges()!['items'].p;
                    expect(baseline).not.toBe(incoming);
                    expect(Array.isArray(baseline)).toBe(true);
                    expect(baseline.length).toBe(3);
                    expect(1 in baseline).toBe(!sparse);
                    expect(Reflect.ownKeys(baseline)).toEqual(
                        sparse ? ['0', '2', 'length', 'extra', tag] : ['0', '1', '2', 'length', 'extra', tag],
                    );
                    expect(baseline[0]).toBe(1);
                    expect(baseline.extra).toEqual({ e: 1 });
                    expect(baseline.extra).not.toBe(incoming.extra);
                } finally {
                    release();
                    await until(() => state.numPendingSets.peek() === 0, 'save settled');
                }
            });
        for (const channel of ['get', 'subscribe'] as const)
            for (const frozen of [false, true])
                test(`${channel} restores a pending row into a shorter array frozen=${frozen}`, async () => {
                    let remote: any = { items: [{ x: 0 }], y: 0 };
                    let push: any;
                    let release!: () => void;
                    let requested = false;
                    const errors: any[] = [];
                    const obs: any = observable();
                    const state = syncObservable(obs, {
                        get: () => remote,
                        subscribe: ({ update }) => {
                            push = update;
                        },
                        set: () => {
                            requested = true;
                            return new Promise<void>((resolve) => {
                                release = resolve;
                            });
                        },
                        onError: (error) => errors.push(error),
                    });
                    obs.get();
                    await until(() => state.isLoaded.peek() && !!push, 'initial');
                    obs.items[0].x.set(1);
                    await until(() => requested, 'save');
                    const items: any[] = [];
                    if (frozen) Object.freeze(items);
                    const incoming = { items, y: 6 };
                    try {
                        if (channel === 'get') {
                            remote = incoming;
                            await state.sync();
                        } else push({ value: incoming, mode: 'set' });
                        await settle();
                        expect(obs.peek()).toEqual({ items: [{ x: 1 }], y: 6 });
                        expect(items).toEqual([]);
                        expect(errors).toEqual([]);
                    } finally {
                        release();
                        await until(() => state.numPendingSets.peek() === 0, 'save settled');
                    }
                });
        for (const frozen of [false, true])
            test(`omitted parent restoration writes through a class ancestor frozen=${frozen}`, async () => {
                const initial = new Map<any, any>([
                    ['row', { inner: { x: 0 }, other: 7 }],
                    ['y', 0],
                ]);
                let remote: any = cloneFixture(initial);
                let release!: () => void;
                let requested = false;
                const errors: any[] = [];
                const obs: any = observable();
                const state = syncObservable(obs, {
                    get: () => remote,
                    set: () => {
                        requested = true;
                        return new Promise<void>((resolve) => {
                            release = resolve;
                        });
                    },
                    onError: (error) => errors.push(error),
                });
                obs.get();
                await until(() => state.isLoaded.peek(), 'initial');
                obs.get('row').inner.x.set(1);
                await until(() => requested, 'save');
                const entry = state.getPendingChanges()!['row/inner/x'];
                const metadata = cloneFixture(entry);
                const current = cloneFixture(obs.peek());
                class UnsupportedRow {
                    other = 9;
                    toJSON() {
                        return 5;
                    }
                }
                const row = new UnsupportedRow();
                if (frozen) Object.freeze(row);
                remote = new Map<any, any>([
                    ['row', row],
                    ['y', 6],
                ]);
                try {
                    await state.sync();
                    await settle();
                    if (frozen) expect(obs.peek()).toEqual(current);
                    else {
                        expect(obs.peek().get('row')).toBe(row);
                        expect(row).toEqual(Object.assign(new UnsupportedRow(), { inner: { x: 1 } }));
                        expect(obs.peek().get('y')).toBe(6);
                    }
                    expect(state.getPendingChanges()!['row/inner/x']).toBe(entry);
                    expect(entry).toEqual(metadata);
                    expect(errors).toEqual([]);
                    expect(state.numPendingGets.peek()).toBe(0);
                    expect(state.isGetting.peek()).toBe(false);
                } finally {
                    release();
                    await until(() => state.numPendingSets.peek() === 0, 'save settled');
                }
                remote = cloneFixture(current);
                await state.sync();
                await settle();
                expect(state.getPendingChanges()).toEqual({});
                expect(state.error.peek()).toBeUndefined();
            });
        for (const map of [false, true])
            for (const kind of ['class', 'typed array', 'opaque', 'plain marker', 'class bigint', 'class cycle'])
                test(`omitted-parent restoration preserves unrelated data map=${map} kind=${kind}`, async () => {
                    const rowKey = map ? 'row' : 'a/b';
                    const pack = (row: any, unrelated: any) =>
                        map
                            ? new Map<any, any>([
                                  [rowKey, row],
                                  ['unrelated', unrelated],
                                  ['y', 0],
                              ])
                            : { [rowKey]: row, unrelated, y: 0 };
                    let jsonCalls = 0;
                    class ServerValue {
                        token = 9;
                        toJSON() {
                            jsonCalls++;
                            return 5;
                        }
                    }
                    class BigValue {
                        token = BigInt(9);
                    }
                    class CyclicValue {
                        self: any = this;
                    }
                    const unrelated: any =
                        kind === 'class'
                            ? new ServerValue()
                            : kind === 'typed array'
                              ? new Uint8Array([3, 4])
                              : kind === 'opaque'
                                ? ObservableHint.opaque({ token: 9 })
                                : kind === 'plain marker'
                                  ? ObservableHint.plain({ token: 9 })
                                  : kind === 'class bigint'
                                    ? ObservableHint.opaque(new BigValue())
                                    : ObservableHint.opaque(new CyclicValue());
                    const initial = pack({ inner: { x: 0 }, other: 7 }, 0);
                    let remote: any = initial;
                    let release!: () => void;
                    let requested = false;
                    const errors: any[] = [];
                    const obs: any = observable();
                    const state = syncObservable(obs, {
                        get: () => remote,
                        set: () => {
                            requested = true;
                            return new Promise<void>((resolve) => {
                                release = resolve;
                            });
                        },
                        onError: (error) => errors.push(error),
                    });
                    obs.get();
                    await until(() => state.isLoaded.peek(), 'initial');
                    const row = map ? obs.get(rowKey) : obs[rowKey];
                    row.inner.x.set(1);
                    await until(() => requested, 'save');
                    const entry = state.getPendingChanges()![rowKey + '/inner/x'];
                    remote = pack(Object.freeze({ other: 9 }), unrelated);
                    if (map) remote.set('y', 6);
                    else remote.y = 6;
                    const hidden = { marker: 7 };
                    const hiddenDescriptor = { value: hidden, enumerable: false, configurable: true, writable: false };
                    Object.defineProperty(remote, 'hidden', hiddenDescriptor);
                    let unrelatedReads = 0;
                    const unrelatedGetter = () => {
                        unrelatedReads++;
                        throw Error('unrelated getter was read');
                    };
                    Object.defineProperty(remote, 'unrelatedGetter', { get: unrelatedGetter, configurable: true });
                    if (!map) Object.freeze(remote[rowKey]);
                    try {
                        await state.sync();
                        await settle();
                        expect(errors).toEqual([]);
                        const current = obs.peek();
                        expect(map ? current.get('unrelated') : current.unrelated).toBe(unrelated);
                        expect(map ? current.get(rowKey) : current[rowKey]).toEqual({ inner: { x: 1 }, other: 9 });
                        expect(map ? current.get('y') : current.y).toBe(6);
                        expect(Object.getOwnPropertyDescriptor(current, 'hidden')).toEqual(hiddenDescriptor);
                        expect(Object.getOwnPropertyDescriptor(remote, 'hidden')).toEqual(hiddenDescriptor);
                        expect(
                            Object.prototype.hasOwnProperty.call(map ? remote.get(rowKey) : remote[rowKey], 'inner'),
                        ).toBe(false);
                        expect(jsonCalls).toBe(0);
                        expect(unrelatedReads).toBe(0);
                        expect(Object.getOwnPropertyDescriptor(current, 'unrelatedGetter')?.get).toBe(unrelatedGetter);
                        expect(Object.getPrototypeOf(current)).toBe(Object.getPrototypeOf(remote));
                        expect(state.getPendingChanges()![rowKey + '/inner/x']).toBe(entry);
                        expect(state.numPendingGets.peek()).toBe(0);
                    } finally {
                        release();
                        await until(() => state.numPendingSets.peek() === 0, 'save settled');
                    }
                    remote = pack({ inner: { x: 1 }, other: 9 }, unrelated);
                    await state.sync();
                    await settle();
                    expect(state.getPendingChanges()).toEqual({});
                    expect(errors).toEqual([]);
                });
        for (const boundary of ['prefix accessor', 'terminal accessor', 'nonenumerable prefix'])
            test(`omitted-parent copy respects ${boundary}`, async () => {
                const localHolder = { inner: { x: 0 } };
                const localRow = { holder: localHolder, other: 7 };
                let remote: any = new Map<any, any>([
                    ['row', localRow],
                    ['y', 0],
                ]);
                let release!: () => void;
                let requested = false;
                const errors: any[] = [];
                const obs: any = observable();
                const state = syncObservable(obs, {
                    get: () => remote,
                    set: () => {
                        requested = true;
                        return new Promise<void>((resolve) => {
                            release = resolve;
                        });
                    },
                    onError: (error) => errors.push(error),
                });
                obs.get();
                await until(() => state.isLoaded.peek(), 'initial');
                obs.get('row').holder.inner.x.set(1);
                await until(() => requested, 'save');
                const entry = state.getPendingChanges()!['row/holder/inner/x'];
                const metadata = cloneFixture(entry);
                const incomingHolder = {};
                const incomingRow = { holder: incomingHolder, other: 9 };
                let pathReads = 0;
                let localReads = 0;
                const terminalGetter = () => {
                    pathReads++;
                    throw Error('terminal accessor was read');
                };
                if (boundary === 'prefix accessor') {
                    Object.defineProperty(incomingRow, 'holder', {
                        enumerable: true,
                        configurable: true,
                        get: () => {
                            if (++pathReads > 1) throw Error('path accessor was reread');
                            return incomingHolder;
                        },
                    });
                } else if (boundary === 'terminal accessor') {
                    Object.defineProperty(localRow, 'holder', {
                        enumerable: true,
                        configurable: true,
                        get: () => {
                            if (++localReads === 2)
                                Object.defineProperty(incomingHolder, 'inner', {
                                    get: terminalGetter,
                                    configurable: true,
                                });
                            return localHolder;
                        },
                    });
                } else
                    Object.defineProperty(incomingRow, 'holder', {
                        value: incomingHolder,
                        enumerable: false,
                        configurable: false,
                        writable: false,
                    });
                remote = new Map<any, any>([
                    ['row', incomingRow],
                    ['y', 6],
                ]);
                try {
                    await state.sync();
                    await settle();
                    expect(errors).toEqual([]);
                    expect(pathReads).toBe(boundary === 'prefix accessor' ? 1 : 0);
                    if (boundary === 'nonenumerable prefix') {
                        const row = obs.peek().get('row');
                        expect(row.holder.inner.x).toBe(1);
                        expect(row.other).toBe(9);
                        expect(obs.peek().get('y')).toBe(6);
                        expect(Object.getOwnPropertyDescriptor(row, 'holder')?.enumerable).toBe(false);
                        expect(Object.prototype.hasOwnProperty.call(incomingHolder, 'inner')).toBe(false);
                    } else {
                        expect(obs.peek().get('row')).toBe(localRow);
                        expect(obs.peek().get('y')).toBe(0);
                        expect(localHolder.inner.x).toBe(1);
                        expect(entry).toEqual(metadata);
                        if (boundary === 'terminal accessor') {
                            expect(localReads).toBe(2);
                            expect(Object.getOwnPropertyDescriptor(incomingHolder, 'inner')?.get).toBe(terminalGetter);
                        }
                    }
                    expect(state.getPendingChanges()!['row/holder/inner/x']).toBe(entry);
                } finally {
                    Object.defineProperty(localRow, 'holder', {
                        value: localHolder,
                        enumerable: true,
                        configurable: true,
                        writable: true,
                    });
                    release();
                    await until(() => state.numPendingSets.peek() === 0, 'save settled');
                }
                remote = new Map<any, any>([
                    ['row', { holder: { inner: { x: 1 } }, other: 9 }],
                    ['y', 6],
                ]);
                await state.sync();
                await settle();
                expect(state.getPendingChanges()).toEqual({});
                expect(errors).toEqual([]);
            });
        for (const rowKey of ['row-key', 'a/b'])
            for (const frozen of [false, true])
                test(`omitted-parent copy keeps ancestor key order key=${rowKey} frozen=${frozen}`, async () => {
                    const initial = {
                        beforeRoot: { token: 1 },
                        [rowKey]: { beforeRow: { token: 2 }, holder: { inner: { x: 0 } }, afterRow: { token: 3 } },
                        afterRoot: { token: 4 },
                    };
                    let remote: any = initial;
                    let release!: () => void;
                    let requested = false;
                    const errors: any[] = [];
                    const obs: any = observable();
                    const state = syncObservable(obs, {
                        get: () => remote,
                        set: () => {
                            requested = true;
                            return new Promise<void>((resolve) => {
                                release = resolve;
                            });
                        },
                        onError: (error) => errors.push(error),
                    });
                    obs.get();
                    await until(() => state.isLoaded.peek(), 'initial');
                    obs[rowKey].holder.inner.x.set(1);
                    await until(() => requested, 'save');
                    const beforeRoot = { token: 5 };
                    const afterRoot = { token: 6 };
                    const beforeRow = { token: 7 };
                    const afterRow = { token: 8 };
                    const incomingRow = { beforeRow, holder: {}, afterRow };
                    remote = { beforeRoot, [rowKey]: incomingRow, afterRoot };
                    const unrelated = { value: { marker: 9 }, enumerable: false, configurable: true, writable: false };
                    Object.defineProperty(remote, 'unrelated', unrelated);
                    if (frozen) {
                        Object.freeze(incomingRow);
                        Object.freeze(remote);
                    }
                    const rootKeys = Object.keys(remote);
                    const rowKeys = Object.keys(incomingRow);
                    const unrelatedDescriptor = Object.getOwnPropertyDescriptor(remote, 'unrelated');
                    try {
                        await state.sync();
                        await settle();
                        const current = obs.peek();
                        expect(Object.keys(current)).toEqual(rootKeys);
                        expect(Object.keys(current[rowKey])).toEqual(rowKeys);
                        expect(current[rowKey].holder.inner.x).toBe(1);
                        expect(current.beforeRoot).toBe(beforeRoot);
                        expect(current.afterRoot).toBe(afterRoot);
                        expect(current[rowKey].beforeRow).toBe(beforeRow);
                        expect(current[rowKey].afterRow).toBe(afterRow);
                        expect(Object.getOwnPropertyDescriptor(current, 'unrelated')).toEqual(unrelatedDescriptor);
                        expect(Object.keys(remote)).toEqual(rootKeys);
                        expect(Object.keys(incomingRow)).toEqual(rowKeys);
                        expect(Object.prototype.hasOwnProperty.call(incomingRow.holder, 'inner')).toBe(false);
                        expect(errors).toEqual([]);
                    } finally {
                        release();
                        await until(() => state.numPendingSets.peek() === 0, 'save settled');
                    }
                    remote = { beforeRoot, [rowKey]: { beforeRow, holder: { inner: { x: 1 } }, afterRow }, afterRoot };
                    await state.sync();
                    await settle();
                    expect(state.getPendingChanges()).toEqual({});
                    expect(errors).toEqual([]);
                });
        test('canonical slash child declines conflicting parents and retains omitted-parent leaf intent', async () => {
            const initial = { 'a/b': { id: 'row', value: 0, other: 7 }, y: 0 };
            let push!: (params: any) => void;
            let release!: () => void;
            let requested = false;
            const obs: any = observable();
            const state = syncObservable(obs, {
                get: () => cloneFixture(initial),
                subscribe: ({ update }) => {
                    push = update;
                },
                set: () => {
                    requested = true;
                    return new Promise<void>((resolve) => {
                        release = resolve;
                    });
                },
            });
            obs.get();
            await until(() => state.isLoaded.peek(), 'initial');
            obs['a/b'].value.set(1);
            await until(() => requested, 'set');
            try {
                push({ value: { 'a/b': { id: 'row', value: 9, other: 8 }, y: 5 }, mode: 'set' });
                await settle();
                expect(obs.peek()).toEqual({ 'a/b': { id: 'row', value: 1, other: 8 }, y: 5 });
                const before = cloneFixture(obs.peek());
                const entry = state.getPendingChanges()!['a/b/value'];
                const metadata = cloneFixture(entry);
                const history = (entry as any).h;
                for (const remote of [
                    { 'a/b': undefined, y: 6 },
                    { 'a/b': null, y: 6 },
                ]) {
                    push({ value: remote, mode: 'set' });
                    await settle();
                    expect(obs.peek()).toEqual(before);
                    expect(state.getPendingChanges()!['a/b/value']).toBe(entry);
                    expect(state.getPendingChanges()!['a/b/value']).toEqual(metadata);
                    expect((state.getPendingChanges()!['a/b/value'] as any).h).toBe(history);
                }
                push({ value: { y: 6 }, mode: 'set' });
                await settle();
                expect(obs.peek()).toEqual({ 'a/b': { id: 'row', value: 1, other: 8 }, y: 6 });
                expect((state.getPendingChanges()!['a/b/value'] as any).k).toEqual(['a/b', 'value']);
            } finally {
                release();
                await until(() => state.numPendingSets.peek() === 0, 'done');
            }
            push({ value: cloneFixture(obs.peek()), mode: 'set' });
            await settle();
            expect(state.getPendingChanges()).toEqual({});
            expect(state.error.peek()).toBeUndefined();
        });
        for (const deleted of [false, true])
            test(`a saved sibling response preserves pending Map membership deleted=${deleted}`, async () => {
                const initial = new Map([
                    ['x', { value: 0 }],
                    ['y', { value: 0 }],
                ]);
                const requests: { params: any; resolve: () => void }[] = [];
                const obs: any = observable();
                const state = syncObservable(obs, {
                    get: () => cloneFixture(initial),
                    set: (params) => new Promise<void>((resolve) => requests.push({ params, resolve })),
                });
                obs.get();
                await until(() => state.isLoaded.peek(), 'initial');
                if (deleted) obs.delete('x');
                else obs.set('x', undefined);
                await until(() => requests.length === 1, 'first set');
                obs.get('y').value.set(1);
                await until(() => requests.length === 2, 'second set');
                try {
                    requests[1].params.update({
                        value: new Map([
                            ['x', { value: 9 }],
                            ['y', { value: 1, server: 5 }],
                        ]),
                        changes: requests[1].params.changes,
                    });
                    requests[1].resolve();
                    await settle();
                    expect(obs.peek().has('x')).toBe(!deleted);
                    expect(obs.peek().get('x')).toBeUndefined();
                    expect(obs.peek().get('y')).toEqual({ value: 1, server: 5 });
                    expect(Object.keys(state.getPendingChanges()!)).toEqual(['x']);
                } finally {
                    requests.forEach(({ resolve }) => resolve());
                    await until(() => state.numPendingSets.peek() === 0, 'done');
                }
                expect(state.getPendingChanges()).toEqual({});
                expect(state.error.peek()).toBeUndefined();
            });
        for (const deleted of [false, true])
            test(`nil intent declines primitive ancestors before metadata changes deleted=${deleted}`, async () => {
                const initial = new Map<any, any>([
                    ['row', { inner: { x: 0 } }],
                    ['y', { value: 0 }],
                ]);
                let push: any;
                let release!: () => void;
                let requested = false;
                const obs: any = observable();
                const state = syncObservable(obs, {
                    get: () => cloneFixture(initial),
                    subscribe: ({ update }) => {
                        push = update;
                    },
                    set: () => {
                        requested = true;
                        return new Promise<void>((resolve) => {
                            release = resolve;
                        });
                    },
                });
                obs.get();
                await until(() => state.isLoaded.peek() && !!push, 'initial');
                if (deleted) obs.get('row').inner.x.delete();
                else obs.get('row').inner.x.set(undefined);
                await until(() => requested, 'set');
                try {
                    const entry = (state.getPendingChanges() as PendingChanges)['row/inner/x'];
                    const before = cloneFixture(entry);
                    const history = entry.h;
                    const live = obs.peek();
                    for (const value of [
                        new Map<any, any>([
                            ['row', 5],
                            ['y', { value: 5 }],
                        ]),
                        5,
                        null,
                    ]) {
                        push({ value, mode: 'set' });
                        await settle();
                        expect(obs.peek()).toBe(live);
                        expect(state.getPendingChanges()!['row/inner/x']).toBe(entry);
                        expect(entry).toEqual(before);
                        expect(entry.h).toBe(history);
                    }
                } finally {
                    release();
                    await until(() => state.numPendingSets.peek() === 0, 'done');
                }
                expect(state.getPendingChanges()).toEqual({});
                expect(state.error.peek()).toBeUndefined();
            });
        for (const key of ['constructor', 'pendingAncestor'])
            test(`nil intent creates own containers without following inherited ancestors key=${key}`, async () => {
                const marker = 'pendingCanonicalLeaf';
                const ambient: any = {};
                const previous = Object.getOwnPropertyDescriptor(Object.prototype, key);
                const objectLeaf = Object.getOwnPropertyDescriptor(Object, marker);
                let inheritedReads = 0;
                const initial = new Map<any, any>([['row', { [key]: { [marker]: 0 } }]]);
                let push: any;
                let release!: () => void;
                let requested = false;
                const obs: any = observable();
                const state = syncObservable(obs, {
                    get: () => cloneFixture(initial),
                    subscribe: ({ update }) => {
                        push = update;
                    },
                    set: () => {
                        requested = true;
                        return new Promise<void>((resolve) => {
                            release = resolve;
                        });
                    },
                });
                obs.get();
                await until(() => state.isLoaded.peek() && !!push, 'initial');
                if (key === 'constructor') obs.get('row').assign({ [key]: undefined });
                else obs.get('row')[key][marker].set(undefined);
                await until(() => requested, 'set');
                if (key === 'pendingAncestor')
                    Object.defineProperty(Object.prototype, key, {
                        configurable: true,
                        get: () => {
                            inheritedReads++;
                            return ambient;
                        },
                    });
                try {
                    push({ value: new Map<any, any>([['row', {}]]), mode: 'set' });
                    await settle();
                    const row = obs.peek().get('row');
                    expect(Object.prototype.hasOwnProperty.call(row, key)).toBe(true);
                    if (key === 'constructor') expect(row[key]).toBeUndefined();
                    else {
                        expect(Object.prototype.hasOwnProperty.call(row[key], marker)).toBe(true);
                        expect(row[key][marker]).toBeUndefined();
                    }
                    expect(inheritedReads).toBe(0);
                    expect(Object.prototype.hasOwnProperty.call(ambient, marker)).toBe(false);
                    expect(Object.getOwnPropertyDescriptor(Object, marker)).toEqual(objectLeaf);
                } finally {
                    if (previous) Object.defineProperty(Object.prototype, key, previous);
                    else delete (Object.prototype as any)[key];
                    if (objectLeaf) Object.defineProperty(Object, marker, objectLeaf);
                    else delete (Object as any)[marker];
                    release();
                    await until(() => state.numPendingSets.peek() === 0, 'done');
                }
                expect(state.getPendingChanges()).toEqual({});
                expect(state.error.peek()).toBeUndefined();
            });
        for (const deleted of [false, true])
            test(`a sibling ACK declines primitive nil ancestors without applying normalization deleted=${deleted}`, async () => {
                const initial = new Map<any, any>([
                    ['row', { inner: { x: 0 } }],
                    ['y', { value: 0 }],
                ]);
                const requests: { params: any; resolve: () => void }[] = [];
                const obs: any = observable();
                const state = syncObservable(obs, {
                    get: () => cloneFixture(initial),
                    set: (params) => new Promise<void>((resolve) => requests.push({ params, resolve })),
                });
                obs.get();
                await until(() => state.isLoaded.peek(), 'initial');
                if (deleted) obs.get('row').inner.x.delete();
                else obs.get('row').inner.x.set(undefined);
                await until(() => requests.length === 1, 'first set');
                obs.get('y').value.set(1);
                await until(() => requests.length === 2, 'sibling set');
                try {
                    const pending = state.getPendingChanges()!['row/inner/x'];
                    const before = cloneFixture(pending);
                    requests[1].params.update({
                        value: new Map<any, any>([
                            ['row', 5],
                            ['y', { value: 1, server: 5 }],
                        ]),
                        changes: requests[1].params.changes,
                    });
                    requests[1].resolve();
                    await until(() => state.numPendingSets.peek() === 1, 'sibling acknowledged');
                    expect(Object.prototype.hasOwnProperty.call(obs.peek().get('row').inner, 'x')).toBe(!deleted);
                    expect(obs.peek().get('row').inner.x).toBeUndefined();
                    expect(obs.peek().get('y')).toEqual({ value: 1 });
                    expect(state.getPendingChanges()!['row/inner/x']).toBe(pending);
                    expect(pending).toEqual(before);
                    expect(state.error.peek()).toBeUndefined();
                } finally {
                    requests.forEach(({ resolve }) => resolve());
                    await until(() => state.numPendingSets.peek() === 0, 'done');
                }
                expect(state.getPendingChanges()).toEqual({});
            });
        for (const key of ['x', 1])
            test(`a filtered list omission preserves UPDATE intent through JSON persistence key=${typeof key}`, async () => {
                const sibling = key === 1 ? '1' : 'y';
                const backend = new Map<any, any>([
                    [key, { id: key, value: 0, other: 7 }],
                    [sibling, { id: sibling, value: 0 }],
                ]);
                class JsonPersist {
                    table = internal.safeStringify(backend);
                    metadata = '{}';
                    getTable() {
                        return safeParse(this.table);
                    }
                    getMetadata() {
                        return safeParse(this.metadata);
                    }
                    set(_name: string, changes: any[]) {
                        this.table = internal.safeStringify(applyChanges(safeParse(this.table), changes));
                    }
                    setMetadata(_name: string, metadata: any) {
                        this.metadata = internal.safeStringify(metadata);
                    }
                    deleteTable() {}
                    deleteMetadata() {}
                }
                const store = new JsonPersist();
                const failure = Error('transient update unavailable');
                const errors: any[] = [];
                let filtered = false;
                let updates = 0;
                let creates = 0;
                const list = () =>
                    Array.from(backend.values())
                        .filter((row) => !filtered || row.id !== key)
                        .map((row) => ({ ...row }));
                const obs: any = observable(
                    syncedCrud({
                        as: 'Map',
                        list,
                        update: async () => {
                            updates++;
                            throw failure;
                        },
                        create: async () => {
                            creates++;
                            throw Error('unexpected create');
                        },
                        persist: { name: getPersistName(), plugin: store, retrySync: true },
                        onError: (error) => errors.push(error),
                    }),
                );
                obs.get();
                const state = syncState(obs);
                await until(() => state.isLoaded.peek(), 'initial');
                await settle();
                obs.get(key).value.set(1);
                await until(() => updates === 1 && !state.isSetting.peek(), 'failed update settled');
                filtered = true;
                backend.set(sibling, { id: sibling, value: 6 });
                state.sync();
                await until(() => obs.peek().get(sibling)?.value === 6, 'filtered refresh');
                await settle();
                expect(backend.get(key)).toEqual({ id: key, value: 0, other: 7 });
                expect(obs.peek().get(key)).toEqual({ id: key, value: 1, other: 7 });
                expect(obs.peek().get(sibling)).toEqual({ id: sibling, value: 6 });
                const leaf = (state.getPendingChanges() as PendingChanges)[String(key) + '/value'];
                expect(leaf.k).toEqual([key, 'value']);
                expect(leaf.c).toBe(true);
                expect(leaf.v).toBe(1);
                expect(errors).toEqual([failure]);
                expect([updates, creates]).toEqual([1, 0]);
                const fresh = new JsonPersist();
                fresh.table = store.table;
                fresh.metadata = store.metadata;
                let replay: any;
                let release!: () => void;
                let replayUpdates = 0;
                let replayCreates = 0;
                const replayErrors: any[] = [];
                const restarted: any = observable(
                    syncedCrud({
                        as: 'Map',
                        list,
                        update: (row) => {
                            replayUpdates++;
                            replay = row;
                            return new Promise<void>((resolve) => {
                                release = () => {
                                    backend.set(row.id, { ...backend.get(row.id), ...row });
                                    resolve();
                                };
                            });
                        },
                        create: async (row) => {
                            replayCreates++;
                            if (backend.has(row.id)) throw Error('duplicate existing row');
                            backend.set(row.id, row);
                        },
                        persist: { name: getPersistName(), plugin: fresh, retrySync: true },
                        onError: (error) => replayErrors.push(error),
                    }),
                );
                restarted.get();
                const next = syncState(restarted);
                try {
                    await until(() => replayUpdates + replayCreates > 0, 'replay action');
                    expect([replayUpdates, replayCreates]).toEqual([1, 0]);
                    expect(replay).toEqual({ id: key, value: 1, other: 7 });
                    expect(restarted.peek().get(key)).toEqual({ id: key, value: 1, other: 7 });
                    expect(restarted.peek().get(sibling)).toEqual({ id: sibling, value: 6 });
                } finally {
                    release?.();
                    await until(() => next.numPendingSets.peek() === 0, 'replay settled');
                }
                expect(next.getPendingChanges()).toEqual({});
                expect(next.error.peek()).toBeUndefined();
                expect(replayErrors).toEqual([]);
                expect(backend.get(key)).toEqual({ id: key, value: 1, other: 7 });
                filtered = false;
                state.sync();
                await until(() => Object.keys(state.getPendingChanges() || {}).length === 0, 'original confirmation');
                expect(state.numPendingSets.peek()).toBe(0);
            });
        describe('partial canonical child updates', () => {
            const setup = async (mode: 'merge' | 'assign', kind: 'value' | 'undefined' | 'delete') => {
                const initial = new Map<any, any>([
                    ['r', { id: 'r', meta: { color: 0, shade: 7 }, other: 0 }],
                    ['y', { value: 0 }],
                ]);
                const store = new Persist();
                store.table = cloneFixture(initial);
                let push: any;
                let release!: () => void;
                let requests = 0;
                let version = 0;
                let remote = initial;
                const errors: any[] = [];
                const obs: any = observable();
                const state = syncObservable(obs, {
                    mode,
                    get: (params) => {
                        if (version) params.updateLastSync(version);
                        return cloneFixture(remote);
                    },
                    subscribe: ({ update }) => {
                        push = update;
                    },
                    set: () =>
                        new Promise<void>((resolve) => {
                            requests++;
                            release = resolve;
                        }),
                    persist: { name: getPersistName(), plugin: store, retrySync: true },
                    onError: (error) => errors.push(error),
                });
                obs.get();
                await until(() => state.isLoaded.peek() && !!push, 'initial');
                await settle();
                if (kind === 'delete') obs.get('r').meta.color.delete();
                else obs.get('r').meta.color.set(kind === 'undefined' ? undefined : 1);
                await until(() => requests === 1, 'local save');
                return {
                    obs,
                    state,
                    store,
                    errors,
                    update: async (value: Map<any, any>, source = 'subscribe') => {
                        if (source === 'get') {
                            remote = value;
                            version = 6;
                            state.sync();
                        } else push({ value, mode, lastSync: 6 });
                        await settle();
                        await settle();
                    },
                    finish: async () => {
                        release();
                        await until(() => state.numPendingSets.peek() === 0, 'done');
                    },
                };
            };
            for (const mode of ['merge', 'assign'] as const)
                for (const kind of ['value', 'undefined', 'delete'] as const)
                    for (const empty of [false, true])
                        test(`${mode} keeps canonical ${kind} intent when a supplied row omits its parent empty=${empty}`, async () => {
                            const { obs, state, store, errors, update, finish } = await setup(mode, kind);
                            try {
                                await update(
                                    new Map<any, any>([
                                        ['r', empty ? {} : { other: 9 }],
                                        ['y', { value: 6 }],
                                    ]),
                                );
                                const meta: any = { shade: 7 };
                                if (kind !== 'delete') meta.color = kind === 'value' ? 1 : undefined;
                                const expected =
                                    mode === 'merge'
                                        ? { id: 'r', meta, other: empty ? 0 : 9 }
                                        : { ...(empty ? {} : { other: 9 }), ...(kind === 'delete' ? {} : { meta }) };
                                expect(obs.peek().get('r')).toEqual(expected);
                                if (kind !== 'delete' || mode === 'merge')
                                    expect(
                                        Object.prototype.hasOwnProperty.call(obs.peek().get('r').meta, 'color'),
                                    ).toBe(kind !== 'delete');
                                expect(obs.peek().get('y')).toEqual({ value: 6 });
                                expect(state.lastSync.peek()).toBe(6);
                                expect(store.metadata.lastSync).toBe(6);
                                const entry = (state.getPendingChanges() as PendingChanges)['r/meta/color'];
                                if (mode === 'assign' && kind === 'delete') expect(entry).toBeUndefined();
                                else {
                                    expect(entry.k).toEqual(['r', 'meta', 'color']);
                                    expect(entry.v).toBe(kind === 'value' ? 1 : undefined);
                                    expect(entry.d).toBe(kind === 'delete' ? true : undefined);
                                }
                                expect(errors).toEqual([]);
                            } finally {
                                await finish();
                            }
                            expect(state.getPendingChanges()).toEqual({});
                        });
            for (const mode of ['merge', 'assign'] as const)
                test(`${mode} GET advances unrelated rows without a missing-child acknowledgement`, async () => {
                    const { obs, state, errors, update, finish } = await setup(mode, 'value');
                    try {
                        await update(
                            new Map<any, any>([
                                ['r', { other: 9 }],
                                ['y', { value: 6 }],
                            ]),
                            'get',
                        );
                        expect(obs.peek().get('r').meta).toEqual({ color: 1, shade: 7 });
                        expect(obs.peek().get('y')).toEqual({ value: 6 });
                        expect(state.lastSync.peek()).toBe(6);
                        expect(state.numPendingGets.peek()).toBe(0);
                        expect((state.getPendingChanges() as PendingChanges)['r/meta/color'].k).toEqual([
                            'r',
                            'meta',
                            'color',
                        ]);
                        expect(errors).toEqual([]);
                    } finally {
                        await finish();
                    }
                });
            for (const mode of ['merge', 'assign'] as const)
                for (const kind of ['value', 'undefined', 'delete'] as const)
                    test(`${mode} omission of the entire row leaves ${kind} intent unacknowledged`, async () => {
                        const { obs, state, errors, update, finish } = await setup(mode, kind);
                        try {
                            const before = cloneFixture(obs.peek().get('r'));
                            const entry = state.getPendingChanges()!['r/meta/color'];
                            const metadata = cloneFixture(entry);
                            await update(new Map<any, any>([['y', { value: 6 }]]));
                            expect(obs.peek().get('r')).toEqual(before);
                            expect(obs.peek().get('y')).toEqual({ value: 6 });
                            expect(state.getPendingChanges()!['r/meta/color']).toBe(entry);
                            expect(entry).toEqual(metadata);
                            expect(state.lastSync.peek()).toBe(6);
                            expect(errors).toEqual([]);
                        } finally {
                            await finish();
                        }
                    });
            for (const mode of ['merge', 'assign'] as const)
                for (const kind of ['value', 'undefined'] as const)
                    for (const meta of [null, undefined, 5])
                        test(`${mode} preserves the conservative explicit ancestor boundary kind=${kind} meta=${meta}`, async () => {
                            const { obs, state, errors, update, finish } = await setup(mode, kind);
                            try {
                                const before = cloneFixture(obs.peek());
                                const entry = state.getPendingChanges()!['r/meta/color'];
                                const metadata = cloneFixture(entry);
                                await update(
                                    new Map<any, any>([
                                        ['r', { meta, other: 9 }],
                                        ['y', { value: 6 }],
                                    ]),
                                );
                                expect(obs.peek()).toEqual(before);
                                expect(state.getPendingChanges()!['r/meta/color']).toBe(entry);
                                expect(entry).toEqual(metadata);
                                expect(state.lastSync.peek()).not.toBe(6);
                                expect(errors).toEqual([]);
                            } finally {
                                await finish();
                            }
                        });
        });
        test('own undefined restores its full omitted parent while retaining durable leaf identity', async () => {
            const initial = new Map<any, any>([
                ['x', { id: 'x', value: 0, other: 7 }],
                ['y', { value: 0 }],
            ]);
            const store = new Persist();
            store.table = cloneFixture(initial);
            let push: any;
            let release!: () => void;
            let requested = false;
            const obs: any = observable();
            const state = syncObservable(obs, {
                get: () => cloneFixture(initial),
                subscribe: ({ update }) => {
                    push = update;
                },
                set: () => {
                    requested = true;
                    return new Promise<void>((resolve) => {
                        release = resolve;
                    });
                },
                persist: { name: getPersistName(), plugin: store, retrySync: true },
            });
            obs.get();
            await until(() => state.isLoaded.peek() && !!push, 'initial');
            obs.get('x').value.set(undefined);
            await until(() => requested, 'set');
            try {
                push({ value: new Map([['y', { value: 6 }]]), mode: 'set' });
                await settle();
                expect(obs.peek().get('x')).toEqual({ id: 'x', value: undefined, other: 7 });
                expect(Object.prototype.hasOwnProperty.call(obs.peek().get('x'), 'value')).toBe(true);
                expect(obs.peek().get('y').value).toBe(6);
                const fresh = new Persist();
                fresh.table = cloneFixture(initial);
                fresh.metadata = safeParse(internal.safeStringify(store.metadata));
                expect((fresh.metadata.pending['x/value'] as PendingChanges[string]).c).toBe(true);
                let replay: any;
                let releaseReplay!: () => void;
                const restarted: any = observable();
                const next = syncObservable(restarted, {
                    get: () => new Map([['y', { value: 7 }]]),
                    persist: { name: getPersistName(), plugin: fresh, retrySync: true },
                    set: (params) => {
                        replay = params;
                        return new Promise<void>((resolve) => {
                            releaseReplay = resolve;
                        });
                    },
                });
                try {
                    restarted.get();
                    await until(() => !!replay, 'replay');
                    expect(restarted.peek().get('x')).toEqual({ id: 'x', value: undefined, other: 7 });
                    expect(Object.prototype.hasOwnProperty.call(restarted.peek().get('x'), 'value')).toBe(true);
                    expect(replay.changes[0].path).toEqual(['x', 'value']);
                } finally {
                    releaseReplay?.();
                    await until(() => next.numPendingSets.peek() === 0, 'replay settled');
                }
                expect(next.getPendingChanges()).toEqual({});
            } finally {
                release();
                await until(() => state.numPendingSets.peek() === 0, 'original settled');
            }
            push({ value: cloneFixture(obs.peek()), mode: 'set' });
            await settle();
            expect(state.getPendingChanges()).toEqual({});
            expect(state.error.peek()).toBeUndefined();
        });
        test('a deeper explicit deleted ancestor retains its conservative restoration boundary', async () => {
            const initial = new Map<any, any>([
                ['row', { inner: { x: 0 }, other: 7 }],
                ['y', { value: 0 }],
            ]);
            let push: any;
            let release!: () => void;
            let requested = false;
            const obs: any = observable();
            const state = syncObservable(obs, {
                get: () => cloneFixture(initial),
                subscribe: ({ update }) => {
                    push = update;
                },
                set: () => {
                    requested = true;
                    return new Promise<void>((resolve) => {
                        release = resolve;
                    });
                },
            });
            obs.get();
            await until(() => state.isLoaded.peek() && !!push, 'initial');
            obs.get('row').inner.x.set(1);
            await until(() => requested, 'set');
            try {
                const live = obs.peek();
                const entry = state.getPendingChanges()!['row/inner/x'];
                const before = cloneFixture(entry);
                push({
                    value: new Map<any, any>([
                        ['row', symbolDelete],
                        ['y', { value: 6 }],
                    ]),
                    mode: 'set',
                });
                await settle();
                expect(obs.peek()).toBe(live);
                expect(state.getPendingChanges()!['row/inner/x']).toBe(entry);
                expect(entry).toEqual(before);
                expect(state.error.peek()).toBeUndefined();
            } finally {
                release();
                await until(() => state.numPendingSets.peek() === 0, 'done');
            }
            expect(state.getPendingChanges()).toEqual({});
        });
        test('a final overlapping ACK declines primitive normalization through the second overlay loop', async () => {
            const requests: { params: any; resolve: () => void }[] = [];
            const errors: any[] = [];
            const obs: any = observable();
            const state = syncObservable(obs, {
                get: () =>
                    new Map([
                        ['x', { inner: { value: 0 } }],
                        ['y', { inner: { value: 0 } }],
                    ]),
                set: (params) => new Promise<void>((resolve) => requests.push({ params, resolve })),
                onError: (error) => errors.push(error),
            });
            obs.get();
            await until(() => state.isLoaded.peek(), 'initial');
            await settle();
            obs.get('x').inner.value.set(1);
            await until(() => requests.length === 1, 'first set');
            obs.get('y').inner.value.set(1);
            await until(() => requests.length === 2 && state.numPendingSets.peek() === 2, 'overlapping set');
            try {
                requests[0].resolve();
                await until(() => state.numPendingSets.peek() === 1, 'first acknowledged');
                expect(state.getPendingChanges()!['x/inner/value']).toBeUndefined();
                expect(state.getPendingChanges()!['y/inner/value']).toBeDefined();
                requests[1].params.update({
                    value: new Map<any, any>([
                        ['x', { inner: { value: 1 }, server: 6 }],
                        ['y', 5],
                    ]),
                });
                requests[1].resolve();
                await until(() => state.numPendingSets.peek() === 0, 'final acknowledged');
                expect(obs.peek()).toEqual(
                    new Map([
                        ['x', { inner: { value: 1 } }],
                        ['y', { inner: { value: 1 } }],
                    ]),
                );
                expect(errors).toEqual([]);
                expect(state.error.peek()).toBeUndefined();
                expect(state.getPendingChanges()).toEqual({});
                expect(state.isSetting.peek()).toBe(false);
                expect(requests.length).toBe(2);
            } finally {
                requests.forEach(({ resolve }) => resolve());
                await until(() => state.numPendingSets.peek() === 0, 'done');
            }
        });
        test('a sibling ACK declines primitive nonnil ancestors without applying normalization', async () => {
            const initial = new Map<any, any>([
                ['row', { inner: { x: 0 } }],
                ['y', { value: 0 }],
            ]);
            const requests: { params: any; resolve: () => void }[] = [];
            const obs: any = observable();
            const state = syncObservable(obs, {
                get: () => cloneFixture(initial),
                set: (params) => new Promise<void>((resolve) => requests.push({ params, resolve })),
            });
            obs.get();
            await until(() => state.isLoaded.peek(), 'initial');
            obs.get('row').inner.x.set(1);
            await until(() => requests.length === 1, 'first set');
            obs.get('y').value.set(1);
            await until(() => requests.length === 2, 'sibling set');
            try {
                const pending = state.getPendingChanges()!['row/inner/x'];
                const before = cloneFixture(pending);
                requests[1].params.update({
                    value: new Map<any, any>([
                        ['row', 5],
                        ['y', { value: 1, server: 5 }],
                    ]),
                    changes: requests[1].params.changes,
                });
                requests[1].resolve();
                await until(() => state.numPendingSets.peek() === 1, 'sibling acknowledged');
                expect(Object.prototype.hasOwnProperty.call(obs.peek().get('row').inner, 'x')).toBe(true);
                expect(obs.peek().get('row').inner.x).toBe(1);
                expect(obs.peek().get('y')).toEqual({ value: 1 });
                expect(state.getPendingChanges()!['row/inner/x']).toBe(pending);
                expect(pending).toEqual(before);
                expect(state.error.peek()).toBeUndefined();
            } finally {
                requests.forEach(({ resolve }) => resolve());
                await until(() => state.numPendingSets.peek() === 0, 'done');
            }
            expect(state.getPendingChanges()).toEqual({});
        });
        test('a canonical nonnil ACK overlay creates own ancestors without calling inherited getters', async () => {
            const key = 'pendingAckAncestor';
            const previous = Object.getOwnPropertyDescriptor(Object.prototype, key);
            const ambient = { x: 0 };
            let inheritedReads = 0;
            const requests: { params: any; resolve: () => void }[] = [];
            const initial = new Map<any, any>([
                ['row', { [key]: { x: 0 }, other: 7 }],
                ['y', { value: 0 }],
            ]);
            const obs: any = observable();
            const state = syncObservable(obs, {
                get: () => cloneFixture(initial),
                set: (params) => new Promise<void>((resolve) => requests.push({ params, resolve })),
            });
            obs.get();
            await until(() => state.isLoaded.peek(), 'initial');
            obs.get('row')[key].x.set(1);
            await until(() => requests.length === 1, 'first set');
            obs.get('y').value.set(1);
            await until(() => requests.length === 2, 'sibling set');
            Object.defineProperty(Object.prototype, key, {
                configurable: true,
                get: () => {
                    inheritedReads++;
                    return ambient;
                },
            });
            try {
                requests[1].params.update({
                    value: new Map<any, any>([
                        ['row', {}],
                        ['y', { value: 1, server: 5 }],
                    ]),
                    changes: requests[1].params.changes,
                });
                requests[1].resolve();
                await until(() => state.numPendingSets.peek() === 1, 'sibling acknowledged');
                expect(ambient).toEqual({ x: 0 });
                expect(inheritedReads).toBe(0);
                expect(obs.peek().get('row')).toEqual({ [key]: { x: 1 }, other: 7 });
                expect(obs.peek().get('y')).toEqual({ value: 1, server: 5 });
                expect(state.error.peek()).toBeUndefined();
            } finally {
                if (previous) Object.defineProperty(Object.prototype, key, previous);
                else delete (Object.prototype as any)[key];
                requests.forEach(({ resolve }) => resolve());
                await until(() => state.numPendingSets.peek() === 0, 'done');
            }
            expect(state.getPendingChanges()).toEqual({});
        });
        for (const [nil, terminal] of [
            [false, false],
            [true, false],
            [true, true],
        ])
            test(`a legacy pending ACK overlay declines primitive ancestors nil=${nil} terminalSkip=${terminal}`, async () => {
                const value = nil ? undefined : 1;
                const path = terminal ? 'row/x' : 'row/inner/x';
                const store = new Persist();
                store.table = { row: terminal ? { x: value } : { inner: { x: value } }, y: { value: 0 } };
                store.metadata = {
                    pending: {
                        [path]: {
                            p: 0,
                            v: value,
                            t: terminal ? ['object', 'object'] : ['object', 'object', 'object'],
                            h: [],
                            c: true,
                        },
                    },
                };
                const requests: { params: any; resolve: () => void }[] = [];
                const obs: any = observable();
                const state = syncObservable(obs, {
                    get: () => ({ row: terminal ? { x: 0 } : { inner: { x: 0 } }, y: { value: 0 } }),
                    persist: { name: getPersistName(), plugin: store, retrySync: true },
                    set: (params) => new Promise<void>((resolve) => requests.push({ params, resolve })),
                });
                obs.get();
                await until(() => requests.length === 1, 'legacy replay');
                expect((state.getPendingChanges() as PendingChanges)[path].k).toBeUndefined();
                obs.y.value.set(1);
                await until(() => requests.length === 2, 'sibling set');
                try {
                    const entry = state.getPendingChanges()![path];
                    const before = cloneFixture(entry);
                    requests[1].params.update({
                        value: { row: 5, y: { value: 1, server: 5 } },
                        changes: requests[1].params.changes,
                    });
                    requests[1].resolve();
                    await until(() => state.numPendingSets.peek() === 1, 'sibling acknowledged');
                    expect(obs.peek().row).toEqual(terminal ? 5 : { inner: { x: value } });
                    expect(obs.peek().y).toEqual(terminal ? { value: 1, server: 5 } : { value: 1 });
                    expect(state.getPendingChanges()![path]).toBe(entry);
                    expect(entry).toEqual(before);
                    expect(state.error.peek()).toBeUndefined();
                } finally {
                    requests.forEach(({ resolve }) => resolve());
                    await until(() => state.numPendingSets.peek() === 0, 'done');
                }
                expect(state.getPendingChanges()).toEqual({});
            });
        test('a remote deleted parent preserves its typed restored owner through replay', async () => {
            const initial = new Map<any, any>([
                [1, { id: 1, value: 0, other: 7 }],
                ['1', { id: '1', value: 0 }],
            ]);
            const requests: { params: any; resolve: () => void }[] = [];
            const store = new Persist();
            store.table = cloneFixture(initial);
            let push: any;
            const obs: any = observable();
            const state = syncObservable(obs, {
                get: () => cloneFixture(initial),
                persist: { name: 'typed-parent', plugin: store, retrySync: true },
                subscribe: ({ update }) => {
                    push = update;
                },
                set: (params) => new Promise<void>((resolve) => requests.push({ params, resolve })),
            });
            obs.get();
            await until(() => state.isLoaded.peek() && !!push, 'initial');
            obs.get(1).value.set(1);
            await until(() => requests.length === 1, 'first set');
            try {
                push({
                    value: new Map<any, any>([
                        [1, symbolDelete],
                        ['1', { id: '1', value: 5 }],
                    ]),
                    mode: 'set',
                });
                await settle();
                expect(obs.peek().get(1)).toEqual({ id: 1, value: 1, other: 7 });
                expect(obs.peek().get('1')).toEqual({ id: '1', value: 5 });
                expect((state.getPendingChanges()!['1'] as any).k).toEqual([1]);
                const fresh = new Persist();
                fresh.table = cloneFixture(store.table);
                fresh.metadata = cloneFixture(store.metadata);
                let replay: any;
                let releaseReplay!: () => void;
                const restarted: any = observable();
                const restartState = syncObservable(restarted, {
                    get: () => cloneFixture(initial),
                    persist: { name: 'typed-parent-restart', plugin: fresh, retrySync: true },
                    set: (params) => {
                        replay = params;
                        return new Promise<void>((resolve) => {
                            releaseReplay = resolve;
                        });
                    },
                });
                try {
                    restarted.get();
                    await until(() => !!replay, 'restored owner replay');
                    expect(replay.changes[0].path).toEqual([1]);
                    replay.changes[0].path[0] = 'changed';
                    expect((restartState.getPendingChanges()!['1'] as any).k).toEqual([1]);
                    replay.changes[0].path[0] = 1;
                    expect(restarted.peek().get(1)).toEqual({ id: 1, value: 1, other: 7 });
                } finally {
                    releaseReplay?.();
                    await until(() => restartState.numPendingSets.peek() === 0, 'replay done');
                }
                expect(restartState.getPendingChanges()).toEqual({});
            } finally {
                requests.forEach(({ resolve }) => resolve());
                await until(() => state.numPendingSets.peek() === 0, 'done');
            }
            expect(Object.keys(state.getPendingChanges()!)).toEqual(['1']);
            expect((state.getPendingChanges()!['1'] as any).k).toEqual([1]);
            expect(state.error.peek()).toBeUndefined();
        });
        for (const repeated of [false, true])
            test(`ordinary root changes do not acquire canonical child fields repeated=${repeated}`, async () => {
                let sent: any;
                let release!: () => void;
                const obs: any = observable();
                const state = syncObservable(obs, {
                    get: () => ({ value: 0 }),
                    set: (params) => {
                        sent = params;
                        return new Promise<void>((resolve) => {
                            release = resolve;
                        });
                    },
                });
                obs.get();
                await until(() => state.isLoaded.peek(), 'initial');
                obs.set({ value: 1 });
                if (repeated) obs.set({ value: 2 });
                await until(() => !!sent, 'set');
                try {
                    expect(Object.prototype.hasOwnProperty.call(sent.changes[0], 'k')).toBe(false);
                    expect(Object.prototype.hasOwnProperty.call(sent.changes[0], 'd')).toBe(false);
                    expect(Object.prototype.hasOwnProperty.call(state.getPendingChanges()![''], 'k')).toBe(false);
                    expect(Object.prototype.hasOwnProperty.call(state.getPendingChanges()![''], 'd')).toBe(false);
                } finally {
                    release();
                    await until(() => state.numPendingSets.peek() === 0, 'done');
                }
                expect(state.getPendingChanges()).toEqual({});
            });
    });
    describe('accepted server siblings through replay', () => {
        for (const map of [false, true])
            for (const renamed of [false, true])
                test(`generic replay retains accepted sibling map=${map} renamed=${renamed}`, async () => {
                    const fromEntries = (x: any[]) => (map ? new Map(x) : Object.fromEntries(x));
                    const entries = (x: any): any[] => (x instanceof Map ? [...x] : Object.entries(x));
                    const data = (a: number, b: number) =>
                        fromEntries([
                            ['a', { value: a }],
                            ['b', { value: b }],
                        ]);
                    const row = (x: any, k: string) => (x instanceof Map ? x.get(k) : x[k]);
                    const wire = (x: any, save: boolean) =>
                        (save ? Object.fromEntries : fromEntries)(
                            entries(x).map(([k, v]) => [
                                save ? 'wire_' + k : k.replace(/^wire_/, ''),
                                { value: v.value * (save ? 10 : 0.1) },
                            ]),
                        );
                    const transform = renamed
                        ? { save: (x: any) => wire(x, true), load: (x: any) => wire(x, false) }
                        : undefined;
                    const store = new Persist();
                    const requests: any[] = [];
                    let push!: (p: any) => void;
                    const obs: any = observable(
                        synced({
                            get: () => (renamed ? wire(data(0, 0), true) : data(0, 0)),
                            transform,
                            subscribe: (p) => {
                                push = p.update;
                            },
                            set: (params) => new Promise<void>((resolve) => requests.push({ params, resolve })),
                            persist: { name: 'restart-a' + map + renamed, plugin: store, retrySync: true },
                        }),
                    );
                    obs.get();
                    const state = syncState(obs);
                    await when(state.isLoaded);
                    obs.set(data(1, 1));
                    await when(state.isSetting);
                    (map ? obs.get('a') : obs.a).value.set(2);
                    await settle();
                    requests[0].params.update({
                        value: fromEntries([['b', { value: 3 }]]),
                        changes: requests[0].params.changes,
                        failedChanges: requests[0].params.changes,
                    });
                    requests[0].resolve();
                    await settle();
                    push({ value: renamed ? wire(data(0, 4), true) : data(0, 4), mode: 'set' });
                    await settle();
                    const copied = cloneFixture({ table: store.table, metadata: store.metadata });
                    requests[1].resolve();
                    await settle();
                    const fresh = new Persist();
                    fresh.table = cloneFixture(copied.table);
                    fresh.metadata = cloneFixture(copied.metadata);
                    let server: any = renamed ? wire(data(0, 5), true) : data(0, 5);
                    const sent: any[] = [];
                    const restarted: any = observable(
                        synced({
                            get: () => cloneFixture(server),
                            transform: {
                                save: transform?.save,
                                load: async (value: any) => {
                                    await tick();
                                    return renamed ? wire(value, false) : value;
                                },
                            },
                            set: (params) => {
                                sent.push(cloneFixture({ value: params.value, changes: params.changes }));
                                server = applyChanges(server, params.changes);
                                params.update({
                                    value: renamed ? wire(server, false) : cloneFixture(server),
                                    changes: params.changes,
                                });
                            },
                            persist: { name: 'restart-b' + map + renamed, plugin: fresh, retrySync: true },
                        }),
                    );
                    restarted.get();
                    const freshState = syncState(restarted);
                    await when(freshState.isLoaded);
                    await settle();
                    await settle();
                    const serverLocal = renamed ? wire(server, false) : server;

                    expect(sent.length).toBeGreaterThan(0);
                    expect(row(serverLocal, 'b').value).toBe(5);
                    expect(row(restarted.peek(), 'b').value).toBe(5);
                    expect(row(copied.table, 'b').value).toBe(4);
                    expect(row(copied.metadata.pending[''].p, 'b').value).toBe(4);
                    expect(row(copied.metadata.pending[''].v, 'b').value).toBe(4);
                    expect(freshState.getPendingChanges()).toEqual({});
                    expect(freshState.numPendingSets.peek()).toBe(0);
                });
    });

    describe('durable intent before cache completion', () => {
        describe('restored child pending paths', () => {
            async function interruptedChild(initial: any, change: (obs: any) => void) {
                let hold = false;
                let release!: () => void;
                class HeldCache extends Persist {
                    override set(name: string, changes: any[]) {
                        if (hold) {
                            hold = false;
                            return new Promise<void>((resolve) => {
                                release = () => {
                                    super.set(name, changes);
                                    resolve();
                                };
                            });
                        }
                        return super.set(name, changes);
                    }
                }
                const cache = new HeldCache();
                cache.table = cloneFixture(initial);
                const obs: any = observable(cloneFixture(initial));
                const state = syncObservable(obs, {
                    get: () => cloneFixture(initial),
                    set: () => undefined,
                    persist: { name: 'child-intent-before-cache', plugin: cache, retrySync: true },
                });
                await when(state.isLoaded);
                await settle();
                hold = true;
                change(obs);
                await settle();
                expect(typeof release).toBe('function');
                const copied = cloneFixture({ table: cache.table, metadata: cache.metadata });
                release();
                await settle();
                return copied;
            }
            for (const key of [1, '1', 'size'])
                test(`Map child keeps its key through cache recovery and replay key=${typeof key}:${key}`, async () => {
                    const initial = new Map<any, any>([[key, { value: 0 }]]);
                    const copied = await interruptedChild(initial, (obs) => obs.get(key).value.set(1));
                    const cache = new Persist();
                    cache.table = copied.table;
                    cache.metadata = copied.metadata;
                    let finish!: (value: any) => void;
                    let server = cloneFixture(initial);
                    const obs: any = observable(cloneFixture(initial));
                    const state = syncObservable(obs, {
                        get: () =>
                            new Promise<any>((resolve) => {
                                finish = resolve;
                            }),
                        set: (params) => {
                            server = applyChanges(server, params.changes);
                            params.update({ value: cloneFixture(server), changes: params.changes });
                        },
                        persist: { name: 'replay-child-key', plugin: cache, retrySync: true },
                    });
                    await when(state.isPersistLoaded);
                    try {
                        expect(obs.peek().get(key).value).toBe(1);
                        expect([...obs.peek().keys()]).toEqual([key]);
                    } finally {
                        finish(cloneFixture(initial));
                        await when(state.isLoaded);
                        await settle();
                        await settle();
                    }
                    expect(server.get(key).value).toBe(1);
                    expect([...server.keys()]).toEqual([key]);
                    expect([...obs.peek().keys()]).toEqual([key]);
                    expect(state.getPendingChanges()).toEqual({});
                    expect(state.numPendingSets.peek()).toBe(0);
                    expect(state.error.peek()).toBeUndefined();
                });
            for (const legacy of [false, true])
                test(`ambiguous legacy Map intent is retained without inventing a key legacy=${legacy}`, async () => {
                    const initial = new Map<any, any>([
                        [1, { value: 0 }],
                        ['1', { value: 0 }],
                    ]);
                    const numeric = await interruptedChild(initial, (obs) => obs.get(1).value.set(1));
                    const string = await interruptedChild(initial, (obs) => obs.get('1').value.set(1));
                    // These snapshots intentionally model metadata written before canonical paths.
                    delete numeric.metadata.pending['1/value'].k;
                    delete string.metadata.pending['1/value'].k;
                    expect(internal.safeStringify(numeric.table)).toBe(internal.safeStringify(string.table));
                    expect(internal.safeStringify(numeric.metadata)).toBe(internal.safeStringify(string.metadata));
                    if (legacy) delete numeric.metadata.pending['1/value'].h;
                    const cache = new Persist();
                    cache.table = numeric.table;
                    cache.metadata = numeric.metadata;
                    let finish!: (value: any) => void;
                    let calls = 0;
                    const obs: any = observable(cloneFixture(initial));
                    const state = syncObservable(obs, {
                        get: () =>
                            new Promise<any>((resolve) => {
                                finish = resolve;
                            }),
                        set: () => {
                            calls++;
                        },
                        persist: { name: 'ambiguous-child-intent', plugin: cache, retrySync: true },
                    });
                    await when(state.isPersistLoaded);
                    const pending = cloneFixture(state.getPendingChanges());
                    const before = cloneFixture(obs.peek());
                    const table = internal.safeStringify(cache.table),
                        metadata = internal.safeStringify(cache.metadata);
                    finish(
                        new Map<any, any>([
                            [1, { value: 8 }],
                            ['1', { value: 9 }],
                        ]),
                    );
                    await when(state.isLoaded);
                    await settle();
                    expect(obs.peek()).toEqual(before);
                    expect(state.getPendingChanges()).toEqual(pending);
                    expect((state.getPendingChanges() as any)['1/value'].v).toBe(1);
                    expect(internal.safeStringify(cache.table)).toBe(table);
                    expect(internal.safeStringify(cache.metadata)).toBe(metadata);
                    expect(calls).toBe(0);
                    expect(state.numPendingGets.peek()).toBe(0);
                    expect(state.numPendingSets.peek()).toBe(0);
                    expect(state.error.peek()).toBeUndefined();
                });
            test('late ambiguous child does not partially commit a root rebase', async () => {
                const initial = new Map<any, any>([
                    ['plain', { value: 0 }],
                    [1, { value: 0 }],
                    ['1', { value: 0 }],
                ]);
                const cache = new Persist();
                cache.table = cloneFixture(initial);
                const requests: (() => void)[] = [];
                let hold = false,
                    release!: () => void;
                const save = cache.set.bind(cache);
                cache.set = (name, changes) => {
                    if (hold) {
                        hold = false;
                        return new Promise<void>((resolve) => {
                            release = () => {
                                save(name, changes);
                                resolve();
                            };
                        });
                    }
                    return save(name, changes);
                };
                const original: any = observable(cloneFixture(initial));
                const originalState = syncObservable(original, {
                    get: () => cloneFixture(initial),
                    set: () => new Promise<void>((resolve) => requests.push(resolve)),
                    persist: { name: 'root-child-before-cache', plugin: cache, retrySync: true },
                });
                await when(originalState.isLoaded);
                await settle();
                original.set(
                    new Map<any, any>([
                        ['plain', { value: 1 }],
                        [1, { value: 0 }],
                        ['1', { value: 0 }],
                    ]),
                );
                await settle();
                original.get('plain').value.set(2);
                await settle();
                hold = true;
                original.get(1).value.set(1);
                await settle();
                expect(typeof release).toBe('function');
                const copied = cloneFixture({ table: cache.table, metadata: cache.metadata });
                release();
                await settle();
                requests.forEach((resolve) => resolve());
                await settle();
                expect(Object.keys(copied.metadata.pending)).toContain('');
                expect(Object.keys(copied.metadata.pending)).toContain('1/value');
                delete copied.metadata.pending['1/value'].k;
                const fresh = new Persist();
                fresh.table = copied.table;
                fresh.metadata = copied.metadata;
                let finish!: (value: any) => void;
                const obs: any = observable();
                const state = syncObservable(obs, {
                    get: () =>
                        new Promise<any>((resolve) => {
                            finish = resolve;
                        }),
                    persist: { name: 'root-child-restart', plugin: fresh, retrySync: true },
                });
                await when(state.isPersistLoaded);
                await settle();
                const before = cloneFixture(obs.peek()),
                    pending = cloneFixture(state.getPendingChanges());
                const table = internal.safeStringify(fresh.table),
                    metadata = internal.safeStringify(fresh.metadata);
                finish(
                    new Map<any, any>([
                        ['plain', { value: 2, server: 1 }],
                        [1, { value: 8 }],
                        ['1', { value: 9 }],
                    ]),
                );
                await when(state.isLoaded);
                await settle();
                expect(obs.peek()).toEqual(before);
                expect(state.getPendingChanges()).toEqual(pending);
                expect(internal.safeStringify(fresh.table)).toBe(table);
                expect(internal.safeStringify(fresh.metadata)).toBe(metadata);
                expect(state.numPendingGets.peek()).toBe(0);
                expect(state.error.peek()).toBeUndefined();
            });
            for (const array of [false, true])
                test(`ordinary child path still replays array=${array}`, async () => {
                    const initial: any = array ? [{ value: 0 }] : { a: { value: 0 } };
                    const copied = await interruptedChild(initial, (obs) => (array ? obs[0] : obs.a).value.set(1));
                    const cache = new Persist();
                    cache.table = copied.table;
                    cache.metadata = copied.metadata;
                    let finish!: (value: any) => void;
                    let server = cloneFixture(initial);
                    const obs: any = observable(cloneFixture(initial));
                    const state = syncObservable(obs, {
                        get: () =>
                            new Promise<any>((resolve) => {
                                finish = resolve;
                            }),
                        set: (params) => {
                            server = applyChanges(server, params.changes);
                            params.update({ value: cloneFixture(server), changes: params.changes });
                        },
                        persist: { name: 'ordinary-child-replay', plugin: cache, retrySync: true },
                    });
                    await when(state.isPersistLoaded);
                    expect((array ? obs[0] : obs.a).value.peek()).toBe(1);
                    finish(cloneFixture(initial));
                    await when(state.isLoaded);
                    await settle();
                    await settle();
                    expect((array ? obs[0] : obs.a).value.peek()).toBe(1);
                    expect((array ? server[0] : server.a).value).toBe(1);
                    expect(state.getPendingChanges()).toEqual({});
                    expect(state.error.peek()).toBeUndefined();
                });
            describe('legacy joined path ambiguity', () => {
                for (const kind of ['whole', 'prefix', 'inner', 'Map'])
                    test(`unknown path types retain both joined-key intents kind=${kind}`, async () => {
                        const initial: any =
                            kind === 'Map'
                                ? new Map<any, any>([
                                      ['a/b', 0],
                                      ['a', new Map([['b', 0]])],
                                  ])
                                : kind === 'prefix'
                                  ? { 'a/b': { c: 0 }, a: { b: { c: 0 } } }
                                  : kind === 'inner'
                                    ? { a: { 'b/c': 0, b: { c: 0 } } }
                                    : { 'a/b': 0, a: { b: 0 } };
                        const read = (value: any, literal: boolean) =>
                            kind === 'Map'
                                ? literal
                                    ? value.get('a/b')
                                    : value.get('a').get('b')
                                : kind === 'prefix'
                                  ? literal
                                      ? value['a/b'].c
                                      : value.a.b.c
                                  : kind === 'inner'
                                    ? literal
                                        ? value.a['b/c']
                                        : value.a.b.c
                                    : literal
                                      ? value['a/b']
                                      : value.a.b;
                        const copies = [];
                        for (const literal of [true, false]) {
                            const copied = await interruptedChild(initial, (obs) => {
                                const child =
                                    kind === 'Map'
                                        ? literal
                                            ? obs.get('a/b')
                                            : obs.get('a').get('b')
                                        : kind === 'prefix'
                                          ? literal
                                              ? obs['a/b'].c
                                              : obs.a.b.c
                                          : kind === 'inner'
                                            ? literal
                                                ? obs.a['b/c']
                                                : obs.a.b.c
                                            : literal
                                              ? obs['a/b']
                                              : obs.a.b;
                                child.set(1);
                                expect(read(obs.peek(), literal)).toBe(1);
                                expect(read(obs.peek(), !literal)).toBe(0);
                            });
                            copies.push(copied);
                        }
                        const path = kind === 'prefix' || kind === 'inner' ? 'a/b/c' : 'a/b';
                        expect(Object.keys(copies[0].metadata.pending)).toEqual([path]);
                        expect(Object.keys(copies[1].metadata.pending)).toEqual([path]);
                        expect(copies[0].metadata.pending[path].t).not.toEqual(copies[1].metadata.pending[path].t);
                        // Simulate legacy metadata which no longer records path types.
                        for (const copied of copies) {
                            copied.metadata.pending[path].t = [];
                            delete copied.metadata.pending[path].k;
                        }
                        expect(copies[0]).toEqual(copies[1]);
                        for (const copied of copies) {
                            const cache = new Persist();
                            cache.table = cloneFixture(copied.table);
                            cache.metadata = cloneFixture(copied.metadata);
                            const sent: any[] = [],
                                errors: Error[] = [];
                            let finish!: (value: any) => void;
                            let server = cloneFixture(initial);
                            const obs: any = observable();
                            const state = syncObservable(obs, {
                                get: () =>
                                    new Promise<any>((resolve) => {
                                        finish = resolve;
                                    }),
                                set: (params) => {
                                    sent.push(cloneFixture(params.changes));
                                    server = applyChanges(server, params.changes);
                                    params.update({ value: cloneFixture(server), changes: params.changes });
                                },
                                onError: (error) => errors.push(error),
                                persist: { name: 'legacy-joined-' + kind, plugin: cache, retrySync: true },
                            });
                            await when(state.isPersistLoaded);
                            await settle();
                            expect(obs.peek()).toEqual(initial);
                            expect(cache.table).toEqual(initial);
                            expect(state.getPendingChanges()).toEqual(copied.metadata.pending);
                            finish(cloneFixture(initial));
                            await when(state.isLoaded);
                            await settle();
                            await settle();
                            expect(obs.peek()).toEqual(initial);
                            expect(cache.table).toEqual(initial);
                            expect(server).toEqual(initial);
                            expect(state.getPendingChanges()).toEqual(copied.metadata.pending);
                            expect(sent).toEqual([]);
                            expect(errors).toEqual([]);
                            expect(state.numPendingGets.peek()).toBe(0);
                            expect(state.numPendingSets.peek()).toBe(0);
                        }
                    });
                for (const kind of ['object', 'array', 'Map'])
                    test(`unknown path types still replay a unique nested path kind=${kind}`, async () => {
                        const initial: any =
                            kind === 'array'
                                ? [{ value: 0 }]
                                : kind === 'Map'
                                  ? new Map([['a', new Map([['value', 0]])]])
                                  : { a: { value: 0 } };
                        const row = (value: any) =>
                            kind === 'array' ? value[0] : kind === 'Map' ? value.get('a') : value.a;
                        const copied = await interruptedChild(initial, (obs) => {
                            const child =
                                kind === 'array'
                                    ? obs[0].value
                                    : kind === 'Map'
                                      ? obs.get('a').get('value')
                                      : obs.a.value;
                            child.set(1);
                        });
                        for (const entry of Object.values(copied.metadata.pending) as any[]) {
                            entry.t = [];
                            delete entry.k;
                        }
                        const cache = new Persist();
                        cache.table = copied.table;
                        cache.metadata = copied.metadata;
                        const sent: any[] = [],
                            errors: Error[] = [];
                        let server = cloneFixture(initial),
                            finish!: (value: any) => void;
                        const obs: any = observable();
                        const state = syncObservable(obs, {
                            get: () =>
                                new Promise<any>((resolve) => {
                                    finish = resolve;
                                }),
                            set: (params) => {
                                sent.push(cloneFixture(params.changes));
                                server = applyChanges(server, params.changes);
                                params.update({ value: cloneFixture(server), changes: params.changes });
                            },
                            onError: (error) => errors.push(error),
                            persist: { name: 'legacy-unique-' + kind, plugin: cache, retrySync: true },
                        });
                        await when(state.isPersistLoaded);
                        await settle();
                        expect(kind === 'Map' ? row(obs.peek()).get('value') : row(obs.peek()).value).toBe(1);
                        finish(cloneFixture(initial));
                        await when(state.isLoaded);
                        await settle();
                        await settle();
                        expect(kind === 'Map' ? row(server).get('value') : row(server).value).toBe(1);
                        expect(obs.peek()).toEqual(server);
                        expect(cache.table).toEqual(server);
                        expect(state.getPendingChanges()).toEqual({});
                        expect(sent).toHaveLength(1);
                        expect(errors).toEqual([]);
                        expect(state.numPendingGets.peek()).toBe(0);
                        expect(state.numPendingSets.peek()).toBe(0);
                    });
            });
            test('ambiguous slash path is retained without creating a phantom tree', async () => {
                const copied = await interruptedChild({ 'a/b': 0 }, (obs) => obs['a/b'].set(1));
                delete copied.metadata.pending['a/b'].k;
                const cache = new Persist();
                cache.table = copied.table;
                cache.metadata = copied.metadata;
                let finish!: (value: any) => void;
                let calls = 0;
                const obs: any = observable();
                const state = syncObservable(obs, {
                    get: () =>
                        new Promise<any>((resolve) => {
                            finish = resolve;
                        }),
                    set: () => {
                        calls++;
                    },
                    persist: { name: 'slash-child', plugin: cache, retrySync: true },
                });
                await when(state.isPersistLoaded);
                const before = cloneFixture(obs.peek()),
                    pending = cloneFixture(state.getPendingChanges());
                finish({ 'a/b': 2 });
                await when(state.isLoaded);
                await settle();
                expect(obs.peek()).toEqual(before);
                expect(Object.prototype.hasOwnProperty.call(obs.peek(), 'a')).toBe(false);
                expect(state.getPendingChanges()).toEqual(pending);
                expect(calls).toBe(0);
                expect(state.numPendingGets.peek()).toBe(0);
            });
            test('related GET parent reads keep their remote-current-remote order', async () => {
                const copied = await interruptedChild({ item: { value: 0 } }, (obs) => obs.item.value.set(1));
                const cache = new Persist();
                cache.table = copied.table;
                cache.metadata = copied.metadata;
                let push!: (value: any) => void;
                const obs: any = observable();
                syncObservable(obs, {
                    subscribe: ({ update }) => {
                        push = (value) => update({ value });
                    },
                    persist: { name: 'child-parent-clock', plugin: cache, retrySync: true },
                });
                await when(syncState(obs).isPersistLoaded);
                await settle();
                const reads: string[] = [],
                    item = obs.peek().item;
                Object.defineProperty(obs.peek(), 'item', {
                    configurable: true,
                    enumerable: true,
                    get: () => {
                        reads.push('current');
                        return item;
                    },
                });
                const remote: any = {},
                    remoteItem = { value: 8 };
                Object.defineProperty(remote, 'item', {
                    configurable: true,
                    enumerable: true,
                    get: () => {
                        reads.push('remote');
                        return remoteItem;
                    },
                });
                push(remote);
                expect(reads.slice(0, 3)).toEqual(['remote', 'current', 'remote']);
                expect(obs.item.value.peek()).toBe(1);
            });
            test('a newly rebased literal pending key remains an own data property', async () => {
                const initial = Object.fromEntries([['__proto__', { value: 0 }]]);
                const copied = await interruptedChild(initial, (obs) => obs['__proto__'].value.set(1));
                const cache = new Persist();
                cache.table = copied.table;
                cache.metadata = copied.metadata;
                let push!: (value: any) => void;
                const obs: any = observable();
                const state = syncObservable(obs, {
                    subscribe: ({ update }) => {
                        push = (value) => update({ value });
                    },
                    persist: { name: 'literal-pending-key', plugin: cache, retrySync: true },
                });
                await when(state.isPersistLoaded);
                await settle();
                const pending = state.getPendingChanges()!,
                    prototype = Object.getPrototypeOf(pending);
                push(Object.fromEntries([['__proto__', internal.symbolDelete]]));
                await settle();
                expect(Object.getPrototypeOf(pending)).toBe(prototype);
                expect(Object.prototype.hasOwnProperty.call(pending, '__proto__')).toBe(true);
                expect(obs.peek()['__proto__'].value).toBe(1);
                expect(Object.prototype.hasOwnProperty.call(cache.metadata.pending, '__proto__')).toBe(true);
                expect(state.error.peek()).toBeUndefined();
            });
            for (const map of [false, true])
                for (const [cachedB, legacy, canonical] of [
                    [0, false, true],
                    [5, false, true],
                    [5, true, false],
                    [0, false, false],
                ] as const)
                    test(`object child intent survives interrupted cache and two restarts map=${map} cachedB=${cachedB} legacy=${legacy} canonical=${canonical}`, async () => {
                        const data = (x: number, b: number) => (map ? new Map([['a', { x, b }]]) : { a: { x, b } });
                        const row = (value: any) => (map ? value.get('a') : value.a);
                        const copied = await interruptedChild(data(0, 0), (obs) =>
                            (map ? obs.get('a') : obs.a).set({ x: 1, b: 0 }),
                        );
                        const cache = new Persist();
                        cache.table = copied.table;
                        row(cache.table).b = cachedB;
                        cache.metadata = copied.metadata;
                        if (legacy) delete cache.metadata.pending.a.h;
                        if (!canonical) delete cache.metadata.pending.a.c;
                        const held: { params: any; resolve: () => void }[] = [];
                        const errors: Error[] = [];
                        let finish!: (value: any) => void;
                        const obs: any = observable(data(0, 0));
                        const state = syncObservable(obs, {
                            get: () =>
                                new Promise<any>((resolve) => {
                                    finish = resolve;
                                }),
                            set: (params) => new Promise<void>((resolve) => held.push({ params, resolve })),
                            onError: (error) => errors.push(error),
                            persist: { name: 'object-child-first-restart', plugin: cache, retrySync: true },
                        });
                        await when(state.isPersistLoaded);
                        const hydrated = cloneFixture(obs.peek());
                        const remote = data(0, 5);
                        row(remote).server = 9;
                        finish(remote);
                        await when(state.isLoaded);
                        await settle();
                        await settle();
                        const first = cloneFixture({
                            value: obs.peek(),
                            table: cache.table,
                            metadata: cache.metadata,
                            pending: state.getPendingChanges(),
                            sent: held.map(({ params }) => ({ value: params.value, changes: params.changes })),
                        });
                        const next = new Persist();
                        next.table = cloneFixture(cache.table);
                        next.metadata = cloneFixture(cache.metadata);
                        const restarted: any = observable(data(0, 0));
                        const nextState = syncObservable(restarted, {
                            get: () => {
                                const value = data(0, 6);
                                row(value).server = 10;
                                return value;
                            },
                            set: (params) => new Promise<void>((resolve) => held.push({ params, resolve })),
                            onError: (error) => errors.push(error),
                            persist: { name: 'object-child-second-restart', plugin: next, retrySync: true },
                        });
                        await when(nextState.isLoaded);
                        await settle();
                        await settle();
                        const second = cloneFixture({
                            value: restarted.peek(),
                            metadata: next.metadata,
                            pending: nextState.getPendingChanges(),
                        });
                        held.forEach(({ resolve }) => resolve());
                        await settle();
                        expect(row(hydrated)).toEqual({ x: 1, b: legacy ? 0 : cachedB });
                        expect(row(first.value)).toEqual({ x: 1, b: legacy ? 0 : 5, server: 9 });
                        expect(first.pending!.a.v).toEqual(row(first.value));
                        expect(row(first.table)).toEqual(row(first.value));
                        expect(row(second.value)).toEqual({ x: 1, b: legacy ? 0 : 6, server: 10 });
                        expect(second.pending!.a.v).toEqual(row(second.value));
                        expect(held).toHaveLength(2);
                        expect(held.map(({ params }) => row(params.value).x)).toEqual([1, 1]);
                        expect(state.numPendingSets.peek()).toBe(0);
                        expect(nextState.numPendingSets.peek()).toBe(0);
                        expect(state.error.peek()).toBeUndefined();
                        expect(nextState.error.peek()).toBeUndefined();
                        expect(errors).toEqual([]);
                    });
            test('a canonical child rewrite distinguishes a new edit from stale legacy values', async () => {
                let hold = false,
                    release!: () => void;
                const releases: (() => void)[] = [];
                class Held extends Persist {
                    override set(name: string, changes: any[]) {
                        if (hold) {
                            hold = false;
                            return new Promise<void>((resolve) => {
                                release = () => {
                                    super.set(name, changes);
                                    resolve();
                                };
                            });
                        }
                        return super.set(name, changes);
                    }
                }
                const cache = new Held();
                cache.table = { row: { a: 0, b: 5 } };
                const obs: any = observable(cloneFixture(cache.table));
                const state = syncObservable(obs, {
                    get: () => ({ row: { a: 0, b: 5 } }),
                    set: () => new Promise<void>((resolve) => releases.push(resolve)),
                    persist: { name: 'canonical-child-rewrite', plugin: cache, retrySync: true },
                });
                await when(state.isLoaded);
                await settle();
                obs.row.set({ a: 1, b: 5 });
                await settle();
                hold = true;
                obs.row.set({ a: 1, b: 1 });
                await settle();
                const copied = cloneFixture({ table: cache.table, metadata: cache.metadata });
                release();
                releases.forEach((resolve) => resolve());
                await settle();
                let server = { row: { a: 0, b: 6 } };
                const next = new Persist();
                next.table = copied.table;
                next.metadata = copied.metadata;
                const restored: any = observable({ row: { a: 0, b: 0 } });
                const nextState = syncObservable(restored, {
                    get: () => cloneFixture(server),
                    set: (params) => {
                        server = applyChanges(server, params.changes);
                        params.update({ value: {}, changes: params.changes });
                    },
                    persist: { name: 'canonical-child-rewrite-restart', plugin: next, retrySync: true },
                });
                await when(nextState.isLoaded);
                await settle();
                await settle();
                expect(copied.metadata.pending.row).toEqual({
                    p: { a: 0, b: 5 },
                    v: { a: 1, b: 1 },
                    h: [['a']],
                    t: ['object'],
                    c: true,
                });
                expect(restored.peek()).toEqual({ row: { a: 1, b: 1 } });
                expect(server).toEqual({ row: { a: 1, b: 1 } });
                expect(nextState.getPendingChanges()).toEqual({});
                expect(nextState.numPendingSets.peek()).toBe(0);
                expect(nextState.error.peek()).toBeUndefined();
            });
            test('a sibling ACK normalization preserves canonical child intent through a crash', async () => {
                const cache = new Persist();
                cache.table = { row: { a: 0, b: 0 }, other: 0 };
                const held: { params: any; resolve: () => void }[] = [];
                const obs: any = observable(cloneFixture(cache.table));
                const state = syncObservable(obs, {
                    get: () => ({ row: { a: 0, b: 0 }, other: 0 }),
                    set: (params) => new Promise<void>((resolve) => held.push({ params, resolve })),
                    persist: { name: 'canonical-child-sibling-ack', plugin: cache, retrySync: true },
                });
                await when(state.isLoaded);
                await settle();
                obs.row.set({ a: 1, b: 0 });
                await settle();
                obs.other.set(1);
                await settle();
                expect(held).toHaveLength(2);
                held[1].params.update({ value: { other: 10 }, changes: held[1].params.changes });
                held[1].resolve();
                await settle();
                const copied = cloneFixture({ table: cache.table, metadata: cache.metadata });
                held[0].resolve();
                await settle();
                let server = { row: { a: 0, b: 5 }, other: 10 };
                const next = new Persist();
                next.table = copied.table;
                next.metadata = copied.metadata;
                const restored: any = observable({ row: { a: 0, b: 0 }, other: 0 });
                const nextState = syncObservable(restored, {
                    get: () => cloneFixture(server),
                    set: (params) => {
                        server = applyChanges(server, params.changes);
                        params.update({ value: {}, changes: params.changes });
                    },
                    persist: { name: 'canonical-child-sibling-ack-restart', plugin: next, retrySync: true },
                });
                await when(nextState.isLoaded);
                await settle();
                await settle();
                expect(copied.table).toEqual({ row: { a: 1, b: 0 }, other: 10 });
                expect(copied.metadata.pending.row).toMatchObject({ v: { a: 1, b: 0 }, c: true });
                expect(restored.peek()).toEqual({ row: { a: 1, b: 5 }, other: 10 });
                expect(server).toEqual({ row: { a: 1, b: 5 }, other: 10 });
                expect(nextState.getPendingChanges()).toEqual({});
                expect(state.numPendingSets.peek()).toBe(0);
                expect(nextState.numPendingSets.peek()).toBe(0);
                expect(state.error.peek()).toBeUndefined();
                expect(nextState.error.peek()).toBeUndefined();
            });
            test('a child edit absorbed by an ambiguous legacy parent does not promote its snapshot', async () => {
                const cache = new Persist();
                cache.table = new Map<any, any>([
                    [1, { a: 0, b: 5 }],
                    ['1', { a: 0, b: 5 }],
                ]);
                cache.metadata = {
                    pending: { '1': { p: { a: 0, b: 5 }, v: { a: 1, b: 1 }, h: [['a']], t: ['object'] } },
                };
                const obs: any = observable(cloneFixture(cache.table));
                const state = syncObservable(obs, {
                    get: () => cloneFixture(cache.table),
                    set: (params) => params.update({ value: {}, changes: params.changes }),
                    persist: { name: 'legacy-parent-partial-child', plugin: cache, retrySync: true },
                });
                await when(state.isLoaded);
                await settle();
                obs.get(1).b.set(2);
                await settle();
                const entry: any = state.getPendingChanges()!['1'];
                expect(entry.c).toBeUndefined();
                expect(entry.v).toEqual({ a: 1, b: 2 });
                expect(entry.h).toContainEqual(['b']);
                expect(obs.peek().get(1)).toEqual({ a: 0, b: 2 });
                expect(obs.peek().get('1')).toEqual({ a: 0, b: 5 });
                expect(state.numPendingSets.peek()).toBe(0);
                expect(state.error.peek()).toBeUndefined();
            });
            test('overlapping acknowledgements retain ambiguous intent without using a discarded patch', async () => {
                const initial = new Map<any, any>([
                    [1, { value: 0 }],
                    ['1', { value: 0 }],
                    ['a', { value: 0 }],
                    ['b', { value: 0 }],
                ]);
                const copied = await interruptedChild(initial, (obs) => obs.get(1).value.set(1));
                delete copied.metadata.pending['1/value'].k;
                const cache = new Persist();
                cache.table = copied.table;
                cache.metadata = copied.metadata;
                const requests: { params: any; resolve: () => void }[] = [];
                const errors: Error[] = [];
                let finish!: (value: any) => void;
                const obs: any = observable(cloneFixture(initial));
                const state = syncObservable(obs, {
                    get: () =>
                        new Promise<any>((resolve) => {
                            finish = resolve;
                        }),
                    set: (params) => new Promise<void>((resolve) => requests.push({ params, resolve })),
                    onError: (error) => errors.push(error),
                    persist: { name: 'ambiguous-overlapping-ack', plugin: cache, retrySync: true },
                });
                await when(state.isPersistLoaded);
                finish(cloneFixture(initial));
                await when(state.isLoaded);
                await settle();
                obs.get('a').value.set(1);
                await settle();
                obs.get('b').value.set(1);
                await settle();
                expect(requests).toHaveLength(2);
                try {
                    requests[1].params.update({
                        value: new Map([['b', { value: 1 }]]),
                        changes: requests[1].params.changes,
                    });
                    requests[1].resolve();
                    await settle();
                    expect(errors).toEqual([]);
                    expect(state.error.peek()).toBeUndefined();
                    expect(obs.get('a').value.peek()).toBe(1);
                    expect(obs.get('b').value.peek()).toBe(1);
                } finally {
                    requests.forEach(({ resolve }) => resolve());
                    await settle();
                }
                expect((state.getPendingChanges() as any)['1/value'].v).toBe(1);
                expect(state.numPendingSets.peek()).toBe(0);
                expect(state.isSetting.peek()).toBe(false);
                expect([...obs.peek().keys()]).toEqual([1, '1', 'a', 'b']);
            });
        });

        for (const siblings of [false, true])
            test(`async child hydration notifies existing listeners siblings=${siblings}`, async () => {
                let stall = false;
                let releaseCache!: () => void;
                class StalledPersist extends Persist {
                    override set(name: string, changes: any[]) {
                        if (stall) {
                            stall = false;
                            return new Promise<void>((resolve) => {
                                releaseCache = () => {
                                    super.set(name, changes);
                                    resolve();
                                };
                            });
                        }
                        return super.set(name, changes);
                    }
                }
                const original = new StalledPersist();
                original.table = { a: 0, b: 0 };
                const obs = observable(
                    synced({
                        get: () => ({ a: 0, b: 0 }),
                        set: () => undefined,
                        persist: { name: 'child-before-cache', plugin: original, retrySync: true },
                    }),
                );
                obs.get();
                await when(syncState(obs).isLoaded);
                await settle();
                stall = true;
                batch(() => {
                    obs.a.set(1);
                    if (siblings) obs.b.set(2);
                });
                await settle();
                expect(typeof releaseCache).toBe('function');
                const copied = cloneFixture({ table: original.table, metadata: original.metadata });
                releaseCache();
                await settle();

                let releaseLoad!: () => void;
                class AsyncPersist extends Persist {
                    loadTable() {
                        return new Promise<void>((resolve) => {
                            releaseLoad = resolve;
                        });
                    }
                }
                const fresh = new AsyncPersist();
                fresh.table = copied.table;
                fresh.metadata = copied.metadata;
                const restarted = observable({ a: 0, b: 0 });
                const normal: any[] = [],
                    immediate: any[] = [],
                    root: any[] = [];
                let calls = 0,
                    reads = 0;
                restarted.a.onChange(({ value, isFromPersist }) => normal.push([value, isFromPersist]));
                restarted.a.onChange(({ value, isFromPersist }) => immediate.push([value, isFromPersist]), {
                    immediate: true,
                });
                restarted.onChange(({ value, isFromPersist }) => root.push([value.a, value.b, isFromPersist]));
                const state = syncObservable(restarted, {
                    get: () => new Promise<{ a: number; b: number }>(() => {}),
                    set: () => {
                        calls++;
                    },
                    persist: { name: 'async-child-restart', plugin: fresh, retrySync: true },
                });
                if (siblings)
                    Object.defineProperty(restarted.peek(), 'unrelated', {
                        configurable: true,
                        enumerable: true,
                        get: () => {
                            reads++;
                            return 5;
                        },
                    });
                expect(normal).toEqual([]);
                releaseLoad();
                await when(state.isPersistLoaded);
                await settle();
                expect(restarted.a.peek()).toBe(1);
                expect(restarted.b.peek()).toBe(siblings ? 2 : 0);
                expect(normal).toEqual([[1, true]]);
                expect(immediate).toEqual([[1, true]]);
                expect(root).toEqual([[1, siblings ? 2 : 0, true]]);
                expect(reads).toBe(siblings ? 1 : 0);
                expect(calls).toBe(0);
                expect(state.error.peek()).toBeUndefined();
            });

        for (const map of [false, true])
            for (const renamed of [false, true])
                test(`metadata-before-cache crash restores intent before async B5 map=${map} renamed=${renamed}`, async () => {
                    const fromEntries = (x: any[]) => (map ? new Map(x) : Object.fromEntries(x));
                    const entries = (x: any): any[] => (x instanceof Map ? [...x] : Object.entries(x));
                    const data = (a: number, b: number) =>
                        fromEntries([
                            ['a', { value: a }],
                            ['b', { value: b }],
                        ]);
                    const row = (x: any, k: string) => (x instanceof Map ? x.get(k) : x[k]);
                    const wire = (x: any, save: boolean) =>
                        (save ? Object.fromEntries : fromEntries)(
                            entries(x).map(([k, v]) => [
                                save ? 'wire_' + k : k.replace(/^wire_/, ''),
                                { value: v.value * (save ? 10 : 0.1) },
                            ]),
                        );
                    const transform = renamed
                        ? { save: (x: any) => wire(x, true), load: (x: any) => wire(x, false) }
                        : undefined;
                    let stall = false,
                        releaseCache!: () => void;
                    class StalledPersist extends Persist {
                        override set(name: string, changes: any[]) {
                            if (stall) {
                                stall = false;
                                return new Promise<void>((r) => {
                                    releaseCache = () => {
                                        super.set(name, changes);
                                        r();
                                    };
                                });
                            }
                            return super.set(name, changes);
                        }
                    }
                    const original = new StalledPersist();
                    original.table = data(0, 4);
                    const obs: any = observable(
                        synced({
                            get: () => (renamed ? wire(data(0, 4), true) : data(0, 4)),
                            transform,
                            persist: { name: 'old' + map + renamed, plugin: original, retrySync: true },
                            set: () => undefined,
                        }),
                    );
                    obs.get();
                    const state = syncState(obs);
                    await when(state.isLoaded);
                    await settle();
                    stall = true;
                    obs.set(data(1, 4));
                    await settle();
                    expect(typeof releaseCache).toBe('function');
                    const copied = cloneFixture({ table: original.table, metadata: original.metadata });
                    expect(row(copied.table, 'a').value).toBe(0);
                    expect(row(copied.metadata.pending[''].v, 'a').value).toBe(1);
                    expect(copied.metadata.pending[''].c).toBe(true);
                    releaseCache();
                    await settle();
                    const fresh = new Persist();
                    fresh.table = cloneFixture(copied.table);
                    fresh.metadata = cloneFixture(copied.metadata);
                    let finishGet!: (x: any) => void;
                    let server: any = renamed ? wire(data(0, 5), true) : data(0, 5);
                    const sent: any[] = [];
                    const restored: any = observable(
                        synced({
                            get: () =>
                                new Promise<any>((r) => {
                                    finishGet = r;
                                }),
                            transform: {
                                save: transform?.save,
                                load: async (value: any) => {
                                    await tick();
                                    return renamed ? wire(value, false) : value;
                                },
                            },
                            persist: { name: 'fresh' + map + renamed, plugin: fresh, retrySync: true },
                            set: (p) => {
                                sent.push(cloneFixture({ value: p.value, changes: p.changes }));
                                server = applyChanges(server, p.changes);
                                p.update({
                                    value: renamed ? wire(server, false) : cloneFixture(server),
                                    changes: p.changes,
                                });
                            },
                        }),
                    );
                    restored.get();
                    const next = syncState(restored);
                    await when(next.isPersistLoaded);
                    expect(row(restored.peek(), 'a').value).toBe(1);
                    finishGet(cloneFixture(server));
                    await when(next.isLoaded);
                    await settle();
                    await settle();
                    const local = renamed ? wire(server, false) : server;
                    expect(row(local, 'a').value).toBe(1);
                    expect(row(local, 'b').value).toBe(5);
                    expect(restored.peek()).toEqual(data(1, 5));
                    expect(next.getPendingChanges()).toEqual({});
                    expect(next.numPendingSets.peek()).toBe(0);
                });

        for (const cacheMissing of [false, true])
            test(`durable missing-root cache preserves initial defaults cacheMissing=${cacheMissing}`, async () => {
                const fresh = new Persist();
                fresh.table = cacheMissing ? undefined : { a: { value: 0 } };
                fresh.metadata = {
                    pending: { '': { p: { a: { value: 0 } }, v: { a: { value: 1 } }, h: [], t: [], c: true } },
                };
                const sent: any[] = [];
                const obs: any = observable(
                    synced({
                        initial: { default: 'keep', a: { value: 0 } },
                        get: async () => undefined,
                        persist: { name: 'missing' + cacheMissing, plugin: fresh, retrySync: true },
                        set: (p) => {
                            sent.push(cloneFixture({ value: p.value, changes: p.changes }));
                            p.update({ value: undefined, changes: p.changes });
                        },
                    }),
                );
                obs.get();
                const state = syncState(obs);
                await when(state.isLoaded);
                await settle();
                await settle();
                expect(obs.peek()).toEqual({ default: 'keep', a: { value: 1 } });
                expect(sent[0].changes[0].valueAtPath).toEqual({ default: 'keep', a: { value: 1 } });
                expect(state.getPendingChanges()).toEqual({});
                expect(state.numPendingSets.peek()).toBe(0);
            });
    });

    describe('durable pending restoration', () => {
        for (const map of [false, true])
            for (const legacy of [false, true])
                test(`restore durable intent before remote load map=${map} legacy=${legacy}`, async () => {
                    const data = (a: number, b: number) =>
                        map
                            ? new Map([
                                  ['a', { value: a }],
                                  ['b', { value: b }],
                              ])
                            : { a: { value: a }, b: { value: b } };
                    const row = (x: any, k: string) => (map ? x.get(k) : x[k]);
                    const store = new Persist();
                    store.table = data(legacy ? 1 : 0, 4);
                    store.metadata = {
                        pending: { '': { p: data(0, 4), v: data(1, 4), t: [], ...(legacy ? {} : { h: [], c: true }) } },
                    };
                    let finish!: (x: any) => void;
                    let server: any = data(0, 4);
                    const sent: any[] = [];
                    const obs: any = observable(
                        synced({
                            get: () => new Promise<any>((r) => (finish = r)),
                            persist: { name: 'restore' + map + legacy, plugin: store, retrySync: true },
                            set: (p) => {
                                sent.push(cloneFixture(p.changes));
                                server = applyChanges(server, p.changes);
                                p.update({ value: undefined, changes: p.changes });
                            },
                        }),
                    );
                    obs.get();
                    const state = syncState(obs);
                    await when(state.isPersistLoaded);
                    expect(row(obs.peek(), 'a').value).toBe(1);
                    finish(data(0, 4));
                    await when(state.isLoaded);
                    await settle();
                    await settle();
                    expect(server).toEqual(data(1, 4));
                    expect(state.getPendingChanges()).toEqual({});
                    expect(state.numPendingSets.peek()).toBe(0);
                    expect(state.error.peek()).toBeUndefined();
                });
        test('overlapping durable child restores after root before first async get', async () => {
            const store = new Persist();
            store.table = { a: { value: 0 }, b: { value: 4 } };
            store.metadata = {
                pending: {
                    '': {
                        p: { a: { value: 0 }, b: { value: 4 } },
                        v: { a: { value: 1 }, b: { value: 4 } },
                        h: [],
                        t: [],
                        c: true,
                    },
                    'a/value': { p: 1, v: 2, h: [], t: ['object', 'object'] },
                },
            };
            let finish!: (x: any) => void;
            let server: any = { a: { value: 0 }, b: { value: 5 } };
            const sent: any[] = [];
            const obs: any = observable(
                synced({
                    get: () => new Promise<any>((r) => (finish = r)),
                    transform: {
                        load: async (v: any) => {
                            await tick();
                            return v;
                        },
                    },
                    persist: { name: 'overlap', plugin: store, retrySync: true },
                    set: (p) => {
                        sent.push(cloneFixture(p.changes));
                        server = applyChanges(server, p.changes);
                        p.update({ value: undefined, changes: p.changes });
                    },
                }),
            );
            obs.get();
            const state = syncState(obs);
            await when(state.isPersistLoaded);
            expect(obs.peek()).toEqual({ a: { value: 2 }, b: { value: 4 } });
            finish(cloneFixture(server));
            await when(state.isLoaded);
            await settle();
            await settle();
            expect(server).toEqual({ a: { value: 2 }, b: { value: 5 } });
            expect(obs.peek()).toEqual(server);
            expect(state.getPendingChanges()).toEqual({});
            expect(state.numPendingSets.peek()).toBe(0);
        });
        for (const map of [false, true])
            test(`metadata canonical baseline survives stale cache and empty incremental get map=${map}`, async () => {
                const data = (a: number, b: number) =>
                    map
                        ? new Map([
                              ['a', { value: a }],
                              ['b', { value: b }],
                          ])
                        : { a: { value: a }, b: { value: b } };
                const store = new Persist();
                store.table = data(0, 4);
                store.metadata = {
                    pending: { '': { p: data(0, 5), v: data(1, 5), t: [], h: [['a', 'value']], c: true } },
                };
                let server: any = data(0, 5);
                const sent: any[] = [];
                const obs: any = observable(
                    synced({
                        get: async () => undefined,
                        persist: { name: 'baseline-gap' + map, plugin: store, retrySync: true },
                        set: (p) => {
                            sent.push(cloneFixture(p.changes));
                            server = applyChanges(server, p.changes);
                            p.update({ value: undefined, changes: p.changes });
                        },
                    }),
                );
                obs.get();
                const state = syncState(obs);
                await when(state.isLoaded);
                await settle();
                await settle();
                expect(server).toEqual(data(1, 5));
                expect(obs.peek()).toEqual(data(1, 5));
                expect(state.getPendingChanges()).toEqual({});
                expect(state.numPendingSets.peek()).toBe(0);
            });
        for (const map of [false, true])
            for (const root of [false, true])
                test(`empty-get replay repairs cache before ACK and survives second restart map=${map} root=${root}`, async () => {
                    const data = (a: number, b: number) =>
                        map
                            ? new Map([
                                  ['a', { value: a }],
                                  ['b', { value: b }],
                              ])
                            : { a: { value: a }, b: { value: b } };
                    const store = new Persist();
                    store.table = data(0, 5);
                    store.metadata = {
                        pending: root
                            ? { '': { p: data(0, 5), v: data(1, 5), t: [], h: [['a', 'value']], c: true } }
                            : { 'a/value': { p: 0, v: 1, t: [map ? 'map' : 'object', 'object'], h: [] } },
                    };
                    let server: any = data(0, 5);
                    let sets = 0;
                    const obs: any = observable(
                        synced({
                            get: async () => undefined,
                            persist: { name: 'empty-get' + map + root, plugin: store, retrySync: true },
                            set: (p) => {
                                sets++;
                                server = applyChanges(server, p.changes);
                                p.update({ value: undefined, changes: p.changes });
                            },
                        }),
                    );
                    obs.get();
                    const state = syncState(obs);
                    await when(state.isLoaded);
                    await settle();
                    await settle();
                    expect(server).toEqual(data(1, 5));
                    expect(obs.peek()).toEqual(data(1, 5));
                    expect(store.table).toEqual(data(1, 5));
                    expect(state.getPendingChanges()).toEqual({});
                    expect(state.numPendingSets.peek()).toBe(0);
                    const second = new Persist();
                    second.table = cloneFixture(store.table);
                    second.metadata = cloneFixture(store.metadata);
                    const secondObs: any = observable(
                        synced({
                            get: async () => undefined,
                            persist: { name: 'second-empty' + map + root, plugin: second, retrySync: true },
                            set: () => {
                                sets++;
                            },
                        }),
                    );
                    const before = sets;
                    secondObs.get();
                    const next = syncState(secondObs);
                    await when(next.isLoaded);
                    await settle();
                    expect(secondObs.peek()).toEqual(data(1, 5));
                    expect(sets).toBe(before);
                    expect(next.getPendingChanges()).toEqual({});
                    expect(next.numPendingSets.peek()).toBe(0);
                });
    });

    describe('async generic replay', () => {
        for (const map of [false, true])
            for (const renamed of [true])
                test(`generic async transform.save replay retains accepted sibling map=${map} renamed=${renamed}`, async () => {
                    const fromEntries = (x: any[]) => (map ? new Map(x) : Object.fromEntries(x));
                    const entries = (x: any): any[] => (x instanceof Map ? [...x] : Object.entries(x));
                    const data = (a: number, b: number) =>
                        fromEntries([
                            ['a', { value: a }],
                            ['b', { value: b }],
                        ]);
                    const row = (x: any, k: string) => (x instanceof Map ? x.get(k) : x[k]);
                    const wire = (x: any, save: boolean) =>
                        (save ? Object.fromEntries : fromEntries)(
                            entries(x).map(([k, v]) => [
                                save ? 'wire_' + k : k.replace(/^wire_/, ''),
                                { value: v.value * (save ? 10 : 0.1) },
                            ]),
                        );
                    const transform = renamed
                        ? {
                              save: async (x: any) => {
                                  await tick();
                                  return wire(x, true);
                              },
                              load: (x: any) => wire(x, false),
                          }
                        : undefined;
                    const store = new Persist();
                    const requests: any[] = [];
                    let push!: (p: any) => void;
                    const obs: any = observable(
                        synced({
                            get: () => (renamed ? wire(data(0, 0), true) : data(0, 0)),
                            transform,
                            subscribe: (p) => {
                                push = p.update;
                            },
                            set: (params) => new Promise<void>((resolve) => requests.push({ params, resolve })),
                            persist: { name: 'restart-a' + map + renamed, plugin: store, retrySync: true },
                        }),
                    );
                    obs.get();
                    const state = syncState(obs);
                    await when(state.isLoaded);
                    obs.set(data(1, 1));
                    await when(state.isSetting);
                    (map ? obs.get('a') : obs.a).value.set(2);
                    await settle();
                    requests[0].params.update({
                        value: fromEntries([['b', { value: 3 }]]),
                        changes: requests[0].params.changes,
                        failedChanges: requests[0].params.changes,
                    });
                    requests[0].resolve();
                    await settle();
                    push({ value: renamed ? wire(data(0, 4), true) : data(0, 4), mode: 'set' });
                    await settle();
                    const copied = cloneFixture({ table: store.table, metadata: store.metadata });
                    requests[1].resolve();
                    await settle();
                    const fresh = new Persist();
                    fresh.table = cloneFixture(copied.table);
                    fresh.metadata = cloneFixture(copied.metadata);
                    let server: any = renamed ? wire(data(0, 5), true) : data(0, 5);
                    const sent: any[] = [];
                    const restarted: any = observable(
                        synced({
                            get: () => cloneFixture(server),
                            transform: {
                                save: transform?.save,
                                load: async (value: any) => {
                                    await tick();
                                    return renamed ? wire(value, false) : value;
                                },
                            },
                            set: (params) => {
                                sent.push(cloneFixture({ value: params.value, changes: params.changes }));
                                server = applyChanges(server, params.changes);
                                params.update({
                                    value: renamed ? wire(server, false) : cloneFixture(server),
                                    changes: params.changes,
                                });
                            },
                            persist: { name: 'restart-b' + map + renamed, plugin: fresh, retrySync: true },
                        }),
                    );
                    restarted.get();
                    const freshState = syncState(restarted);
                    await when(freshState.isLoaded);
                    await settle();
                    await settle();
                    const serverLocal = renamed ? wire(server, false) : server;

                    expect(sent.length).toBeGreaterThan(0);
                    expect(row(serverLocal, 'b').value).toBe(5);
                    expect(row(restarted.peek(), 'b').value).toBe(5);
                    expect(row(copied.table, 'b').value).toBe(4);
                    expect(row(copied.metadata.pending[''].p, 'b').value).toBe(4);
                    expect(row(copied.metadata.pending[''].v, 'b').value).toBe(4);
                    expect(freshState.getPendingChanges()).toEqual({});
                    expect(freshState.numPendingSets.peek()).toBe(0);
                });
    });

    describe('wire clone contract', () => {
        test('root ACK local fidelity preserves toJSON transport and transform input', async () => {
            const inputs: any[] = [];
            const sent: any[] = [];
            const obs: any = observable(
                synced<any>({
                    initial: { value: 0 },
                    transform: {
                        save: (value: any) => {
                            inputs.push(value);
                            return value;
                        },
                    },
                    set: (p) => {
                        sent.push(p.value);
                        p.update({ value: undefined, changes: p.changes });
                    },
                }),
            );
            obs.get();
            obs.set({
                value: 1,
                toJSON() {
                    return { serialized: 1 };
                },
            });
            await settle();
            await settle();
            expect(inputs[inputs.length - 1]).toEqual({ serialized: 1 });
            expect(sent).toEqual([{ serialized: 1 }]);
            expect(syncState(obs).numPendingSets.peek()).toBe(0);
        });
        test('root ACK local fidelity preserves configured JSON replacer transport', async () => {
            const before = internal.globalState.replacer;
            const sent: any[] = [];
            try {
                configureLegendState({
                    jsonReplacer: (key: string, value: any) =>
                        key === 'value' && typeof value === 'number' ? value * 10 : value,
                });
                const obs: any = observable(
                    synced<any>({
                        initial: { value: 0 },
                        set: (p) => {
                            sent.push(p.value);
                            p.update({ value: undefined, changes: p.changes });
                        },
                    }),
                );
                obs.get();
                obs.set({ value: 1 });
                await settle();
                await settle();
                expect(sent).toEqual([{ value: 10 }]);
                expect(syncState(obs).numPendingSets.peek()).toBe(0);
            } finally {
                internal.globalState.replacer = before;
            }
        });
    });

    describe('immutable sent ownership', () => {
        test('held full save preserves sent ownership across ASSIGN and a newer child', async () => {
            let calls = 0;
            let releaseTransform!: () => void;
            let push!: (p: any) => void;
            const requests: any[] = [];
            const data = (a: number, b: number) => ({ a: { value: a }, b: { value: b } });
            const obs: any = observable(
                synced({
                    get: () => data(0, 0),
                    transform: {
                        save: (value: any) => {
                            calls++;
                            if (calls === 6)
                                return new Promise<any>((resolve) => {
                                    releaseTransform = () => resolve(value);
                                });
                            return value;
                        },
                    },
                    subscribe: (p) => {
                        push = p.update;
                    },
                    set: (p) => {
                        if (!requests.length) {
                            requests.push({ p });
                            p.update({ value: undefined, changes: p.changes, failedChanges: p.changes });
                            return;
                        }
                        return new Promise<void>((resolve) => requests.push({ p, resolve }));
                    },
                }),
            );
            obs.get();
            const state = syncState(obs);
            await when(state.isLoaded);
            obs.set(data(1, 0));
            await settle();
            await settle();
            expect(state.getPendingChanges()).toHaveProperty('');
            push({ value: { b: { value: 1 } }, mode: 'assign' });
            await settle();
            obs.set(data(2, 1));
            await settle();
            expect(typeof releaseTransform).toBe('function');
            push({ value: { b: { value: 2 } }, mode: 'assign' });
            await settle();
            obs.a.value.set(3);
            await settle();
            releaseTransform();
            await settle();
            await settle();
            const root = requests.find((r, i) => i > 0 && !r.p.changes[0].path.length);
            const child = requests.find((r, i) => i > 0 && r.p.changes[0].path.length);
            expect(root.p.value).toEqual(data(2, 1));
            root.p.update({ value: undefined, changes: root.p.changes });
            root.resolve();
            await settle();
            expect(obs.a.value.peek()).toBe(3);
            expect(state.getPendingChanges()).toHaveProperty('');
            child.p.update({ value: undefined, changes: child.p.changes });
            child.resolve();
            await settle();
            push({ value: { b: { value: 3 } }, mode: 'assign' });
            await settle();
            expect(obs.peek()).toEqual(data(3, 3));
            expect(state.getPendingChanges()).toEqual({});
            expect(state.numPendingSets.peek()).toBe(0);
        });
    });

    describe('legacy and wire boundaries', () => {
        test('legacy stale root v does not own an accepted cached sibling', async () => {
            const store = new Persist();
            store.table = { a: 1, b: 5 };
            store.metadata = { pending: { '': { p: { a: 0, b: 5 }, v: { a: 1, b: 1 }, h: [['a']], t: [] } } };
            let server: any = { a: 0, b: 6 };
            const obs: any = observable(
                synced({
                    get: () => cloneFixture(server),
                    persist: { name: 'legacy-stale', plugin: store, retrySync: true },
                    set: (p) => {
                        server = applyChanges(server, p.changes);
                        p.update({ value: undefined, changes: p.changes });
                    },
                }),
            );
            obs.get();
            const state = syncState(obs);
            await when(state.isLoaded);
            await settle();
            await settle();
            expect(obs.peek()).toEqual({ a: 1, b: 6 });
            expect(server).toEqual({ a: 1, b: 6 });
            expect(state.getPendingChanges()).toEqual({});
            expect(state.numPendingSets.peek()).toBe(0);
        });
        test('wire clone reads a late-installed accessor once', async () => {
            let reads = 0;
            const sent: any[] = [];
            let raw: any;
            const obs: any = observable(
                synced<any>({
                    initial: { safe: 0 },
                    waitForSet: ({ value }: any) => {
                        raw = value;
                        Object.defineProperty(value, 'measured', {
                            enumerable: true,
                            configurable: true,
                            get: () => {
                                reads++;
                                if (reads > 1) throw Error('accessor reread');
                                return 1;
                            },
                        });
                    },
                    set: (p) => {
                        sent.push(p.value);
                    },
                }),
            );
            obs.get();
            obs.set({ safe: 1 });
            await settle();
            await settle();
            Object.defineProperty(raw, 'measured', { value: 1, enumerable: true, writable: true, configurable: true });
            expect(sent).toEqual([{ safe: 1, measured: 1 }]);
            expect(reads).toBe(1);
            expect(syncState(obs).numPendingSets.peek()).toBe(0);
        });
        for (const renamed of [false, true])
            test(`legacy stale object-child replay accepts fresh server sibling renamed=${renamed}`, async () => {
                const store = new Persist();
                store.table = { row: { a: 1, b: 5 } };
                store.metadata = {
                    pending: { row: { p: { a: 0, b: 5 }, v: { a: 1, b: 1 }, h: [['a']], t: ['object'] } },
                };
                let server: any = renamed ? { wire_row: { a: 0, b: 6 } } : { row: { a: 0, b: 6 } };
                const transform = renamed
                    ? { save: (x: any) => ({ wire_row: x.row }), load: (x: any) => ({ row: x.wire_row }) }
                    : undefined;
                const obs: any = observable(
                    synced({
                        get: async () => cloneFixture(server),
                        transform,
                        persist: { name: 'legacy-child' + renamed, plugin: store, retrySync: true },
                        set: (p) => {
                            server = applyChanges(server, p.changes);
                            p.update({ value: undefined, changes: p.changes });
                        },
                    }),
                );
                obs.get();
                const state = syncState(obs);
                await when(state.isLoaded);
                await settle();
                await settle();
                expect(obs.peek()).toEqual({ row: { a: 1, b: 6 } });
                expect(server).toEqual(renamed ? { wire_row: { a: 1, b: 6 } } : { row: { a: 1, b: 6 } });
                expect(store.table).toEqual({ row: { a: 1, b: 6 } });
                expect(state.getPendingChanges()).toEqual({});
                expect(state.numPendingSets.peek()).toBe(0);
            });
        test('held replay prep cannot overwrite a newer canonical snapshot before a second restart', async () => {
            const store = new Persist();
            store.table = { a: 1, b: 5 };
            store.metadata = { pending: { '': { p: { a: 0, b: 5 }, v: { a: 1, b: 5 }, h: [['a']], t: [], c: true } } };
            let finishGet!: (v: any) => void, releasePrep!: () => void, releaseSet!: () => void;
            let push!: (p: any) => void;
            let calls = 0;
            let request: any;
            const obs: any = observable(
                synced({
                    get: () => new Promise<any>((r) => (finishGet = r)),
                    subscribe: (p) => {
                        push = p.update;
                    },
                    transform: {
                        save: (v: any) => {
                            if (++calls === 1) return new Promise<any>((r) => (releasePrep = () => r(v)));
                            return v;
                        },
                    },
                    persist: { name: 'held-replay', plugin: store, retrySync: true },
                    set: (p) => {
                        request = p;
                        return new Promise<void>((r) => (releaseSet = r));
                    },
                }),
            );
            obs.get();
            const state = syncState(obs);
            await when(state.isPersistLoaded);
            await settle();
            expect(typeof releasePrep).toBe('function');
            finishGet({ a: 0, b: 6 });
            await settle();
            expect(obs.peek()).toEqual({ a: 1, b: 6 });
            releasePrep();
            await when(state.isLoaded);
            await settle();
            await settle();
            expect(request.changes[0].valueAtPath).toEqual({ a: 1, b: 6 });
            push({ value: undefined, lastSync: 123 });
            await settle();
            const copied = cloneFixture({ table: store.table, metadata: store.metadata });
            expect(copied.metadata.pending[''].c).toBe(true);
            expect(copied.metadata.pending[''].v).toEqual({ a: 1, b: 6 });
            request.update({ value: undefined, changes: request.changes });
            releaseSet();
            await settle();
            const nextStore = new Persist();
            nextStore.table = copied.table;
            nextStore.metadata = copied.metadata;
            let server: any = { a: 0, b: 6 };
            const restarted: any = observable(
                synced({
                    get: async () => undefined,
                    persist: { name: 'held-replay-second', plugin: nextStore, retrySync: true },
                    set: (p) => {
                        server = applyChanges(server, p.changes);
                        p.update({ value: undefined, changes: p.changes });
                    },
                }),
            );
            restarted.get();
            const next = syncState(restarted);
            await when(next.isLoaded);
            await settle();
            await settle();
            expect(server).toEqual({ a: 1, b: 6 });
            expect(restarted.peek()).toEqual(server);
            expect(nextStore.table).toEqual(server);
            expect(next.getPendingChanges()).toEqual({});
            expect(next.numPendingSets.peek()).toBe(0);
        });
    });
});

describe('first remote updates reach the durable cache', () => {
    class InitialCache {
        table: any = { b: 5 };
        metadata: any = {};
        writes: any[] = [];
        getTable() {
            return cloneFixture(this.table);
        }
        getMetadata() {
            return cloneFixture(this.metadata);
        }
        set(_name: string, changes: any[]) {
            this.table = cloneFixture(applyChanges(this.table, changes));
            this.writes.push(cloneFixture(this.table));
        }
        setMetadata(_name: string, metadata: any) {
            this.metadata = cloneFixture(metadata);
        }
        deleteTable() {}
        deleteMetadata() {}
    }
    const settle = async () => {
        await promiseTimeout(0);
        await promiseTimeout(0);
    };
    for (const mode of ['sync-get', 'sync-subscribe', 'async-get', 'manual-get'] as const)
        test(`${mode} caches the first server value once`, async () => {
            const cache = new InitialCache();
            let calls = 0;
            const obs = observable(
                synced<any>({
                    syncMode: mode === 'manual-get' ? 'manual' : 'auto',
                    get:
                        mode === 'sync-subscribe'
                            ? undefined
                            : () => {
                                  calls++;
                                  return mode === 'async-get' ? Promise.resolve({ b: 6 }) : { b: 6 };
                              },
                    subscribe:
                        mode === 'sync-subscribe'
                            ? (params) => {
                                  calls++;
                                  params.update({ value: { b: 6 }, mode: 'set' });
                              }
                            : undefined,
                    persist: { name: 'initial-' + mode, plugin: cache, retrySync: true },
                }),
            );
            obs.get();
            const state = syncState(obs);
            if (mode === 'manual-get') {
                await settle();
                expect(calls).toBe(0);
                expect(cache.writes).toEqual([]);
                await state.sync();
            }
            await when(state.isLoaded);
            await settle();
            expect(calls).toBe(1);
            expect(obs.peek()).toEqual({ b: 6 });
            expect(cache.table).toEqual({ b: 6 });
            expect(cache.writes).toEqual([{ b: 6 }]);
            expect(state.error.peek()).toBeUndefined();
        });
    test('a canonical root replay ACK preserves a synchronous server sibling through the next restart', async () => {
        const cache = new InitialCache();
        cache.table = { a: 1, b: 5 };
        cache.metadata = { pending: { '': { p: { a: 0, b: 5 }, v: { a: 1, b: 5 }, h: [['a']], t: [], c: true } } };
        let server = { a: 0, b: 6 };
        const obs = observable(
            synced<any>({
                get: () => cloneFixture(server),
                set: (params) => {
                    server = applyChanges(server, params.changes);
                    params.update({ value: undefined, changes: params.changes });
                },
                persist: { name: 'initial-canonical', plugin: cache, retrySync: true },
            }),
        );
        obs.get();
        const state = syncState(obs);
        await when(state.isLoaded);
        await settle();
        await settle();
        expect(obs.peek()).toEqual({ a: 1, b: 6 });
        expect(server).toEqual({ a: 1, b: 6 });
        expect(state.getPendingChanges()).toEqual({});
        expect(cache.metadata.pending).toEqual({});
        expect(cache.table).toEqual({ a: 1, b: 6 });
        const nextCache = new InitialCache();
        nextCache.table = cloneFixture(cache.table);
        nextCache.metadata = cloneFixture(cache.metadata);
        let replayed = 0;
        const restarted = observable(
            synced<any>({
                get: () => undefined,
                set: () => {
                    replayed++;
                },
                persist: { name: 'initial-canonical-next', plugin: nextCache, retrySync: true },
            }),
        );
        restarted.get();
        await when(syncState(restarted).isLoaded);
        await settle();
        expect(restarted.peek()).toEqual({ a: 1, b: 6 });
        expect(nextCache.table).toEqual({ a: 1, b: 6 });
        expect(replayed).toBe(0);
        expect(state.numPendingSets.peek()).toBe(0);
        expect(state.error.peek()).toBeUndefined();
    });
});

describe('nested pending record prototypes', () => {
    const tick = () => promiseTimeout(0);
    for (const kind of ['constructor', 'null', 'null-to-plain'])
        for (const source of ['get', 'subscribe'])
            test(`nested ${kind} reconciles ${source} without losing authored fields`, async () => {
                const record = (authored: number, server: number, remote = false) => {
                    const value: any = { ...(kind === 'constructor' ? { constructor: 'data' } : {}), authored, server };
                    return kind === 'constructor' || (kind === 'null-to-plain' && remote)
                        ? value
                        : Object.setPrototypeOf(value, null);
                };
                let remote = { row: record(0, 0) };
                let release: () => void = () => {};
                let push: any;
                const errors: Error[] = [];
                const obs: any = observable(
                    synced<any>({
                        get: async () => remote,
                        set: () => new Promise<void>((resolve) => (release = resolve)),
                        subscribe: (p) => {
                            push = p.update;
                        },
                        onError: (e) => errors.push(e),
                    }),
                );
                obs.get();
                const state = syncState(obs);
                await when(state.isLoaded);
                obs.set({ row: record(1, 0) });
                await when(state.isSetting);
                try {
                    remote = { row: record(0, 2, true) };
                    if (source === 'get') await state.sync();
                    else push({ value: remote, mode: 'set' });
                    await tick();
                    await tick();
                    expect(obs.peek().row.authored).toBe(1);
                    expect(obs.peek().row.server).toBe(2);
                    expect(Object.getPrototypeOf(obs.peek().row)).toBe(
                        kind === 'constructor' ? Object.prototype : null,
                    );
                    expect(errors).toEqual([]);
                    push({ value: { row: record(1, 2) }, mode: 'set' });
                    await tick();
                    await tick();
                    expect(state.getPendingChanges()).toEqual({});
                } finally {
                    release();
                    await tick();
                    await tick();
                }
                expect(state.getPendingChanges()).toEqual({});
                expect(state.numPendingSets.peek()).toBe(0);
            });
});

test('a failed cache predecessor permits queued independent writes and retains replay intent', async () => {
    const failure = 'cache';
    const tick = () => promiseTimeout(0);
    const settle = async () => {
        for (let i = 0; i < 8; i++) await tick();
    };
    const copy = cloneFixture;
    class Persist {
        table: any = { a: 0, b: 0, c: 0 };
        metadata: any = {};
        getTable() {
            return copy(this.table);
        }
        getMetadata() {
            return copy(this.metadata);
        }
        set(_name: string, changes: any[]) {
            this.table = copy(applyChanges(this.table, changes));
        }
        setMetadata(_name: string, value: any) {
            this.metadata = copy(value);
        }
        deleteTable() {}
        deleteMetadata() {}
    }
    let rejectA!: (error: Error) => void;
    let hold = true;
    class RejectedCache extends Persist {
        override set(name: string, changes: any[]) {
            if (failure === 'cache' && hold) {
                hold = false;
                return new Promise<void>((_, reject) => (rejectA = reject));
            }
            return super.set(name, changes);
        }
    }
    const cache = new RejectedCache();
    let server: any = { a: 0, b: 0, c: 0 };
    const sends: any[] = [];
    const errors: any[] = [];
    let gets = 0;
    const obs: any = observable(
        synced({
            initial: { a: 0, b: 0, c: 0 },
            get: () => {
                gets++;
                return copy(server);
            },
            persist: { name: 'queue-' + failure, plugin: cache, retrySync: true },
            set: (p: any) => {
                sends.push(copy(p.changes));
                server = applyChanges(server, p.changes);
                p.update({ value: undefined, changes: p.changes });
            },
            onError: (error: any) => errors.push(error.message),
        }),
    );
    obs.get();
    const state = syncState(obs);
    await when(state.isLoaded);
    await settle();
    // Arm after activation, so only authored A owns the failure.
    hold = true;
    obs.a.set(1);
    await settle();
    expect(typeof rejectA).toBe('function');
    obs.b.set(1);
    await settle();
    expect(sends).toHaveLength(0);
    expect(cache.table).toEqual({ a: 0, b: 0, c: 0 });
    rejectA(Error('A cache unavailable'));
    await settle();
    expect(server).toEqual({ a: 0, b: 1, c: 0 });
    expect(cache.table).toEqual({ a: 0, b: 1, c: 0 });
    expect(state.getPendingChanges()!.a.v).toBe(1);
    expect(state.getPendingChanges()!.b).toBeUndefined();
    expect(errors).toEqual(['A cache unavailable']);
    expect(state.numPendingSets.peek()).toBe(0);
    obs.c.set(1);
    await settle();
    expect(server).toEqual({ a: 0, b: 1, c: 1 });
    expect(cache.table).toEqual({ a: 0, b: 1, c: 1 });
    const priorGets = gets;
    await state.sync();
    await settle();
    expect(gets).toBe(priorGets + 1);
    expect(obs.peek()).toEqual({ a: 1, b: 1, c: 1 });
    expect(state.getPendingChanges()!.a.v).toBe(1);
    expect(sends.map((changes: any[]) => changes.map((change) => change.path))).toEqual([[['b']], [['c']]]);
    const fresh = new Persist();
    fresh.table = copy(cache.table);
    fresh.metadata = copy(cache.metadata);
    const replay: any[] = [];
    const restored: any = observable(
        synced({
            get: async () => copy(server),
            persist: { name: 'replay-' + failure, plugin: fresh, retrySync: true },
            set: (p: any) => {
                replay.push(copy(p.changes));
                server = applyChanges(server, p.changes);
                p.update({ value: undefined, changes: p.changes });
            },
        }),
    );
    restored.get();
    await when(syncState(restored).isLoaded);
    await settle();
    expect(server).toEqual({ a: 1, b: 1, c: 1 });
    expect(replay.flat().map((change: any) => change.path)).toEqual([['a']]);
    expect(syncState(restored).getPendingChanges()).toEqual({});
    expect(syncState(restored).numPendingSets.peek()).toBe(0);
    expect(fresh.table).toEqual({ a: 1, b: 1, c: 1 });
    expect(fresh.metadata.pending).toEqual({});
});

test('dependent metadata observes a failed predecessor without rejecting while a second cache is held', async () => {
    const tick = () => promiseTimeout(0);
    const settle = async () => {
        for (let i = 0; i < 8; i++) await tick();
    };
    let hold = false;
    let count = 0;
    let rejectA!: (error: Error) => void;
    let releaseB!: () => void;
    class Cache {
        table: any = { a: 0, b: 0, c: 0 };
        metadata: any = {};
        getTable() {
            return cloneFixture(this.table);
        }
        getMetadata() {
            return cloneFixture(this.metadata);
        }
        set(_name: string, changes: any[]) {
            if (hold && ++count === 1)
                return new Promise<void>((_resolve, reject) => {
                    rejectA = reject;
                });
            const apply = () => {
                this.table = cloneFixture(applyChanges(this.table, changes));
            };
            if (hold && count === 2)
                return new Promise<void>((resolve) => {
                    releaseB = () => {
                        apply();
                        resolve();
                    };
                });
            apply();
        }
        setMetadata(_name: string, value: any) {
            this.metadata = cloneFixture(value);
        }
        deleteTable() {}
        deleteMetadata() {}
    }
    const store = new Cache();
    const errors: any[] = [];
    const unhandled: any[] = [];
    const onUnhandled = (error: any) => unhandled.push(error);
    process.on('unhandledRejection', onUnhandled);
    let push!: (params: any) => void;
    try {
        const obs: any = observable(
            synced({
                initial: { a: 0, b: 0, c: 0 },
                get: () => ({ a: 0, b: 0, c: 0 }),
                subscribe: (params) => {
                    push = params.update;
                },
                persist: { name: 'failed-two-predecessors', plugin: store, retrySync: true },
                set: (params: any) => {
                    params.update({ value: undefined, changes: params.changes });
                },
                onError: (error, params) => errors.push({ error, source: params.source }),
            }),
        );
        obs.get();
        const state = syncState(obs);
        await when(state.isLoaded);
        await settle();
        hold = true;
        obs.a.set(1);
        await settle();
        obs.b.set(1);
        await settle();
        push({ value: { a: 0, b: 0, c: 1 }, mode: 'set' });
        await settle();
        rejectA(Error('first cache failed'));
        await settle();
        expect(typeof releaseB).toBe('function');
        expect(store.table.b).toBe(0);
        expect(unhandled).toEqual([]);
        expect(errors.map((entry) => entry.source)).toEqual(['set']);
        releaseB();
        await settle();
        await settle();
        expect(unhandled).toEqual([]);
        expect(store.table).toEqual({ a: 1, b: 1, c: 1 });
        expect(store.metadata.pending.a.v).toBe(1);
        expect(errors.some((entry) => entry.source === 'subscribe' || entry.source === 'get')).toBe(true);
        expect(state.numPendingSets.peek()).toBe(0);
        expect(state.numPendingGets.peek()).toBe(0);
    } finally {
        process.off('unhandledRejection', onUnhandled);
    }
});

describe('ordered pending preparation', () => {
    const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
    const settle = async () => {
        await tick();
        await tick();
    };
    class Persist {
        table: any = { a: 0 };
        metadata: any = {};
        getTable() {
            return cloneFixture(this.table);
        }
        getMetadata() {
            return cloneFixture(this.metadata);
        }
        set(_name: string, changes: any[]) {
            this.table = cloneFixture(applyChanges(this.table, changes));
        }
        setMetadata(_name: string, value: any) {
            this.metadata = cloneFixture(value);
        }
        deleteTable() {}
        deleteMetadata() {}
    }
    for (const map of [false, true])
        test(`newer reserved metadata retains intent when its cache write is interrupted map=${map}`, async () => {
            const data = (a: number): any => (map ? new Map([['a', a]]) : { a });
            const a = (value: any) => (map ? value.get('a') : value.a);
            let releaseTransform!: () => void;
            let releaseCache!: () => void;
            let held = true;
            class HeldPersist extends Persist {
                override set(name: string, changes: any[]) {
                    if (a(changes[0].valueAtPath) === 2)
                        return new Promise<void>((resolve) => {
                            releaseCache = () => {
                                super.set(name, changes);
                                resolve();
                            };
                        });
                    return super.set(name, changes);
                }
            }
            const store = new HeldPersist();
            store.table = data(0);
            const releases: (() => void)[] = [];
            const obs = observable(
                synced({
                    get: () => data(0),
                    persist: {
                        name: 'reserved-intent',
                        plugin: store,
                        retrySync: true,
                        transform: {
                            save: (value) => {
                                if (held && a(value) === 1) {
                                    held = false;
                                    return new Promise<any>((resolve) => {
                                        releaseTransform = () => resolve(value);
                                    });
                                }
                                return value;
                            },
                        },
                    },
                    set: () => new Promise<void>((resolve) => releases.push(resolve)),
                }),
            );
            obs.get();
            const state = syncState(obs);
            await when(state.isLoaded);
            obs.set(data(1));
            await settle();
            obs.set(data(2));
            await settle();
            releaseTransform();
            await settle();
            await settle();
            const copied = cloneFixture({ table: store.table, metadata: store.metadata });
            releaseCache();
            await settle();
            releases.forEach((resolve) => resolve());
            await settle();
            expect(copied.table).toEqual(data(1));
            expect(copied.metadata.pending[''].v).toEqual(data(2));
            const restored = new Persist();
            restored.table = copied.table;
            restored.metadata = copied.metadata;
            let server: any = data(0);
            const next = observable(
                synced({
                    get: async () => undefined,
                    persist: { name: 'reserved-restart', plugin: restored, retrySync: true },
                    set: (p) => {
                        server = applyChanges(server, p.changes);
                    },
                }),
            );
            next.get();
            const nextState = syncState(next);
            await when(nextState.isLoaded);
            await settle();
            await settle();
            expect(next.peek()).toEqual(data(2));
            expect(server).toEqual(data(2));
            expect(restored.table).toEqual(data(2));
            expect(nextState.getPendingChanges()).toEqual({});
            expect(nextState.numPendingSets.peek()).toBe(0);
        });
    test('a ready newer scope retains ownership while an older persistence transform is held', async () => {
        const store = new Persist();
        store.table = { a: 0, b: 0 };
        let release!: () => void;
        let push!: (p: any) => void;
        const obs = observable(
            synced({
                get: () => ({ a: 0, b: 0 }),
                subscribe: (p) => {
                    push = p.update;
                },
                persist: {
                    name: 'held-scope',
                    plugin: store,
                    retrySync: true,
                    transform: {
                        save: (value) => {
                            if (value.a === 1)
                                return new Promise<any>((resolve) => {
                                    release = () => resolve(value);
                                });
                            return value;
                        },
                    },
                },
                set: () => undefined,
            }),
        );
        obs.get();
        const state = syncState(obs);
        await when(state.isLoaded);
        obs.a.set(1);
        await settle();
        obs.b.set(2);
        await settle();
        push({ value: { a: 0, b: 0 }, mode: 'set' });
        await settle();
        const visible = cloneFixture(obs.peek());
        release();
        await settle();
        await settle();
        expect(visible.b).toBe(2);
    });
    for (const asynchronous of [false, true])
        test(`second remote preparation failure has its own error owner and can recover async=${asynchronous}`, async () => {
            let calls = 0;
            const error = new Error('second preparation');
            const errors: any[] = [];
            const sent: any[] = [];
            const obs = observable(
                synced({
                    initial: { a: 0 },
                    transform: {
                        save: (value) => {
                            if (++calls === 2) {
                                if (asynchronous) return Promise.reject(error);
                                throw error;
                            }
                            return value;
                        },
                    },
                    onError: (e, p) => errors.push({ e, source: p.source }),
                    set: (p) => {
                        sent.push(p.value);
                    },
                }),
            );
            obs.get();
            obs.set({ a: 1 });
            await settle();
            await settle();
            const state = syncState(obs);
            const recorded = errors.slice();
            const pending = cloneFixture(state.getPendingChanges());
            obs.set({ a: 2 });
            await settle();
            await settle();
            expect(recorded).toEqual([{ e: error, source: 'set' }]);
            expect(pending![''].v).toEqual({ a: 1 });
            expect(sent).toEqual([{ a: 2 }]);
            expect(state.getPendingChanges()).toEqual({});
            expect(state.numPendingSets.peek()).toBe(0);
        });
    test('debounced changes transform the merged local root before transport', async () => {
        const sent: any[] = [];
        const obs = observable(
            synced<any>({
                initial: { a: 0, b: 0 },
                debounceSet: 10,
                transform: { save: (value: any) => ({ ...value, total: (value.a || 0) + (value.b || 0) }) },
                set: (p) => {
                    sent.push(cloneFixture(p.changes));
                },
            }),
        );
        obs.get();
        obs.set({ a: 1, b: 1 });
        await settle();
        obs.b.set(2);
        await new Promise((resolve) => setTimeout(resolve, 20));
        await settle();
        expect(sent).toHaveLength(1);
        expect(sent[0][0].path).toEqual([]);
        expect(sent[0][0].valueAtPath).toEqual({ a: 1, b: 2, total: 3 });
        expect(syncState(obs).getPendingChanges()).toEqual({});
        expect(syncState(obs).numPendingSets.peek()).toBe(0);
    });
    for (const object of [false, true])
        test(`a held merged transform retains newer descendant ownership object=${object}`, async () => {
            const data = (a: number, b: number) => ({ a, b: object ? { value: b } : b });
            const b = (value: any) => (object ? value.b?.value : value.b);
            let release!: () => void;
            let held = false;
            const requests: any[] = [];
            let server: any = data(0, 0);
            const until = async (ready: () => boolean, label: string) => {
                for (let i = 0; i < 1000; i++) {
                    if (ready()) return;
                    await promiseTimeout(1);
                }
                throw new Error('Unreached boundary: ' + label);
            };
            const obs = observable(
                synced<any>({
                    initial: data(0, 0),
                    debounceSet: 10,
                    transform: {
                        save: (value: any) => {
                            if (!held && value.a === 1 && b(value) === 2) {
                                held = true;
                                const snapshot = cloneFixture(value);
                                return new Promise((resolve) => {
                                    release = () => resolve(snapshot);
                                });
                            }
                            return value;
                        },
                    },
                    set: (p) => new Promise<void>((resolve) => requests.push({ p, resolve })),
                }),
            );
            obs.get();
            obs.set(data(1, 1));
            await settle();
            obs.b.set(data(1, 2).b);
            await until(() => held, 'merged transform held');
            expect(typeof release).toBe('function');
            if (object) obs.b.value.set(3);
            else obs.b.set(3);
            await until(() => requests.length === 1, 'newer descendant sent');
            release();
            await until(() => requests.length === 2, 'held root sent');
            const root = requests.find((r) => !r.p.changes[0].path.length);
            const child = requests.find((r) => r.p.changes[0].path.length);
            expect(requests[0]).toBe(child);
            expect(b(root.p.changes[0].valueAtPath)).toBe(2);
            server = applyChanges(server, root.p.changes);
            root.p.update({ value: undefined, changes: root.p.changes });
            root.resolve();
            await until(() => syncState(obs).numPendingSets.peek() === 1, 'root settled');
            expect(b(obs.peek())).toBe(3);
            expect(syncState(obs).getPendingChanges()).toHaveProperty(object ? 'b/value' : 'b');
            server = applyChanges(server, child.p.changes);
            child.p.update({ value: undefined, changes: child.p.changes });
            child.resolve();
            await until(() => syncState(obs).numPendingSets.peek() === 0, 'child settled');
            expect(server).toEqual(data(1, 3));
            expect(obs.peek()).toEqual(server);
            expect(syncState(obs).getPendingChanges()).toEqual({});
            expect(syncState(obs).numPendingSets.peek()).toBe(0);
        });
});

describe('persistence repair and remote load liveness', () => {
    const settle = async () => {
        await promiseTimeout(10);
        await promiseTimeout(10);
    };
    class Store {
        table: any = { a: 1, b: 1 };
        metadata: any = { pending: { '': { p: { a: 0, b: 1 }, v: { a: 2, b: 1 }, t: [], h: [['a']], c: true } } };
        failure = Error('persistence repair unavailable');
        fail = false;
        stage = '';
        asyncReject = false;
        writes: any[] = [];
        getTable(): any {
            return cloneFixture(this.table);
        }
        getMetadata(): any {
            return cloneFixture(this.metadata);
        }
        set(_name: string, changes: any[]) {
            this.writes.push({ kind: 'cache', changes: cloneFixture(changes) });
            if (this.fail && this.stage === 'cache') {
                if (this.asyncReject) return Promise.reject(this.failure);
                throw this.failure;
            }
            this.table = applyChanges(this.table ?? {}, changes);
        }
        setMetadata(_name: string, value: any) {
            this.writes.push({ kind: 'metadata', value: cloneFixture(value) });
            if (this.fail && this.stage === 'metadata') {
                if (this.asyncReject) return Promise.reject(this.failure);
                throw this.failure;
            }
            this.metadata = cloneFixture(value);
        }
        deleteTable() {
            this.table = undefined;
        }
        deleteMetadata() {
            this.metadata = {};
        }
    }
    for (const mode of ['cache-throw', 'cache-reject', 'metadata-reject', 'transform-reject'])
        test(`startup ${mode} releases hydration, retains durable intent, and fresh work repairs cache`, async () => {
            const store = new Store();
            store.fail = true;
            store.stage = mode.split('-')[0];
            store.asyncReject = mode.endsWith('reject');
            const errors: any[] = [];
            const sent: any[] = [];
            let gets = 0;
            const obs = observable(
                synced({
                    initial: { a: 0, b: 1 },
                    persist: {
                        name: getPersistName(),
                        plugin: store,
                        retrySync: true,
                        transform: {
                            load: (value: any) => value,
                            save: (value: any) => {
                                if (store.fail && store.stage === 'transform') return Promise.reject(store.failure);
                                return value;
                            },
                        },
                    },
                    get: async () => {
                        gets++;
                        return { a: 0, b: 5 };
                    },
                    set: async (params) => {
                        sent.push(cloneFixture(params.value));
                        params.update({ value: params.value, changes: params.changes });
                    },
                    onError: (error, params) => errors.push({ error, source: params.source }),
                }),
            );
            const dispose = obs.onChange(() => {});
            try {
                obs.get();
                const state = syncState(obs);
                await settle();
                expect(state.isPersistLoaded.peek()).toBe(true);
                expect((state as any).numPendingLocalLoads.peek()).toBe(0);
                expect(typeof state.resetPersistence).toBe('function');
                expect(gets).toBeGreaterThan(0);
                expect(errors.some((value) => value.error === store.failure)).toBe(true);
                expect(sent).toEqual([]);
                expect(store.metadata.pending[''].v.a).toBe(2);
                const restartedStore = new Store();
                restartedStore.table = cloneFixture(store.table);
                restartedStore.metadata = cloneFixture(store.metadata);
                const replayed: any[] = [];
                const restarted = observable(
                    synced({
                        initial: { a: 0, b: 1 },
                        persist: { name: getPersistName(), plugin: restartedStore, retrySync: true },
                        get: async () => ({ a: 0, b: 5 }),
                        set: async (params) => {
                            replayed.push(cloneFixture(params.value));
                            params.update({ value: params.value, changes: params.changes });
                        },
                    }),
                );
                const stopRestarted = restarted.onChange(() => {});
                try {
                    restarted.get();
                    await settle();
                    expect(restarted.peek()).toEqual({ a: 2, b: 5 });
                    expect(replayed.length).toBeGreaterThan(0);
                    expect(restartedStore.table).toEqual({ a: 2, b: 5 });
                    expect(restartedStore.metadata.pending).toEqual({});
                    expect(syncState(restarted).getPendingChanges()).toEqual({});
                    expect(syncState(restarted).numPendingSets.peek()).toBe(0);
                } finally {
                    stopRestarted();
                }
                store.fail = false;
                obs.a.set(3);
                await state.sync();
                await settle();
                expect(state.isLoaded.peek()).toBe(true);
                expect(state.isSetting.peek()).toBe(false);
                expect(state.numPendingGets.peek()).toBe(0);
                expect(state.numPendingSets.peek()).toBe(0);
                expect(sent.length).toBeGreaterThan(0);
                expect(obs.peek()).toEqual({ a: 3, b: 5 });
                expect(store.table).toEqual({ a: 3, b: 5 });
                expect(state.getPendingChanges()).toEqual({});
                expect(store.metadata.pending).toEqual({});
            } finally {
                dispose();
            }
        });
    test('an immediate edit during a held startup repair is tracked and ACK waits for its cache', async () => {
        const store = new Store();
        let release!: () => void;
        let held = true;
        const sent: any[] = [];
        const obs = observable(
            synced({
                initial: { a: 0, b: 1 },
                persist: {
                    name: getPersistName(),
                    plugin: store,
                    retrySync: true,
                    transform: {
                        load: (value: any) => value,
                        save: (value: any) => {
                            if (held) {
                                held = false;
                                return new Promise((resolve) => {
                                    release = () => resolve(value);
                                });
                            }
                            return value;
                        },
                    },
                },
                get: async () => ({ a: 0, b: 5 }),
                set: async (params) => {
                    sent.push(cloneFixture(params.value));
                    params.update({ value: params.value, changes: params.changes });
                },
            }),
        );
        const dispose = obs.onChange(() => {});
        try {
            obs.get();
            obs.a.set(3);
            const state = syncState(obs);
            await settle();
            expect(state.isPersistLoaded.peek()).toBe(true);
            expect(typeof release).toBe('function');
            expect(sent).toEqual([]);
            expect(store.metadata.pending[''].v.a).toBe(2);
            release();
            await settle();
            expect(obs.peek()).toEqual({ a: 3, b: 5 });
            expect(store.table).toEqual({ a: 3, b: 5 });
            expect(state.getPendingChanges()).toEqual({});
            expect(store.metadata.pending).toEqual({});
            expect(state.numPendingSets.peek()).toBe(0);
        } finally {
            release?.();
            dispose();
        }
    });
    for (const source of ['get', 'subscribe'])
        for (const asyncReject of [false, true])
            test(`${source} pending metadata ${asyncReject ? 'rejection' : 'throw'} completes its applied load and recovers`, async () => {
                const store = new Store();
                store.table = { a: 2, b: 1 };
                store.stage = 'metadata';
                store.asyncReject = asyncReject;
                const errors: any[] = [];
                const sent: any[] = [];
                let push!: (value: any) => void;
                const obs = observable(
                    synced({
                        initial: { a: 0, b: 1 },
                        persist: { name: getPersistName(), plugin: store, retrySync: true },
                        get: source === 'get' ? async () => ({ a: 0, b: 5 }) : undefined,
                        subscribe:
                            source === 'subscribe'
                                ? (params) => {
                                      push = params.update;
                                  }
                                : undefined,
                        set: async (params) => {
                            sent.push(cloneFixture(params.value));
                            params.update({ value: params.value, changes: params.changes });
                        },
                        onError: (error, params) => errors.push({ error, source: params.source }),
                    }),
                );
                const dispose = obs.onChange(() => {});
                try {
                    if (source === 'get') store.fail = true;
                    obs.get();
                    const state = syncState(obs);
                    if (source === 'subscribe') {
                        await settle();
                        await state.reset();
                        obs.get();
                        obs.set({ a: 2, b: 1 });
                        await settle();
                        store.fail = true;
                        push({ value: { a: 0, b: 5 }, mode: 'set' });
                    }
                    await settle();
                    expect(state.isPersistLoaded.peek()).toBe(true);
                    expect(obs.peek()).toEqual({ a: 2, b: 5 });
                    expect(state.isLoaded.peek()).toBe(true);
                    expect(state.numPendingGets.peek()).toBe(0);
                    expect((state as any).numPendingRemoteLoads.peek() || 0).toBe(0);
                    expect(errors.some((value) => value.error === store.failure && value.source === source)).toBe(true);
                    expect(store.metadata.pending).not.toEqual({});
                    store.fail = false;
                    obs.a.set(3);
                    if (source === 'get') await state.sync();
                    else push({ value: { a: 0, b: 5 }, mode: 'set' });
                    await settle();
                    expect(state.isLoaded.peek()).toBe(true);
                    expect(state.numPendingSets.peek()).toBe(0);
                    expect(obs.peek()).toEqual({ a: 3, b: 5 });
                    expect(store.table).toEqual({ a: 3, b: 5 });
                    expect(state.getPendingChanges()).toEqual({});
                    expect(store.metadata.pending).toEqual({});
                } finally {
                    dispose();
                }
            });
    test('a failed remote load transform remains unloaded until data successfully applies', async () => {
        let fail = true;
        const errors: Error[] = [];
        const obs = observable(
            synced({
                initial: { a: 0 },
                get: async () => ({ a: 1 }),
                transform: {
                    load: async (value: any) => {
                        if (fail) throw Error('load transform unavailable');
                        return value;
                    },
                },
                onError: (error) => errors.push(error),
            }),
        );
        const dispose = obs.onChange(() => {});
        try {
            obs.get();
            const state = syncState(obs);
            await settle();
            expect(state.isLoaded.peek()).toBe(false);
            expect(errors).toHaveLength(1);
            expect(state.numPendingGets.peek()).toBe(0);
            fail = false;
            await state.sync();
            await settle();
            expect(state.isLoaded.peek()).toBe(true);
            expect(state.error.peek()).toBeUndefined();
            expect(obs.peek()).toEqual({ a: 1 });
        } finally {
            dispose();
        }
    });
    test('a confirming GET cannot clear durable intent while startup cache repair fails', async () => {
        const store = new Store();
        let rejectCache!: (error: Error) => void;
        const setCache = store.set.bind(store);
        let held = true;
        let firstCache = true;
        store.set = ((_name: string, changes: any[]) => {
            if (held) {
                if (!firstCache) return Promise.reject(store.failure);
                firstCache = false;
                return new Promise<void>((_resolve, reject) => {
                    rejectCache = reject;
                });
            }
            return setCache(_name, changes);
        }) as any;
        const errors: Error[] = [];
        const obs = observable(
            synced({
                initial: { a: 0, b: 1 },
                persist: { name: getPersistName(), plugin: store, retrySync: true },
                get: async () => ({ a: 2, b: 1 }),
                set: async (params) => params.update({ value: params.value, changes: params.changes }),
                onError: (error) => errors.push(error),
            }),
        );
        const dispose = obs.onChange(() => {});
        try {
            obs.get();
            const state = syncState(obs);
            await settle();
            expect(state.isPersistLoaded.peek()).toBe(true);
            expect(store.table).toEqual({ a: 1, b: 1 });
            expect(store.metadata.pending[''].v.a).toBe(2);
            expect(state.getPendingChanges()![''].v.a).toBe(2);
            rejectCache(store.failure);
            await settle();
            expect(errors).toContain(store.failure);
            expect(store.metadata.pending[''].v.a).toBe(2);
            expect(state.getPendingChanges()![''].v.a).toBe(2);
            held = false;
            await state.sync();
            await settle();
            expect(state.isLoaded.peek()).toBe(true);
            expect(state.numPendingGets.peek()).toBe(0);
            expect(store.table).toEqual({ a: 2, b: 1 });
            expect(store.metadata.pending).toEqual({});
        } finally {
            dispose();
        }
    });
    test('synchronous metadata failure after a confirming GET releases only the applied load', async () => {
        const store = new Store();
        store.table = { a: 2, b: 1 };
        store.stage = 'metadata';
        store.fail = true;
        const errors: Error[] = [];
        const obs = observable(
            synced({
                initial: { a: 0, b: 1 },
                persist: { name: getPersistName(), plugin: store, retrySync: true },
                get: () => ({ a: 2, b: 1 }),
                set: async (params) => params.update({ value: params.value, changes: params.changes }),
                onError: (error) => errors.push(error),
            }),
        );
        const dispose = obs.onChange(() => {});
        try {
            obs.get();
            const state = syncState(obs);
            await settle();
            expect(obs.peek()).toEqual({ a: 2, b: 1 });
            expect(state.isLoaded.peek()).toBe(true);
            expect(state.numPendingGets.peek()).toBe(0);
            expect((state as any).numPendingRemoteLoads.peek()).toBe(0);
            expect(errors).toContain(store.failure);
            store.fail = false;
            obs.a.set(3);
            await settle();
            expect(state.numPendingSets.peek()).toBe(0);
            expect(store.table).toEqual({ a: 3, b: 1 });
            expect(store.metadata.pending).toEqual({});
        } finally {
            dispose();
        }
    });
    for (const operation of ['reset', 'resetPersistence'] as const)
        for (const stage of ['transform', 'cache'] as const)
            test(`${operation} during held startup ${stage} repair does not revive cleared cache`, async () => {
                const store = new Store();
                let release!: () => void;
                let first = true;
                const rawSet = store.set.bind(store);
                if (stage === 'cache')
                    store.set = ((_name: string, changes: any[]) => {
                        if (first) {
                            first = false;
                            return new Promise<void>((resolve) => {
                                release = () => {
                                    rawSet(_name, changes);
                                    resolve();
                                };
                            });
                        }
                        return rawSet(_name, changes);
                    }) as any;
                const sent: any[] = [];
                const obs = observable(
                    synced({
                        initial: { a: 0, b: 1 },
                        syncMode: 'manual',
                        get: async () => undefined,
                        set: (params) => {
                            sent.push(cloneFixture(params.value));
                            params.update({ value: params.value, changes: params.changes });
                        },
                        persist: {
                            name: getPersistName(),
                            plugin: store,
                            retrySync: true,
                            transform: {
                                load: (value: any) => value,
                                save: (value: any) => {
                                    if (stage === 'transform' && first) {
                                        first = false;
                                        return new Promise<any>((resolve) => {
                                            release = () => resolve(value);
                                        });
                                    }
                                    return value;
                                },
                            },
                        },
                    }),
                );
                const dispose = obs.onChange(() => {});
                try {
                    obs.get();
                    const state = syncState(obs);
                    await settle();
                    expect(state.isPersistLoaded.peek()).toBe(true);
                    expect(typeof release).toBe('function');
                    const resetting = state[operation]();
                    await settle();
                    release();
                    await resetting;
                    await settle();
                    if (operation === 'reset') {
                        expect(obs.peek()).toEqual({ a: 0, b: 1 });
                        expect(store.table).toEqual({ a: 0, b: 1 });
                    } else {
                        expect(store.table).toBeUndefined();
                        expect(obs.peek()).toEqual({ a: 2, b: 1 });
                        expect(state.getPendingChanges()![''].v.a).toBe(2);
                    }
                    expect(store.metadata.pending || {}).toEqual({});
                    expect(sent).toEqual([]);
                    obs.a.set(4);
                    await settle();
                    await state.sync();
                    await settle();
                    expect(sent.length).toBeGreaterThan(0);
                    for (const value of sent) expect(value).toEqual({ a: 4, b: 1 });
                    expect(store.table).toEqual(operation === 'reset' ? { a: 4, b: 1 } : { a: 4 });
                    expect(state.getPendingChanges()).toEqual({});
                    expect(state.numPendingSets.peek()).toBe(0);
                } finally {
                    release?.();
                    dispose();
                }
            });
    test('a failed persistence reset keeps failed repair ownership until cache recovery', async () => {
        const store = new Store();
        store.stage = 'cache';
        store.fail = true;
        const deleteTable = store.deleteTable.bind(store);
        store.deleteTable = () => {
            if (store.fail) throw store.failure;
            deleteTable();
        };
        const errors: Error[] = [];
        const obs = observable(
            synced({
                initial: { a: 0, b: 1 },
                syncMode: 'manual',
                persist: { name: getPersistName(), plugin: store, retrySync: true },
                get: async () => ({ a: 2, b: 1 }),
                set: async (params) => params.update({ value: params.value, changes: params.changes }),
                onError: (error) => errors.push(error),
            }),
        );
        const dispose = obs.onChange(() => {});
        try {
            obs.get();
            const state = syncState(obs);
            await settle();
            expect(errors).toContain(store.failure);
            await expect(state.resetPersistence()).rejects.toBe(store.failure);
            expect(store.table).toEqual({ a: 1, b: 1 });
            expect(store.metadata.pending[''].v.a).toBe(2);
            await state.sync();
            await settle();
            expect(state.getPendingChanges()![''].v.a).toBe(2);
            expect(state.numPendingGets.peek()).toBe(0);
            store.fail = false;
            await state.sync();
            await settle();
            expect(state.isLoaded.peek()).toBe(true);
            expect(store.table).toEqual({ a: 2, b: 1 });
            expect(store.metadata.pending).toEqual({});
            await state.resetPersistence();
            expect(store.table).toBeUndefined();
            expect(store.metadata).toEqual({});
        } finally {
            store.fail = false;
            store.deleteTable = deleteTable;
            dispose();
        }
    });
});

describe('prepared local root acknowledgement', () => {
    const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
    const settle = async () => {
        await tick();
        await tick();
    };
    class Persist {
        table: any = { a: 0 };
        metadata: any = {};
        getTable() {
            return cloneFixture(this.table);
        }
        getMetadata() {
            return cloneFixture(this.metadata);
        }
        set(_name: string, changes: any[]) {
            this.table = cloneFixture(applyChanges(this.table, changes));
        }
        setMetadata(_name: string, value: any) {
            this.metadata = cloneFixture(value);
        }
        deleteTable() {}
        deleteMetadata() {}
    }
    for (const spec of [
        ...[false, true].flatMap((map) =>
            [false, true].flatMap((renamed) =>
                [false, true].map((explicit) => ({ map, renamed, explicit, opaque: false })),
            ),
        ),
        ...[false, true].map((explicit) => ({ map: false, renamed: true, explicit, opaque: true })),
    ])
        test(`prepared older root ACK retains a newer complete intent map=${spec.map} renamed=${spec.renamed} explicit=${spec.explicit} opaque=${spec.opaque}`, async () => {
            const { map, renamed, explicit, opaque } = spec;
            class Opaque {
                constructor(public a: number) {}
            }
            const data = (a: number): any => (map ? new Map([['a', a]]) : { a });
            const read = (value: any) => (map ? value.get('a') : value.a);
            const store = new Persist();
            store.table = data(0);
            const requests: any[] = [];
            let release!: () => void;
            let calls = 0;
            const save = (value: any) => (renamed ? { wire_a: read(value) * 10 } : value);
            const load = (value: any) => (renamed ? data(value.wire_a / 10) : value);
            const obs = observable(
                synced<any>({
                    initial: data(0),
                    persist: { name: 'prepared-old-root', plugin: store, retrySync: true },
                    transform: {
                        save: (value: any) => {
                            const wire = cloneFixture(save(value));
                            if (++calls === 2)
                                return new Promise((resolve) => {
                                    release = () => resolve(wire);
                                });
                            return wire;
                        },
                        load,
                    },
                    set: (p) => new Promise<void>((resolve) => requests.push({ p, resolve })),
                }),
            );
            obs.get();
            const state = syncState(obs);
            await when(state.isPersistLoaded);
            obs.set(opaque ? new Opaque(1) : data(1));
            await settle();
            expect(typeof release).toBe('function');
            obs.set(data(2));
            await settle();
            await settle();
            release();
            await settle();
            await settle();
            const older = requests.find(
                (r) =>
                    (renamed ? r.p.changes[0].valueAtPath.wire_a : read(r.p.changes[0].valueAtPath)) ===
                    (renamed ? 10 : 1),
            );
            const newer = requests.find((r) => r !== older);
            let server: any = save(data(0));
            server = applyChanges(server, older.p.changes);
            if (explicit) older.p.update({ value: undefined, changes: older.p.changes });
            older.resolve();
            await settle();
            const copied = cloneFixture({ table: store.table, metadata: store.metadata });
            newer.p.update({ value: undefined, changes: newer.p.changes, failedChanges: newer.p.changes });
            newer.resolve();
            await settle();
            const nextStore = new Persist();
            nextStore.table = copied.table;
            nextStore.metadata = copied.metadata;
            const next = observable(
                synced<any>({
                    get: async () => cloneFixture(server),
                    transform: { save, load },
                    persist: { name: 'prepared-root-restart', plugin: nextStore, retrySync: true },
                    set: (p) => {
                        server = applyChanges(server, p.changes);
                    },
                }),
            );
            next.get();
            const nextState = syncState(next);
            await when(nextState.isLoaded);
            await settle();
            await settle();
            expect(older.p.value).toEqual(save(data(2)));
            expect(copied.table).toEqual(data(2));
            expect(next.peek()).toEqual(data(2));
            expect(copied.metadata.pending['']?.v).toEqual(data(2));
            expect(load(server)).toEqual(data(2));
            expect(nextStore.table).toEqual(data(2));
            expect(nextState.getPendingChanges()).toEqual({});
            expect(nextState.numPendingSets.peek()).toBe(0);
        });
});

describe('prepared local root acknowledgement boundaries', () => {
    const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
    const settle = async () => {
        await tick();
        await tick();
    };
    class Persist {
        table: any = { a: 0 };
        metadata: any = {};
        getTable() {
            return cloneFixture(this.table);
        }
        getMetadata() {
            return cloneFixture(this.metadata);
        }
        set(_n: string, c: any[]) {
            this.table = cloneFixture(applyChanges(this.table, c));
        }
        setMetadata(_n: string, m: any) {
            this.metadata = cloneFixture(m);
        }
        deleteTable() {}
        deleteMetadata() {}
    }
    for (const kind of ['aba', 'undefined', 'null'] as const)
        test(`prepared root ACK respects ${kind} boundary`, async () => {
            class Opaque {
                constructor(public a: number) {}
            }
            const store = new Persist();
            const requests: any[] = [];
            let release!: () => void;
            let calls = 0;
            const save = (v: any) => (v == null ? v : { wire_a: v.a * 10 });
            const load = (v: any) => (v == null ? v : { a: v.wire_a / 10 });
            const obs = observable(
                synced<any>({
                    initial: { a: 0 },
                    persist: { name: 'ack-boundary', plugin: store, retrySync: true },
                    transform: {
                        save(v: any) {
                            const wire = cloneFixture(save(v));
                            if (++calls === 2)
                                return new Promise((r) => {
                                    release = () => r(wire);
                                });
                            return wire;
                        },
                        load,
                    },
                    set: (p) => new Promise<void>((resolve) => requests.push({ p, resolve })),
                }),
            );
            obs.get();
            const state = syncState(obs);
            await when(state.isPersistLoaded);
            const original = kind === 'aba' ? { a: 1 } : new Opaque(1);
            obs.set(original);
            await settle();
            expect(typeof release).toBe('function');
            const latest = kind === 'aba' ? original : kind === 'null' ? null : undefined;
            if (kind === 'aba') {
                obs.set({ a: 2 });
                await settle();
                original.a = 3;
                obs.set(original);
            } else obs.set(latest);
            await settle();
            await settle();
            release();
            await settle();
            await settle();
            const older = requests.find((r) => r.p.changes[0].valueAtPath?.wire_a === 10);
            expect(older).toBeDefined();
            older.p.update({ value: undefined, changes: older.p.changes });
            older.resolve();
            await settle();
            expect(Object.prototype.hasOwnProperty.call(state.getPendingChanges(), '')).toBe(true);
            expect(state.getPendingChanges()!['']!.v).toEqual(latest);
            expect(Object.prototype.hasOwnProperty.call(store.metadata.pending, '')).toBe(true);
            for (const request of requests.filter((r) => r !== older)) {
                request.p.update({ value: undefined, changes: request.p.changes, failedChanges: request.p.changes });
                request.resolve();
            }
            await settle();
            expect(state.numPendingSets.peek()).toBe(0);
        });
});

describe('pending collection own method data', () => {
    const settle = async () => {
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => setTimeout(r, 0));
    };
    for (const map of [false, true])
        for (const pending of [false, true])
            test(`${map ? 'Map' : 'Set'} own method data survives ${pending ? 'pending baseline refresh' : 'core get'}`, async () => {
                const data = (n: number, special: boolean) => {
                    const value: any = map ? new Map([['server', n]]) : new Set([n]);
                    if (special) {
                        for (const key of ['forEach', 'size', '__proto__', 'constructor'])
                            Object.defineProperty(value, key, {
                                value: 'data:' + key,
                                enumerable: true,
                                configurable: true,
                                writable: true,
                            });
                    }
                    return value;
                };
                let push!: (p: any) => void;
                let release!: (v?: any) => void;
                const errors: any[] = [];
                const initial = { title: 'old', server: data(1, !pending) };
                const obs = observable(
                    synced<any>({
                        get: async () => initial,
                        set: () =>
                            new Promise<void>((resolve) => {
                                release = resolve;
                            }),
                        subscribe: (p) => {
                            push = p.update;
                        },
                        onError: (e) => errors.push(e),
                    }),
                );
                obs.get();
                const state = syncState(obs);
                await when(state.isLoaded);
                if (pending) {
                    obs.set({ title: 'local', server: data(1, false) });
                    await when(state.isSetting);
                    push({ value: { title: 'old', server: data(2, true) }, mode: 'set' });
                    await settle();
                }
                expect(errors).toEqual([]);
                const result = obs.peek().server;
                for (const key of ['forEach', 'size', '__proto__', 'constructor'])
                    expect(Object.getOwnPropertyDescriptor(result, key)?.value).toBe('data:' + key);
                expect(
                    map ? Map.prototype.get.call(result, 'server') : Set.prototype.has.call(result, pending ? 2 : 1),
                ).toBe(map ? (pending ? 2 : 1) : true);
                if (pending) {
                    const previous = state.getPendingChanges()!['']!.p.server;
                    expect(Object.getOwnPropertyDescriptor(previous, 'forEach')?.value).toBe('data:forEach');
                    expect(obs.peek().title).toBe('local');
                    release();
                    await when(() => !state.isSetting.get());
                    expect(state.numPendingSets.peek()).toBe(0);
                    expect(state.getPendingChanges()).toEqual({});
                    expect(errors).toEqual([]);
                }
            });
});

describe('void root acknowledgement scope', () => {
    const settle = async () => {
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => setTimeout(r, 0));
    };
    for (const kind of ['plain', 'rootMap', 'nestedMap', 'nestedSet'] as const)
        for (const via of ['get', 'subscribe'] as const)
            test(`void ACK accepts advanced server baseline ${kind} ${via}`, async () => {
                const data = (a: number, b: number): any =>
                    kind === 'rootMap'
                        ? new Map([
                              ['a', a],
                              ['b', b],
                          ])
                        : {
                              a,
                              b:
                                  kind === 'nestedMap'
                                      ? new Map([['server', b]])
                                      : kind === 'nestedSet'
                                        ? new Set([b])
                                        : b,
                          };
                const read = (value: any) =>
                    kind === 'rootMap'
                        ? { a: value.get('a'), b: value.get('b') }
                        : {
                              a: value.a,
                              b:
                                  kind === 'nestedMap'
                                      ? value.b.get('server')
                                      : kind === 'nestedSet'
                                        ? [...value.b][0]
                                        : value.b,
                          };
                let server = data(0, 1);
                let release!: () => void;
                let push!: (p: any) => void;
                let calls = 0;
                const errors: any[] = [];
                const obs = observable(
                    synced<any>({
                        get: async () => server,
                        set: () => {
                            calls++;
                            return new Promise<void>((resolve) => (release = resolve));
                        },
                        subscribe:
                            via === 'subscribe'
                                ? (p) => {
                                      push = p.update;
                                  }
                                : undefined,
                        onError: (e) => errors.push(e),
                    }),
                );
                obs.get();
                const state = syncState(obs);
                await when(state.isLoaded);
                obs.set(data(1, 1));
                await when(state.isSetting);
                server = data(0, 2);
                if (via === 'get') await state.sync();
                else push({ value: server, mode: 'set' });
                await settle();
                expect(read(obs.peek())).toEqual({ a: 1, b: 2 });
                release();
                await when(() => !state.isSetting.get());
                await settle();
                expect(read(obs.peek())).toEqual({ a: 1, b: 2 });
                expect(errors).toEqual([]);
                expect(state.getPendingChanges()).toEqual({});
                expect(state.numPendingSets.peek()).toBe(0);
                expect(calls).toBe(1);
            });
    for (const map of [false, true])
        test(`void ACK after held waitForSet preserves newer root map=${map}`, async () => {
            const data = (a: number): any => (map ? new Map([['a', a]]) : { a });
            const read = (v: any) => (map ? v.get('a') : v.a);
            let waitRelease!: () => void;
            let waits = 0;
            const requests: any[] = [];
            const obs = observable(
                synced<any>({
                    initial: data(0),
                    waitForSet: () =>
                        ++waits === 1 ? new Promise<void>((resolve) => (waitRelease = resolve)) : undefined,
                    set: (p) => new Promise<void>((resolve) => requests.push({ p, resolve })),
                }),
            );
            obs.get();
            const state = syncState(obs);
            obs.set(data(1));
            await settle();
            expect(typeof waitRelease).toBe('function');
            obs.set(data(2));
            await settle();
            waitRelease();
            await settle();
            const older = requests.find((r) => read(r.p.changes[0].valueAtPath) === 1);
            const newer = requests.find((r) => read(r.p.changes[0].valueAtPath) === 2);
            expect(older).toBeDefined();
            expect(newer).toBeDefined();
            expect(read(older.p.value)).toBe(2);
            older.resolve();
            await settle();
            expect(read(obs.peek())).toBe(2);
            expect(read(state.getPendingChanges()!['']!.v)).toBe(2);
            expect(state.numPendingSets.peek()).toBe(1);
            newer.resolve();
            await when(() => !state.isSetting.get());
            expect(state.getPendingChanges()).toEqual({});
            expect(state.numPendingSets.peek()).toBe(0);
        });
    for (const map of [false, true])
        test(`void ACK uses immutable selected root after backend starts map=${map}`, async () => {
            const data = (a: number): any => (map ? new Map([['a', a]]) : { a });
            const read = (v: any) => (map ? v.get('a') : v.a);
            const requests: any[] = [];
            const obs = observable(
                synced<any>({
                    initial: data(0),
                    set: (p) =>
                        new Promise<void>((resolve) =>
                            requests.push({ p, resolve, copied: read(p.changes[0].valueAtPath) }),
                        ),
                }),
            );
            obs.get();
            const state = syncState(obs);
            const original = data(1);
            obs.set(original);
            await settle();
            obs.set(data(2));
            await settle();
            if (map) original.set('a', 3);
            else original.a = 3;
            obs.set(original);
            await settle();
            const older = requests.find((r) => r.copied === 1);
            expect(older).toBeDefined();
            older.resolve();
            await settle();
            expect(read(obs.peek())).toBe(3);
            expect(read(state.getPendingChanges()!['']!.v)).toBe(3);
            for (const request of requests.filter((r) => r !== older)) request.resolve();
            await when(() => !state.isSetting.get());
            expect(state.getPendingChanges()).toEqual({});
            expect(state.numPendingSets.peek()).toBe(0);
        });
    for (const map of [false, true])
        test(`void ACK selects pre-wait baseline after GET advances map=${map}`, async () => {
            const data = (a: number, b: number): any =>
                map
                    ? new Map([
                          ['a', a],
                          ['b', b],
                      ])
                    : { a, b };
            const read = (v: any) => (map ? { a: v.get('a'), b: v.get('b') } : { a: v.a, b: v.b });
            let server = data(0, 1);
            let waitRelease!: () => void;
            let release!: () => void;
            let called = false;
            const obs = observable(
                synced<any>({
                    get: async () => server,
                    waitForSet: () =>
                        !called
                            ? ((called = true), new Promise<void>((resolve) => (waitRelease = resolve)))
                            : undefined,
                    set: () => new Promise<void>((resolve) => (release = resolve)),
                }),
            );
            obs.get();
            const state = syncState(obs);
            await when(state.isLoaded);
            obs.set(data(1, 1));
            await settle();
            expect(typeof waitRelease).toBe('function');
            server = data(0, 2);
            await state.sync();
            await settle();
            waitRelease();
            await settle();
            release();
            await when(() => !state.isSetting.get());
            expect(read(obs.peek())).toEqual({ a: 1, b: 2 });
            expect(state.getPendingChanges()).toEqual({});
            expect(state.numPendingSets.peek()).toBe(0);
        });
});

describe('immutable local ACK snapshot', () => {
    const settle = async () => {
        for (let i = 0; i < 3; i++) await promiseTimeout(0);
    };
    for (const map of [false, true]) {
        for (const scenario of [
            { via: 'get', edit: 'none' },
            { via: 'subscribe', edit: 'none' },
            { via: 'subscribe', edit: 'revert' },
            { via: 'subscribe', edit: 'newer' },
        ]) {
            test(`backend payload mutation cannot change local ACK ownership map=${map} via=${scenario.via} edit=${scenario.edit}`, async () => {
                const data = (a: number, b: number): any =>
                    map
                        ? new Map([
                              ['a', a],
                              ['b', b],
                          ])
                        : { a, b };
                const copy = (value: any): any => (map ? new Map(value) : { ...value });
                const view = (value: any) => (map ? Object.fromEntries(value) : value);
                let server = data(0, 0);
                let push!: (params: any) => void;
                let started!: () => void;
                const firstStarted = new Promise<void>((resolve) => (started = resolve));
                const requests: { params: any; sent: any; resolve: () => void }[] = [];
                const errors: Error[] = [];
                const obs: any = observable(data(0, 0));
                const state = syncObservable(obs, {
                    get: () => copy(server),
                    set: (params) =>
                        new Promise<void>((resolve) => {
                            requests.push({ params, sent: copy(params.value), resolve });
                            started();
                        }),
                    subscribe: (params) => {
                        push = params.update;
                    },
                    onError: (error) => errors.push(error),
                });
                try {
                    obs.get();
                    await when(state.isLoaded);
                    obs.set(data(1, 0));
                    await firstStarted;
                    expect(view(requests[0].sent)).toEqual({ a: 1, b: 0 });
                    if (map) requests[0].params.value.set('a', 99);
                    else requests[0].params.value.a = 99;
                    expect(view(obs.peek())).toEqual({ a: 1, b: 0 });
                    server = data(0, 5);
                    if (scenario.via === 'get') state.sync();
                    else push({ value: copy(server), mode: 'set' });
                    await settle();
                    expect(view(obs.peek())).toEqual({ a: 1, b: 5 });
                    expect(state.getPendingChanges()).toHaveProperty('');
                    if (scenario.edit !== 'none') {
                        obs.set(data(2, 5));
                        await settle();
                        if (scenario.edit === 'revert') {
                            obs.set(data(1, 5));
                            await settle();
                        }
                    }
                    const expectedA = scenario.edit === 'newer' ? 2 : 1;
                    const expectedCalls = scenario.edit === 'revert' ? 3 : scenario.edit === 'newer' ? 2 : 1;
                    expect(requests).toHaveLength(expectedCalls);
                    requests[0].resolve();
                    await settle();
                    expect(view(obs.peek())).toEqual({ a: expectedA, b: 5 });
                    if (scenario.edit === 'newer') {
                        expect(view(state.getPendingChanges()![''].v)).toEqual({ a: 2, b: 5 });
                    } else expect(state.getPendingChanges()).toEqual({});
                    expect(state.numPendingSets.peek()).toBe(expectedCalls - 1);
                    for (const request of requests) request.resolve();
                    await settle();
                    expect(view(obs.peek())).toEqual({ a: expectedA, b: 5 });
                    expect(state.getPendingChanges()).toEqual({});
                    expect(state.numPendingSets.peek()).toBe(0);
                    expect(state.isSetting.peek()).toBe(false);
                    expect(state.error.peek()).toBeUndefined();
                    expect(errors).toEqual([]);
                    expect(requests).toHaveLength(expectedCalls);
                } finally {
                    for (const request of requests) request.resolve();
                    await settle();
                }
            });
        }
    }
});

test('a configured reviver alias cannot redefine immutable local ACK ownership', async () => {
    const previousReviver = internal.globalState.reviver;
    let selected: any;
    let push!: (params: any) => void;
    let started!: () => void;
    const firstStarted = new Promise<void>((resolve) => (started = resolve));
    let request!: { params: any; sent: any; resolve: () => void };
    let calls = 0;
    const errors: Error[] = [];
    const settle = async () => {
        for (let i = 0; i < 3; i++) await promiseTimeout(0);
    };
    configureLegendState({ jsonReviver: (key, value) => (key === '' && selected ? selected : value) });
    const obs: any = observable({ a: 0, b: 0 });
    const state = syncObservable(obs, {
        get: () => ({ a: 0, b: 0 }),
        waitForSet: ({ value }) => {
            selected = value;
        },
        set: (params) =>
            new Promise<void>((resolve) => {
                calls++;
                request = { params, sent: { ...params.value }, resolve };
                started();
            }),
        subscribe: (params) => {
            push = params.update;
        },
        onError: (error) => errors.push(error),
    });
    try {
        obs.get();
        await when(state.isLoaded);
        obs.set({ a: 1, b: 0 });
        await firstStarted;
        expect(request.sent).toEqual({ a: 1, b: 0 });
        expect(request.params.value).toBe(obs.peek());
        request.params.value.a = 99;
        expect(obs.peek()).toEqual({ a: 99, b: 0 });
        push({ value: { a: 0, b: 5 }, mode: 'set' });
        await settle();
        expect(obs.peek()).toEqual({ a: 99, b: 5 });
        request.resolve();
        await settle();
        expect(obs.peek()).toEqual({ a: 99, b: 5 });
        expect(state.getPendingChanges()).toHaveProperty('');
        expect(state.getPendingChanges()![''].v).toEqual({ a: 99, b: 5 });
        expect(state.numPendingSets.peek()).toBe(0);
        expect(state.isSetting.peek()).toBe(false);
        expect(state.error.peek()).toBeUndefined();
        expect(errors).toEqual([]);
        expect(calls).toBe(1);
        push({ value: { a: 99, b: 6 }, mode: 'set' });
        await settle();
        expect(obs.peek()).toEqual({ a: 99, b: 6 });
        expect(state.getPendingChanges()).toEqual({});
    } finally {
        internal.globalState.reviver = previousReviver;
        request?.resolve();
        await settle();
    }
});

describe('CRUD value root acknowledgement attempt ownership', () => {
    const settle = async () => {
        await promiseTimeout(0);
        await promiseTimeout(0);
        await promiseTimeout(0);
    };
    for (const as of ['value', 'array'] as const)
        for (const via of ['get', 'subscribe'] as const)
            for (const mutateInput of [false, true])
                for (const revert of [false, true])
                    test(`${as} ${via} keeps the selected ACK immutable (mutation=${mutateInput}, ABA=${revert})`, async () => {
                        const array = as === 'array';
                        const row = (a = 0, b = 0) => ({ id: 'r', a, b });
                        const pack = (a: number, b: number): any => (array ? [row(a, b)] : row(a, b));
                        const read = (value: any): any => (array ? value[0] : value);
                        let server = row();
                        let push!: () => void;
                        const requests: { params: any; sent: any; resolve: () => void }[] = [];
                        const errors: Error[] = [];
                        const options: any = {
                            update: (input: any, params: any) =>
                                new Promise<void>((resolve) => {
                                    requests.push({ params, sent: cloneFixture(input), resolve });
                                }),
                            onError: (error: Error) => errors.push(error),
                        };
                        if (array) {
                            options.as = 'array';
                            options.list = () => [cloneFixture(server)];
                        } else options.get = () => cloneFixture(server);
                        if (via === 'subscribe')
                            options.subscribe = (params: any) => {
                                push = () => params.update({ value: [cloneFixture(server)], mode: 'set' });
                            };
                        const obs: any = observable(syncedCrud(options));
                        obs.get();
                        const state = syncState(obs);
                        await when(state.isLoaded);
                        obs.set(pack(1, 0));
                        await settle();
                        expect(requests).toHaveLength(1);
                        expect(requests[0].sent.a).toBe(1);
                        if (mutateInput) read(requests[0].params.value).a = 99;
                        expect(read(obs.peek()).a).toBe(1);
                        server = row(0, 5);
                        if (via === 'subscribe') push();
                        else state.sync();
                        await settle();
                        expect(read(obs.peek())).toEqual(row(1, 5));
                        if (revert) {
                            obs.set(pack(2, 5));
                            await settle();
                        }
                        obs.set(pack(99, 5));
                        await settle();
                        expect(requests).toHaveLength(revert ? 3 : 2);
                        requests[0].resolve();
                        await settle();
                        expect(read(obs.peek()).a).toBe(99);
                        expect(state.numPendingSets.peek()).toBe(revert ? 2 : 1);
                        server = row(1, 6);
                        if (via === 'subscribe') push();
                        else state.sync();
                        await settle();
                        expect(read(obs.peek())).toEqual(row(99, 6));
                        expect(read(state.getPendingChanges()!['']!.v)).toEqual(row(99, 6));
                        for (const request of requests.slice(1)) request.resolve();
                        await settle();
                        expect(state.getPendingChanges()).toEqual({});
                        expect(state.numPendingSets.peek()).toBe(0);
                        expect(state.isSetting.peek()).toBe(false);
                        expect(state.numPendingGets.peek()).toBe(0);
                        expect(errors).toEqual([]);
                    });
    for (const via of ['get', 'subscribe'] as const)
        for (const mutateInput of [false, true])
            test(`ID replacement ${via} preserves the newer root (mutation=${mutateInput})`, async () => {
                const row = (id = 'r', a = 0, b = 0) => ({ id, a, b });
                let server = row();
                let push!: () => void;
                const requests: { params: any; resolve: () => void }[] = [];
                const save = (_input: any, params: any) =>
                    new Promise<void>((resolve) => requests.push({ params, resolve }));
                const errors: Error[] = [];
                const options: any = {
                    get: () => cloneFixture(server),
                    create: save,
                    update: save,
                    delete: async () => undefined,
                    onError: (error: Error) => errors.push(error),
                };
                if (via === 'subscribe')
                    options.subscribe = (params: any) => {
                        push = () => params.update({ value: [cloneFixture(server)], mode: 'set' });
                    };
                const obs: any = observable(syncedCrud(options));
                obs.get();
                const state = syncState(obs);
                await when(state.isLoaded);
                obs.set(row('r', 1, 0));
                await settle();
                expect(requests).toHaveLength(1);
                if (mutateInput) requests[0].params.value.a = 99;
                expect(obs.peek()).toEqual(row('r', 1, 0));
                server = row('r', 0, 5);
                if (via === 'subscribe') push();
                else state.sync();
                await settle();
                obs.set(row('s', 99, 5));
                await settle();
                expect(requests).toHaveLength(2);
                requests[0].resolve();
                await settle();
                expect(obs.peek()).toEqual(row('s', 99, 5));
                expect(state.getPendingChanges()!['']!.v).toEqual(row('s', 99, 5));
                requests[1].resolve();
                await settle();
                expect(obs.peek()).toEqual(row('s', 99, 5));
                expect(state.getPendingChanges()).toEqual({});
                expect(state.numPendingSets.peek()).toBe(0);
                expect(errors).toEqual([]);
            });
});

test('pending array history preserves values from an untracked observable getter between same-stack updates', async () => {
    const other = observable(0);
    const rows = (value: number, last: number, server: number) => [
        { id: 'a', value, server },
        { id: 'b', value: last, server },
    ];
    let armed = false;
    let fired = false;
    const local = [
        {
            id: 'a',
            get value() {
                return other.peek();
            },
            server: 0,
        },
        {
            id: 'b',
            get value() {
                if (armed && !fired) {
                    fired = true;
                    other.set(1);
                }
                return 1;
            },
            server: 0,
        },
    ];
    let push!: (params: any) => void;
    let started!: () => void;
    const firstStarted = new Promise<void>((resolve) => (started = resolve));
    let release!: () => void;
    const obs: any = observable(rows(0, 0, 0));
    const state = syncObservable(obs, {
        fieldId: 'id',
        get: async () => rows(0, 0, 0),
        set: () =>
            new Promise<void>((resolve) => {
                release = resolve;
                started();
            }),
        subscribe: (params) => {
            push = params.update;
        },
    });
    try {
        obs.get();
        await when(state.isLoaded);
        obs.set(local);
        await firstStarted;
        await promiseTimeout(0);
        armed = true;
        push({ value: rows(1, 0, 1), mode: 'set' });
        push({ value: rows(2, 0, 2), mode: 'set' });
        expect(fired).toBe(true);
        expect(other.peek()).toBe(1);
        expect(obs.peek()[0].value).toBe(1);
        expect(state.getPendingChanges()![''].v[0].value).toBe(1);
        await promiseTimeout(0);
        expect(obs.peek()[0].value).toBe(1);
        expect(state.getPendingChanges()![''].v[0].value).toBe(1);
        expect(state.error.peek()).toBeUndefined();
    } finally {
        release?.();
        await promiseTimeout(0);
    }
});

describe('shared observable persistence reset ownership', () => {
    const settle = async () => {
        await promiseTimeout(0);
        await promiseTimeout(0);
        await promiseTimeout(0);
    };
    class Store {
        table: any = { n: 0 };
        metadata: any = { lastSync: 1 };
        deletedTables: string[] = [];
        deletedMetadata: string[] = [];
        holdWrite = false;
        release?: () => void;
        fail = false;
        stage: 'table' | 'metadata' = 'table';
        asyncFailure = false;
        failure = new Error('earlier owner reset failed');
        getTable() {
            return cloneFixture(this.table);
        }
        getMetadata() {
            return this.metadata;
        }
        set(_name: string, changes: any[]) {
            const copied = cloneFixture(changes);
            const save = () => {
                for (const change of copied) {
                    if (!change.path.length) this.table = change.valueAtPath;
                    else {
                        this.table ||= {};
                        this.table[change.path[0]] = change.valueAtPath;
                    }
                }
            };
            if (this.holdWrite)
                return new Promise<void>((resolve) => {
                    this.release = () => {
                        save();
                        resolve();
                    };
                });
            save();
        }
        setMetadata(_name: string, metadata: any) {
            this.metadata = metadata;
        }
        deleteTable(name: string) {
            this.deletedTables.push(name);
            if (this.fail && this.stage === 'table') {
                if (this.asyncFailure) return Promise.reject(this.failure);
                throw this.failure;
            }
            this.table = undefined;
        }
        deleteMetadata(name: string) {
            this.deletedMetadata.push(name);
            if (this.fail && this.stage === 'metadata') {
                if (this.asyncFailure) return Promise.reject(this.failure);
                throw this.failure;
            }
            this.metadata = undefined;
        }
    }
    const attach = async (obs: any, store: Store, errors: Error[]) => {
        const state = syncObservable(obs, {
            persist: { name: getPersistName(), plugin: store },
            syncMode: 'manual',
            onError: (error) => errors.push(error),
        });
        await when(state.isPersistLoaded);
        await settle();
        return state;
    };
    test('reset waits for both owners and repeated resets leave both stores empty', async () => {
        const obs = observable({ n: 0 });
        const earlier = new Store();
        const latest = new Store();
        const errors: Error[] = [];
        const state = await attach(obs, earlier, errors);
        expect(await attach(obs, latest, errors)).toBe(state);
        earlier.holdWrite = true;
        obs.n.set(1);
        await settle();
        expect(typeof earlier.release).toBe('function');
        let complete = false;
        const resetting = state.resetPersistence().then(() => {
            complete = true;
        });
        try {
            await settle();
            expect(complete).toBe(false);
            expect(earlier.deletedTables).toEqual([]);
        } finally {
            earlier.release?.();
        }
        await resetting;
        await settle();
        expect(earlier.table).toBeUndefined();
        expect(earlier.metadata).toBeUndefined();
        expect(latest.table).toBeUndefined();
        expect(latest.metadata).toBeUndefined();
        await state.resetPersistence();
        expect(earlier.deletedTables).toHaveLength(2);
        expect(earlier.deletedMetadata).toHaveLength(2);
        expect(latest.deletedTables).toHaveLength(2);
        expect(latest.deletedMetadata).toHaveLength(2);
        expect(state.numPendingSets.peek()).toBe(0);
        expect(state.numPendingGets.peek()).toBe(0);
        expect(state.isSetting.peek()).toBe(false);
        expect(state.isGetting.peek()).toBe(false);
        expect(state.isPersistLoaded.peek()).toBe(true);
        expect(errors).toEqual([]);
    });
    for (const stage of ['table', 'metadata'] as const)
        for (const asyncFailure of [false, true])
            test(`earlier ${stage} failure rejects reset and a fresh retry recovers (async=${asyncFailure})`, async () => {
                const obs = observable({ n: 0 });
                const earlier = new Store();
                const latest = new Store();
                const errors: Error[] = [];
                const state = await attach(obs, earlier, errors);
                await attach(obs, latest, errors);
                obs.n.set(1);
                await settle();
                expect(earlier.table).toEqual({ n: 1 });
                expect(latest.table).toEqual({ n: 1 });
                earlier.stage = stage;
                earlier.asyncFailure = asyncFailure;
                earlier.fail = true;
                let resetting!: Promise<void>;
                expect(() => {
                    resetting = state.resetPersistence();
                }).not.toThrow();
                await expect(resetting).rejects.toBe(earlier.failure);
                await settle();
                expect(earlier.deletedTables).toHaveLength(1);
                expect(latest.table).toBeUndefined();
                expect(latest.metadata).toBeUndefined();
                if (stage === 'table') expect(earlier.table).toEqual({ n: 1 });
                else {
                    expect(earlier.table).toBeUndefined();
                    expect(earlier.metadata).toEqual({ lastSync: 1 });
                }
                expect(errors).toEqual([]);
                expect(state.error.peek()).toBeUndefined();
                expect(state.numPendingSets.peek()).toBe(0);
                expect(state.numPendingGets.peek()).toBe(0);
                expect(state.isSetting.peek()).toBe(false);
                expect(state.isGetting.peek()).toBe(false);
                earlier.fail = false;
                await state.resetPersistence();
                expect(earlier.table).toBeUndefined();
                expect(earlier.metadata).toBeUndefined();
                expect(latest.table).toBeUndefined();
                expect(latest.metadata).toBeUndefined();
                expect(earlier.deletedTables).toHaveLength(2);
                expect(latest.deletedTables).toHaveLength(2);
                obs.n.set(2);
                await settle();
                expect(earlier.table).toEqual({ n: 2 });
                expect(latest.table).toEqual({ n: 2 });
                await state.resetPersistence();
                expect(earlier.table).toBeUndefined();
                expect(earlier.metadata).toBeUndefined();
                expect(latest.table).toBeUndefined();
                expect(latest.metadata).toBeUndefined();
                expect(errors).toEqual([]);
            });
});

describe('raw Set snapshot witness isolation', () => {
    for (const nested of [false, true])
        test(`a raw Set snapshot ignores an inherited array index nested=${nested}`, async () => {
            const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, '0');
            const witness = { x: 0 };
            const data = (x: number): any => (nested ? { items: new Set([{ x }]) } : new Set([{ x }]));
            const read = (value: any): number => Set.prototype.values.call(nested ? value.items : value).next().value.x;
            const restore = () => {
                if (descriptor) Object.defineProperty(Array.prototype, '0', descriptor);
                else delete (Array.prototype as any)[0];
            };
            let saved: any;
            let calls = 0;
            const obs = observable(
                synced({
                    initial: data(0),
                    get: () => data(0),
                    waitForSet: () => {
                        Object.defineProperty(Array.prototype, '0', {
                            value: witness,
                            writable: true,
                            configurable: true,
                        });
                        return true;
                    },
                    set: (params) => {
                        restore();
                        calls++;
                        saved = cloneFixture(params.value);
                        params.update({ value: undefined, changes: params.changes });
                    },
                }),
            );
            try {
                obs.get();
                const state = syncState(obs);
                await when(state.isLoaded);
                obs.set(data(1));
                await promiseTimeout(0);
                await promiseTimeout(0);
                expect(calls).toBe(1);
                expect(witness).toEqual({ x: 0 });
                expect(read(saved)).toBe(1);
                expect(read(obs.peek())).toBe(1);
                expect(state.getPendingChanges()).toEqual({});
                expect(state.numPendingSets.peek()).toBe(0);
                expect(state.isSetting.peek()).toBe(false);
                expect(state.error.peek()).toBeUndefined();
            } finally {
                restore();
            }
        });
    test('a raw Set snapshot retains aliased intent through an older ACK and stale server value', async () => {
        const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, '0');
        const restore = () => {
            if (descriptor) Object.defineProperty(Array.prototype, '0', descriptor);
            else delete (Array.prototype as any)[0];
        };
        const data = (x: number, b?: number): any => {
            const item = { x };
            return { items: new Set([item]), shared: item, ...(b === undefined ? {} : { b }) };
        };
        const read = (value: any) => ({
            items: Set.prototype.values.call(value.items).next().value.x,
            shared: value.shared.x,
            b: value.b,
        });
        const settle = async () => {
            await promiseTimeout(0);
            await promiseTimeout(0);
        };
        let server = data(0);
        let first = true;
        let item: any;
        const requests: { resolve: () => void }[] = [];
        const errors: Error[] = [];
        const obs = observable(
            synced({
                initial: data(0),
                get: () => server,
                waitForSet: () => {
                    if (first) {
                        first = false;
                        Object.defineProperty(Array.prototype, '0', {
                            value: item,
                            writable: true,
                            configurable: true,
                        });
                    }
                    return true;
                },
                set: () => {
                    restore();
                    return new Promise<void>((resolve) => requests.push({ resolve }));
                },
                onError: (error) => errors.push(error),
            }),
        );
        try {
            obs.get();
            const state = syncState(obs);
            await when(state.isLoaded);
            const authored = data(1);
            item = authored.shared;
            obs.set(authored);
            await settle();
            expect(requests).toHaveLength(1);
            obs.shared.x.set(99);
            await settle();
            expect(requests).toHaveLength(2);
            expect(read(obs.peek())).toEqual({ items: 99, shared: 99, b: undefined });
            requests[0].resolve();
            await settle();
            server = data(1, 5);
            await state.sync();
            await settle();
            expect(read(obs.peek())).toEqual({ items: 99, shared: 99, b: 5 });
            expect((state.getPendingChanges() as PendingChanges)[''].h).toContainEqual(['items']);
            expect(state.numPendingSets.peek()).toBe(1);
            requests[1].resolve();
            await settle();
            obs.set(data(100, 5));
            await settle();
            expect(requests).toHaveLength(3);
            requests[2].resolve();
            await settle();
            expect(read(obs.peek())).toEqual({ items: 100, shared: 100, b: 5 });
            expect(state.getPendingChanges()).toEqual({});
            expect(state.numPendingSets.peek()).toBe(0);
            expect(state.isSetting.peek()).toBe(false);
            expect(errors).toEqual([]);
        } finally {
            restore();
            for (const request of requests) request.resolve();
            await settle();
        }
    });
});

describe('literal Map response fields', () => {
    for (const existing of [false, true])
        test(`multiple Map updates preserve own method and prototype fields existing=${existing}`, async () => {
            const fields = (value: number) =>
                JSON.parse(
                    `{"__proto__":{"literalResponseField":${value}},"constructor":{"saved":${value}},"get":{"saved":${value}},"set":{"saved":${value}},"peek":{"saved":${value}},"assign":{"saved":${value}}}`,
                );
            const old = Object.getOwnPropertyDescriptor(Object.prototype, 'literalResponseField');
            const patch = fields(2);
            const obs: any = observable(
                synced({
                    get: () => new Map([['r', { id: 'r', value: 0, ...(existing ? fields(0) : {}) }]]),
                    set: (params) => {
                        params.update({ value: new Map([['r', { value: 1 }]]) });
                        params.update({ value: new Map([['r', patch]]) });
                    },
                }),
            );
            try {
                obs.get();
                await promiseTimeout(0);
                obs.set(new Map([['r', { id: 'r', value: 1, ...(existing ? fields(0) : {}) }]]));
                await promiseTimeout(0);
                await promiseTimeout(0);
                expect(Object.getOwnPropertyDescriptor(Object.prototype, 'literalResponseField')).toEqual(old);
                const row = obs.peek().get('r');
                expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
                for (const key of Object.keys(patch))
                    expect(Object.getOwnPropertyDescriptor(row, key)!.value).toEqual(patch[key]);
                expect(patch).toEqual(fields(2));
                expect(syncState(obs).error.peek()).toBeUndefined();
                expect(syncState(obs).getPendingChanges()).toEqual({});
                expect(syncState(obs).numPendingSets.peek()).toBe(0);
            } finally {
                if (old) Object.defineProperty(Object.prototype, 'literalResponseField', old);
                else delete (Object.prototype as any).literalResponseField;
            }
        });
});

describe('Map response aggregation', () => {
    test('multiple patches keep typed keys and merge a repeated row without mutating patches', async () => {
        const first = { server: { first: 1 } };
        const second = { server: { second: 2 } };
        const obs: any = observable(
            synced({
                get: () =>
                    new Map<any, any>([
                        [1, { value: 0 }],
                        ['1', { value: 0 }],
                    ]),
                set: (params) => {
                    params.update({ value: new Map([[1, first]]) });
                    params.update({
                        value: new Map<any, any>([
                            [1, second],
                            ['1', { server: 'string' }],
                        ]),
                    });
                    params.update({ value: {}, changes: params.changes });
                    expect(first).toEqual({ server: { first: 1 } });
                    expect(second).toEqual({ server: { second: 2 } });
                    first.server.first = 99;
                },
            }),
        );
        obs.get();
        await promiseTimeout(0);
        obs.set(
            new Map<any, any>([
                [1, { value: 1 }],
                ['1', { value: 1 }],
            ]),
        );
        await promiseTimeout(0);
        await promiseTimeout(0);
        expect(obs.peek().get(1)).toEqual({ value: 1, server: { first: 1, second: 2 } });
        expect(obs.peek().get('1')).toEqual({ value: 1, server: 'string' });
        expect(syncState(obs).getPendingChanges()).toEqual({});
        expect(syncState(obs).numPendingSets.peek()).toBe(0);
    });
    test('function patches execute during application after the backend finishes', async () => {
        let calls = 0;
        let finish!: () => void;
        const obs: any = observable(
            synced({
                get: () => new Map([[1, { value: 0, server: 0 }]]),
                set: (params) => {
                    params.update({
                        value: new Map([
                            [
                                1,
                                {
                                    server: (previous: number) => {
                                        calls++;
                                        return previous + 1;
                                    },
                                },
                            ],
                        ]),
                    });
                    params.update({ value: new Map([[1, { second: 2 }]]) });
                    expect(calls).toBe(0);
                    return new Promise<void>((resolve) => {
                        finish = resolve;
                    });
                },
            }),
        );
        obs.get();
        await promiseTimeout(0);
        obs.set(new Map([[1, { value: 1, server: 0 }]]));
        await promiseTimeout(0);
        await promiseTimeout(0);
        expect(calls).toBe(0);
        finish();
        await promiseTimeout(0);
        await promiseTimeout(0);
        expect(calls).toBe(1);
        expect(obs.peek().get(1)).toEqual({ value: 1, server: 1, second: 2 });
        expect(syncState(obs).getPendingChanges()).toEqual({});
        expect(syncState(obs).numPendingSets.peek()).toBe(0);
    });
});

describe('ordinary pending child complete GET ownership', () => {
    const copy = (v: any) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
    const tick = () => new Promise<void>((r) => setTimeout(r, 0));
    const until = async (ready: () => boolean, label: string) => {
        for (let i = 0; i < 300; i++) {
            if (ready()) return;
            await tick();
        }
        throw new Error('Unreached boundary: ' + label);
    };
    class JSONPersist {
        tableJSON: string | undefined;
        metadataJSON = '{}';
        getTable(_name: string, initial: any) {
            return this.tableJSON === undefined ? initial : JSON.parse(this.tableJSON);
        }
        getMetadata() {
            return JSON.parse(this.metadataJSON);
        }
        set(_name: string, changes: any[]) {
            const before = this.tableJSON === undefined ? {} : JSON.parse(this.tableJSON);
            this.tableJSON = JSON.stringify(applyChanges(before, changes));
        }
        setMetadata(_name: string, metadata: any) {
            this.metadataJSON = JSON.stringify(metadata);
        }
        deleteTable() {
            this.tableJSON = undefined;
        }
        deleteMetadata() {
            this.metadataJSON = '{}';
        }
    }

    for (const kind of ['plain', 'crud'] as const)
        test(
            'ordinary complete omission preserves failed intent ' + kind,
            async () => {
                const initial =
                    kind === 'plain'
                        ? { row: { id: 'r', x: 0, other: 7 }, y: 0 }
                        : { r: { id: 'r', x: 0, other: 7 }, y: { id: 'y', value: 0 } };
                const omitted = kind === 'plain' ? { y: 6 } : { y: { id: 'y', value: 6 } };
                const rowKey = kind === 'plain' ? 'row' : 'r';
                const pendingKey = rowKey + '/x';
                const store = new JSONPersist();
                store.tableJSON = JSON.stringify(initial);
                const errors: string[] = [];
                const failure = new Error('expected backend failure');
                let reads = 0,
                    writes = 0;
                const get = (params: any) => {
                    reads++;
                    if (reads > 1) params.updateLastSync(1);
                    const value = reads > 1 ? omitted : initial;
                    return Promise.resolve(copy(kind === 'crud' ? Object.values(value) : value));
                };
                const persist = { name: 'ordinary-' + kind, plugin: store, retrySync: true };
                const obs: any =
                    kind === 'plain'
                        ? observable(undefined)
                        : observable(
                              syncedCrud({
                                  as: 'object',
                                  list: get,
                                  update: async () => {
                                      writes++;
                                      throw failure;
                                  },
                                  persist,
                                  onError: (e: Error) => errors.push(e.message),
                              }),
                          );
                if (kind === 'plain')
                    syncObservable(obs, {
                        get,
                        set: async () => {
                            writes++;
                            throw failure;
                        },
                        persist,
                        onError: (e: Error) => errors.push(e.message),
                    });
                obs.get();
                const state = syncState(obs);
                await until(() => state.isLoaded.peek() && state.isPersistLoaded.peek(), 'initial load');
                obs[rowKey].x.set(1);
                await until(() => writes === 1 && !state.isSetting.peek(), 'failed save');
                await until(() => JSON.parse(store.metadataJSON).pending?.[pendingKey]?.v === 1, 'durable authored1');
                const before = copy({
                    live: obs.peek(),
                    pending: state.getPendingChanges(),
                    metadata: JSON.parse(store.metadataJSON),
                });
                await state.sync();
                await until(
                    () => reads === 2 && !state.isGetting.peek() && JSON.parse(store.metadataJSON).lastSync === 1,
                    'omitted GET and metadata',
                );
                await tick();
                const after = copy({
                    live: obs.peek(),
                    pending: state.getPendingChanges(),
                    metadata: JSON.parse(store.metadataJSON),
                });
                const fresh = new JSONPersist();
                fresh.tableJSON = JSON.stringify(initial); // a cache write may lag durable metadata at a crash
                fresh.metadataJSON = store.metadataJSON;
                let finishGet!: (v: any) => void;
                const heldGet = new Promise<any>((r) => (finishGet = r));
                const replay: any[] = [];
                const releases: (() => void)[] = [];
                const restartPersist = { name: 'restart-' + kind, plugin: fresh, retrySync: true };
                const restarted: any =
                    kind === 'plain'
                        ? observable(undefined)
                        : observable(
                              syncedCrud({
                                  as: 'object',
                                  list: () => heldGet,
                                  update: (row) => {
                                      replay.push(copy(row));
                                      return new Promise<void>((r) => releases.push(r));
                                  },
                                  persist: restartPersist,
                              }),
                          );
                if (kind === 'plain')
                    syncObservable(restarted, {
                        get: () => heldGet,
                        set: (p: any) => {
                            replay.push(copy(p.changes));
                            return new Promise<void>((r) => releases.push(r));
                        },
                        persist: restartPersist,
                    });
                restarted.get();
                const next = syncState(restarted);
                await until(() => next.isPersistLoaded.peek(), 'restart persistence loaded');
                const restartBeforeGet = copy({ live: restarted.peek(), pending: next.getPendingChanges() });
                finishGet(copy(kind === 'crud' ? Object.values(initial) : initial));
                await until(() => next.isLoaded.peek(), 'restart GET loaded');
                await tick();
                const restartAfterGet = copy({ live: restarted.peek(), pending: next.getPendingChanges(), replay });
                releases.forEach((r) => r());
                await until(() => !next.isSetting.peek(), 'replay settled');
                expect(before.pending[pendingKey].k).toBeUndefined();
                expect(before.pending[pendingKey].d).toBeUndefined();
                expect(after.live[rowKey]?.x).toBe(1);
                expect(after.live.y).toEqual(omitted.y);
                expect(after.pending[pendingKey].v).toBe(1);
                expect(after.pending[pendingKey].k).toBeUndefined();
                expect(after.pending[pendingKey].d).toBeUndefined();
                expect(after.metadata.pending[pendingKey].k).toBeUndefined();
                expect(after.metadata.pending[pendingKey].d).toBeUndefined();
                expect(after.metadata.pending[pendingKey].v).toBe(1);
                expect(restartBeforeGet.live[rowKey]?.x).toBe(1);
                expect(restartAfterGet.live[rowKey]?.x).toBe(1);
                expect(kind === 'plain' ? replay[0][0].valueAtPath : replay[0].x).toBe(1);
                expect(Object.keys(next.getPendingChanges() || {})).toEqual([]);
                expect(next.numPendingSets.peek()).toBe(0);
                expect(next.isSetting.peek()).toBe(false);
                expect(errors).toEqual([failure.message]);
            },
            5000,
        );

    for (const kind of ['plain', 'crud'] as const)
        test(
            'ordinary omission retains newer intent after an older ACK ' + kind,
            async () => {
                const initial: any =
                    kind === 'plain'
                        ? { row: { id: 'r', x: 0, other: 7 }, y: 0 }
                        : { r: { id: 'r', x: 0, other: 7 }, y: { id: 'y', value: 0 } };
                const omitted: any = kind === 'plain' ? { y: 6 } : { y: { id: 'y', value: 6 } };
                const rowKey = kind === 'plain' ? 'row' : 'r';
                const pendingKey = rowKey + '/x';
                const store = new JSONPersist();
                store.tableJSON = JSON.stringify(initial);
                let reads = 0;
                let creates = 0;
                let server: any = copy(initial);
                const requests: any[] = [];
                const releases: (() => void)[] = [];
                const errors: string[] = [];
                const get = () =>
                    Promise.resolve(
                        copy(
                            kind === 'crud'
                                ? Object.values(++reads > 1 ? omitted : initial)
                                : ++reads > 1
                                  ? omitted
                                  : initial,
                        ),
                    );
                const save = (input: any) => {
                    const sent = copy(kind === 'plain' ? input.value : input);
                    requests.push(sent);
                    return new Promise<void>((resolve) =>
                        releases.push(() => {
                            if (kind === 'plain') server = sent;
                            else server[rowKey] = sent;
                            resolve();
                        }),
                    );
                };
                const persist = { name: 'older-' + kind, plugin: store, retrySync: true };
                const obs: any =
                    kind === 'plain'
                        ? observable(undefined)
                        : observable(
                              syncedCrud({
                                  as: 'object',
                                  list: get,
                                  update: save,
                                  create: async () => {
                                      creates++;
                                  },
                                  persist,
                                  onError: (e: Error) => errors.push(e.message),
                              }),
                          );
                if (kind === 'plain')
                    syncObservable(obs, { get, set: save, persist, onError: (e: Error) => errors.push(e.message) });
                const state = syncState(obs);
                obs.get();
                try {
                    await until(() => state.isLoaded.peek() && state.isPersistLoaded.peek(), 'older initial load');
                    obs[rowKey].x.set(1);
                    await until(() => requests.length === 1, 'older first save');
                    await state.sync();
                    await until(() => reads === 2 && !state.isGetting.peek(), 'older omission GET');
                    expect(obs.peek()[rowKey]?.x).toBe(1);
                    expect(obs.peek().y).toEqual(omitted.y);
                    expect(JSON.parse(store.metadataJSON).pending[pendingKey].k).toBeUndefined();
                    obs[rowKey].x.set(2);
                    await until(
                        () => requests.length === 2 && JSON.parse(store.metadataJSON).pending?.[pendingKey]?.v === 2,
                        'newer durable save',
                    );
                    releases[0]();
                    await until(() => state.numPendingSets.peek() === 1, 'older ACK settled');
                    expect(obs.peek()[rowKey].x).toBe(2);
                    expect(state.getPendingChanges()![pendingKey].v).toBe(2);
                    expect(JSON.parse(store.metadataJSON).pending[pendingKey].v).toBe(2);
                    releases[1]();
                    await until(() => !state.isSetting.peek(), 'newer ACK settled');
                    expect(server[rowKey].x).toBe(2);
                    expect(state.getPendingChanges()).toEqual({});
                    expect(state.numPendingSets.peek()).toBe(0);
                    expect(creates).toBe(0);
                    expect(errors).toEqual([]);
                } finally {
                    releases.forEach((release) => release());
                    await until(() => !state.isSetting.peek(), 'older test cleanup');
                }
            },
            5000,
        );
});

describe('row baseline ownership across omitted snapshots', () => {
    const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
    const until = async (ready: () => boolean, label: string) => {
        for (let i = 0; i < 300; i++) {
            if (ready()) return;
            await tick();
        }
        throw new Error('Unreached row-owner boundary: ' + label);
    };
    const copy = (v: any) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
    class JsonCache {
        tableJSON: string | undefined;
        metadataJSON = '{}';
        getTable() {
            return this.tableJSON === undefined ? undefined : internal.safeParse(this.tableJSON);
        }
        getMetadata() {
            return JSON.parse(this.metadataJSON);
        }
        set(_name: string, changes: any[]) {
            this.tableJSON = internal.safeStringify(applyChanges(this.getTable(), changes));
        }
        setMetadata(_name: string, metadata: any) {
            this.metadataJSON = JSON.stringify(metadata);
        }
        deleteTable() {
            this.tableJSON = undefined;
        }
        deleteMetadata() {
            this.metadataJSON = '{}';
        }
    }
    for (const mode of ['object', 'Map'] as const)
        for (const cacheKind of ['actual', 'stale'] as const)
            test(
                'whole-row omission preserves UPDATE owner ' + mode + '/' + cacheKind,
                async () => {
                    const id = mode === 'Map' ? 'x' : 'r';
                    const initial = { id, value: 0, other: 7 };
                    const backend = new Map<string, any>([
                        [id, copy(initial)],
                        ['y', { id: 'y', value: 0 }],
                    ]);
                    const pack = (rows: any[]) =>
                        mode === 'Map'
                            ? new Map(rows.map((row) => [row.id, row]))
                            : Object.fromEntries(rows.map((row) => [row.id, row]));
                    const cache = new JsonCache();
                    cache.tableJSON = internal.safeStringify(pack(Array.from(backend.values())));
                    const staleJSON = cache.tableJSON;
                    let filtered = false,
                        reads = 0,
                        updates = 0,
                        creates = 0;
                    const errors: string[] = [];
                    const list = (params: any) => {
                        reads++;
                        if (filtered) params.updateLastSync(1);
                        return Promise.resolve(
                            Array.from(backend.values())
                                .filter((row) => !filtered || row.id !== id)
                                .map(copy),
                        );
                    };
                    const obs: any = observable(
                        syncedCrud({
                            as: mode,
                            list,
                            update: async () => {
                                updates++;
                                throw new Error('row update unavailable');
                            },
                            create: async () => {
                                creates++;
                                throw new Error('unexpected original CREATE');
                            },
                            persist: { name: 'row-original-' + mode + '-' + cacheKind, plugin: cache, retrySync: true },
                            onError: (error) => errors.push(error.message),
                        }),
                    );
                    obs.get();
                    const state = syncState(obs);
                    await until(() => state.isLoaded.peek(), 'initial');
                    const authored = { ...initial, value: 1 };
                    if (mode === 'Map') obs.set(id, authored);
                    else obs[id].set(authored);
                    await until(
                        () =>
                            updates === 1 &&
                            !state.isSetting.peek() &&
                            JSON.parse(cache.metadataJSON).pending?.[id]?.v?.value === 1,
                        'failed UPDATE durable',
                    );
                    filtered = true;
                    backend.set('y', { id: 'y', value: 6 });
                    state.sync();
                    await until(
                        () => reads === 2 && !state.isGetting.peek() && JSON.parse(cache.metadataJSON).lastSync === 1,
                        'omitted full GET',
                    );
                    const after = copy({
                        row: mode === 'Map' ? obs.peek().get(id) : obs.peek()[id],
                        pending: state.getPendingChanges(),
                        metadata: JSON.parse(cache.metadataJSON),
                    });
                    backend.set('y', { id: 'y', value: 7 });
                    state.sync();
                    await until(() => reads === 3 && !state.isGetting.peek(), 'repeated omitted full GET');
                    expect(JSON.parse(cache.metadataJSON).pending[id].p).toEqual(initial);
                    const fresh = new JsonCache();
                    fresh.tableJSON = cacheKind === 'stale' ? staleJSON : cache.tableJSON;
                    fresh.metadataJSON = cache.metadataJSON;
                    let finishGet!: (rows: any[]) => void;
                    const heldGet = new Promise<any[]>((resolve) => (finishGet = resolve));
                    let replayUpdates = 0,
                        replayCreates = 0;
                    const replayErrors: string[] = [];
                    const restarted: any = observable(
                        syncedCrud({
                            as: mode,
                            list: () => heldGet,
                            update: async (row) => {
                                replayUpdates++;
                                backend.set(row.id, { ...backend.get(row.id), ...row });
                            },
                            create: async (row) => {
                                replayCreates++;
                                if (backend.has(row.id)) throw new Error('duplicate existing row');
                                backend.set(row.id, copy(row));
                            },
                            persist: { name: 'row-restart-' + mode + '-' + cacheKind, plugin: fresh, retrySync: true },
                            onError: (error) => replayErrors.push(error.message),
                        }),
                    );
                    restarted.get();
                    const next = syncState(restarted);
                    await until(() => next.isPersistLoaded.peek(), 'restart cache');
                    const restartBeforeGet = copy({
                        row: mode === 'Map' ? restarted.peek().get(id) : restarted.peek()[id],
                        pending: next.getPendingChanges(),
                    });
                    finishGet(
                        Array.from(backend.values())
                            .filter((row) => row.id !== id)
                            .map(copy),
                    );
                    await until(
                        () => next.isLoaded.peek() && replayUpdates + replayCreates > 0 && !next.isSetting.peek(),
                        'restart replay',
                    );
                    expect(after.metadata.pending[id].p).toEqual(initial);
                    expect(after.pending[id].p).toEqual(initial);
                    expect([replayUpdates, replayCreates]).toEqual([1, 0]);
                    expect(backend.get(id)).toEqual(authored);
                    expect(replayErrors).toEqual([]);
                    expect(next.getPendingChanges()).toEqual({});
                    expect(restartBeforeGet.row).toEqual(authored);
                    expect([updates, creates, errors]).toEqual([1, 0, ['row update unavailable']]);
                    expect(next.numPendingSets.peek()).toBe(0);
                    filtered = false;
                    state.sync();
                    await until(
                        () =>
                            reads === 4 &&
                            !state.isGetting.peek() &&
                            Object.keys(state.getPendingChanges() || {}).length === 0,
                        'original row confirmation',
                    );
                    expect(state.numPendingSets.peek()).toBe(0);
                },
                5000,
            );

    for (const mode of ['object', 'Map'] as const)
        test(
            'row owner advances only from a present GET and retains newer ACK intent ' + mode,
            async () => {
                const id = mode === 'Map' ? 'x' : 'r';
                const original = { id, value: 0, other: 7 };
                const backend = new Map<string, any>([
                    [id, copy(original)],
                    ['y', { id: 'y', value: 0 }],
                ]);
                const pack = (rows: any[]) =>
                    mode === 'Map'
                        ? new Map(rows.map((row) => [row.id, row]))
                        : Object.fromEntries(rows.map((row) => [row.id, row]));
                const cache = new JsonCache();
                cache.tableJSON = internal.safeStringify(pack(Array.from(backend.values())));
                let filtered = false,
                    reads = 0,
                    creates = 0;
                const requests: { row: any; resolve: () => void }[] = [],
                    errors: string[] = [];
                const obs: any = observable(
                    syncedCrud({
                        as: mode,
                        list: () => {
                            reads++;
                            return Promise.resolve(
                                Array.from(backend.values())
                                    .filter((row) => !filtered || row.id !== id)
                                    .map(copy),
                            );
                        },
                        update: (row) =>
                            new Promise<void>((resolve) => {
                                const sent = copy(row);
                                requests.push({
                                    row: sent,
                                    resolve: () => {
                                        backend.set(id, { ...backend.get(id), ...sent });
                                        resolve();
                                    },
                                });
                            }),
                        create: async () => {
                            creates++;
                            throw new Error('unexpected overlapping CREATE');
                        },
                        persist: { name: 'row-ack-' + mode, plugin: cache, retrySync: true },
                        onError: (error) => errors.push(error.message),
                    }),
                );
                obs.get();
                const state = syncState(obs);
                const row = () => (mode === 'Map' ? obs.peek().get(id) : obs.peek()[id]);
                const write = (value: number) =>
                    mode === 'Map' ? obs.set(id, { ...original, value }) : obs[id].set({ ...original, value });
                try {
                    await until(() => state.isLoaded.peek(), 'ACK initial');
                    write(1);
                    await until(() => requests.length === 1, 'first held row');
                    filtered = true;
                    backend.set('y', { id: 'y', value: 6 });
                    state.sync();
                    await until(() => reads === 2 && !state.isGetting.peek(), 'held omitted row');
                    expect(row().value).toBe(1);
                    expect(JSON.parse(cache.metadataJSON).pending[id].p).toEqual(original);
                    write(2);
                    await until(
                        () => requests.length === 2 && JSON.parse(cache.metadataJSON).pending[id].v.value === 2,
                        'newer durable row',
                    );
                    requests[0].resolve();
                    await until(() => state.numPendingSets.peek() === 1, 'older row ACK');
                    expect(row().value).toBe(2);
                    expect(state.getPendingChanges()![id].v.value).toBe(2);
                    filtered = false;
                    state.sync();
                    await until(
                        () =>
                            reads === 3 &&
                            !state.isGetting.peek() &&
                            JSON.parse(cache.metadataJSON).pending?.[id]?.p?.value === 1,
                        'present row rebase',
                    );
                    expect(row().value).toBe(2);
                    expect(JSON.parse(cache.metadataJSON).pending[id].p.value).toBe(1);
                    requests[1].resolve();
                    await until(() => !state.isSetting.peek(), 'newer row ACK');
                    expect(backend.get(id)).toEqual({ ...original, value: 2 });
                    expect(state.getPendingChanges()).toEqual({});
                    expect(state.numPendingSets.peek()).toBe(0);
                    expect([creates, errors]).toEqual([0, []]);
                } finally {
                    requests.forEach((request) => request.resolve());
                    await until(() => !state.isSetting.peek(), 'row ACK cleanup');
                }
            },
            5000,
        );
    for (const mode of ['object', 'Map'] as const)
        test(
            'true CREATE remains CREATE after an omitted snapshot ' + mode,
            async () => {
                const id = mode === 'Map' ? 'new-x' : 'new-r';
                const authored = { id, value: 1, other: 7 };
                const backend = new Map<string, any>([['y', { id: 'y', value: 0 }]]);
                const cache = new JsonCache();
                cache.tableJSON = internal.safeStringify(
                    mode === 'Map' ? new Map(backend) : Object.fromEntries(backend),
                );
                let reads = 0,
                    creates = 0,
                    updates = 0;
                const errors: string[] = [];
                const obs: any = observable(
                    syncedCrud({
                        as: mode,
                        list: () => {
                            reads++;
                            return Promise.resolve(Array.from(backend.values()).map(copy));
                        },
                        create: async () => {
                            creates++;
                            throw new Error('new row unavailable');
                        },
                        update: async () => {
                            updates++;
                            throw new Error('unexpected original UPDATE');
                        },
                        persist: { name: 'true-create-' + mode, plugin: cache, retrySync: true },
                        onError: (error) => errors.push(error.message),
                    }),
                );
                obs.get();
                const state = syncState(obs);
                await until(() => state.isLoaded.peek(), 'true CREATE initial');
                if (mode === 'Map') obs.set(id, authored);
                else obs[id].set(authored);
                await until(
                    () =>
                        creates === 1 &&
                        !state.isSetting.peek() &&
                        JSON.parse(cache.metadataJSON).pending?.[id]?.v?.value === 1,
                    'failed true CREATE durable',
                );
                state.sync();
                await until(() => reads === 2 && !state.isGetting.peek(), 'true CREATE omitted GET');
                const fresh = new JsonCache();
                fresh.tableJSON = cache.tableJSON;
                fresh.metadataJSON = cache.metadataJSON;
                let replayCreates = 0,
                    replayUpdates = 0;
                const replayErrors: string[] = [];
                const restarted: any = observable(
                    syncedCrud({
                        as: mode,
                        list: () => Promise.resolve(Array.from(backend.values()).map(copy)),
                        create: async (row) => {
                            replayCreates++;
                            if (backend.has(row.id)) throw new Error('duplicate true CREATE');
                            backend.set(row.id, copy(row));
                        },
                        update: async () => {
                            replayUpdates++;
                            throw new Error('unexpected replay UPDATE');
                        },
                        persist: { name: 'true-create-restart-' + mode, plugin: fresh, retrySync: true },
                        onError: (error) => replayErrors.push(error.message),
                    }),
                );
                restarted.get();
                const next = syncState(restarted);
                await until(
                    () => next.isLoaded.peek() && replayCreates + replayUpdates > 0 && !next.isSetting.peek(),
                    'true CREATE replay',
                );
                expect([replayCreates, replayUpdates]).toEqual([1, 0]);
                expect(backend.get(id)).toEqual(authored);
                expect(mode === 'Map' ? restarted.peek().get(id) : restarted.peek()[id]).toEqual(authored);
                expect(next.getPendingChanges()).toEqual({});
                expect([creates, updates, errors, replayErrors]).toEqual([1, 0, ['new row unavailable'], []]);
                state.sync();
                await until(
                    () =>
                        reads === 3 &&
                        !state.isGetting.peek() &&
                        Object.keys(state.getPendingChanges() || {}).length === 0,
                    'true CREATE original confirmation',
                );
                expect(state.numPendingSets.peek()).toBe(0);
            },
            5000,
        );
});

describe('unchanged root responses', () => {
    for (const map of [false, true])
        test(`an exact echo preserves existing array identities map=${map}`, async () => {
            const data = (n: number): any => (map ? new Map<string, any>([['rows', [{ n }]]]) : { rows: [{ n }] });
            const obs: any = observable(data(0));
            let started!: () => void;
            const sent = new Promise<void>((resolve) => (started = resolve));
            const state = syncObservable(obs, {
                set: async (p) => {
                    p.update({ value: p.value, changes: p.changes });
                    started();
                },
            });
            const next = data(1);
            const rows = map ? next.get('rows') : next.rows;
            obs.set(next);
            await sent;
            await when(() => !state.isSetting.get());
            expect(map ? obs.peek().get('rows') : obs.peek().rows).toBe(rows);
            expect(state.getPendingChanges()).toEqual({});
            expect(state.error.peek()).toBeUndefined();
        });

    for (const kind of ['value', 'metadata', 'sparse', 'frozen', 'accessor'] as const)
        test(`root reuse still applies a ${kind} canonical response`, async () => {
            const rows = [{ n: 1 }, { n: 2 }];
            if (kind === 'sparse') delete rows[0];
            const obs = observable({ rows: [{ n: 0 }], n: 0 });
            let reads = 0;
            let started!: () => void;
            const sent = new Promise<void>((resolve) => (started = resolve));
            const state = syncObservable(obs, {
                set: async (p) => {
                    const value: any = p.value;
                    if (kind === 'value') value.rows[0].n = 9;
                    if (kind === 'metadata') value.rows.extra = 'server';
                    if (kind === 'frozen') Object.freeze(value.rows);
                    if (kind === 'accessor')
                        Object.defineProperty(value, 'n', {
                            enumerable: true,
                            get() {
                                reads++;
                                return 9;
                            },
                        });
                    p.update({ value, changes: p.changes });
                    started();
                },
            });
            obs.set({ rows, n: 1 });
            await sent;
            await when(() => !state.isSetting.get());
            if (kind === 'value') expect(obs.rows[0].n.peek()).toBe(9);
            if (kind === 'metadata') expect((obs.peek().rows as any).extra).toBe('server');
            if (kind === 'sparse') {
                expect(0 in obs.peek().rows).toBe(true);
                expect(obs.peek().rows[0]).toBe(null);
            }
            if (kind === 'frozen') expect(Object.isFrozen(obs.peek().rows)).toBe(true);
            if (kind === 'accessor') {
                expect(obs.n.peek()).toBe(9);
                expect(reads).toBe(1);
            }
            expect(state.getPendingChanges()).toEqual({});
            expect(state.error.peek()).toBeUndefined();
        });
});

test('an equal root response still unions distinct Set members', async () => {
    const obs = observable({ members: new Set([{ n: 0 }]), n: 0 });
    let started!: () => void;
    const sent = new Promise<void>((resolve) => (started = resolve));
    const state = syncObservable(obs, {
        set: async (p) => {
            p.update({ value: p.value, changes: p.changes });
            started();
        },
    });
    obs.set({ members: new Set([{ n: 1 }]), n: 1 });
    await sent;
    await when(() => !state.isSetting.get());
    expect([...obs.peek().members]).toEqual([{ n: 1 }, { n: 1 }]);
    expect(state.getPendingChanges()).toEqual({});
});

describe('transport JSON interpretation', () => {
    for (const custom of [false, true])
        test(`transport retains native conversion and configured revival custom=${custom}`, async () => {
            const previous = internal.globalState.reviver;
            const value: any = custom
                ? { name: 'original' }
                : {
                      name: 'original',
                      date: new Date(1234),
                      map: new Map([['a', { n: 1 }]]),
                      set: new Set([1, 2]),
                      text: 'line\n\\u0032',
                  };
            let input: any;
            let started!: () => void;
            const sent = new Promise<void>((resolve) => (started = resolve));
            internal.globalState.reviver = custom ? (key, item) => (key === 'name' ? 'revived' : item) : undefined;
            try {
                const obs = observable<any>({ name: 'old' });
                const state = syncObservable(obs, {
                    set: async (p) => {
                        input = p.value;
                        started();
                    },
                });
                obs.set(value);
                await sent;
                await when(() => !state.isSetting.get());
                expect(input).not.toBe(value);
                expect(input.name).toBe(custom ? 'revived' : 'original');
                if (!custom) {
                    expect(input.date).toEqual(value.date);
                    expect(input.date).not.toBe(value.date);
                    expect(input.map).toEqual(value.map);
                    expect(input.set).toEqual(value.set);
                    expect(input.text).toBe(value.text);
                }
                expect(obs.peek()).toEqual(value);
                expect(state.getPendingChanges()).toEqual({});
            } finally {
                internal.globalState.reviver = previous;
            }
        });
});

test('an opaque array echo retains identity-based replacement semantics', async () => {
    const previous = internal.globalState.reviver;
    internal.globalState.reviver = (key, value) => (key === 'rows' ? ObservableHint.opaque(value) : value);
    try {
        const obs = observable({ rows: ObservableHint.opaque([0]), n: 0 });
        let started!: () => void;
        const sent = new Promise<void>((resolve) => (started = resolve));
        const state = syncObservable(obs, {
            set: async (p) => {
                p.update({ value: p.value, changes: p.changes });
                started();
            },
        });
        const rows = ObservableHint.opaque([1]);
        obs.set({ rows, n: 1 });
        await sent;
        await when(() => !state.isSetting.get());
        expect(obs.peek().rows).not.toBe(rows);
        expect(obs.peek().rows).toEqual([1]);
        expect(state.getPendingChanges()).toEqual({});
    } finally {
        internal.globalState.reviver = previous;
    }
});

test('an equal root ACK restores extensibility before the next array edit', async () => {
    const obs = observable({ rows: [0], n: 0 });
    let started!: () => void;
    const sent = new Promise<void>((resolve) => (started = resolve));
    const state = syncObservable(obs, {
        set: async (p) => {
            p.update({ value: p.value, changes: p.changes });
            started();
        },
    });
    obs.set({ rows: Object.preventExtensions([1]), n: 1 });
    await sent;
    await when(() => !state.isSetting.get());
    expect(state.getPendingChanges()).toEqual({});
    state.isSyncEnabled.set(false);
    expect(() => obs.rows.push(2)).not.toThrow();
    expect(obs.peek().rows).toEqual([1, 2]);
});

describe('superseded changes in one batch (#677)', () => {
    test('a root set after a child set does not send the stale child', async () => {
        const sets: any[] = [];
        const obs$ = observable(
            synced({
                initial: { a: 1, b: 1 },
                set: ({ value, changes }) => {
                    sets.push({
                        value: JSON.parse(JSON.stringify(value)),
                        paths: changes.map((c) => c.path.join('/')),
                    });
                },
            }),
        );
        obs$.get();
        await promiseTimeout(0);

        obs$.b.set(2);
        obs$.set({ a: 1, b: 1 });
        await promiseTimeout(10);

        expect(sets).toEqual([{ value: { a: 1, b: 1 }, paths: [''] }]);
        expect(obs$.get()).toEqual({ a: 1, b: 1 });
    });
});

describe('queued change merging', () => {
    test('writes queued in one tick reach set once, merged, with reverted writes dropped', async () => {
        const calls: { path: string[]; valueAtPath: unknown }[][] = [];
        const state$ = observable(
            synced({
                initial: { a: 0, b: 0, c: { d: 0 } } as Record<string, any>,
                set: ({ changes }) => {
                    calls.push(changes.map(({ path, valueAtPath }) => ({ path, valueAtPath })));
                },
            }),
        );
        state$.get();
        await promiseTimeout(0);

        state$.a.set(1);
        state$.b.set(1);
        state$.b.set(0);
        state$.c.set({ d: 1 });
        state$.c.d.set(2);
        state$.a.set(3);
        await promiseTimeout(0);

        expect(calls).toEqual([
            [
                { path: ['c'], valueAtPath: { d: 2 } },
                { path: ['a'], valueAtPath: 3 },
            ],
        ]);
    });
});
