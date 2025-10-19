/* eslint-disable no-var */
import { beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { observable } from '@legendapp/state';
import type { DataSnapshot } from 'firebase/database';
import { promiseTimeout } from './testglobals';

type AnyMock = ReturnType<typeof jest.fn>;

interface FirebaseAuthMock {
    getAuth: AnyMock;
}

var firebaseAuthMock: FirebaseAuthMock;

jest.mock('firebase/auth', () => {
    const authInstance = {
        app: {},
        currentUser: { uid: 'test-user' },
        onAuthStateChanged: jest.fn(),
    };
    const module: FirebaseAuthMock = {
        getAuth: jest.fn(() => authInstance),
    };
    firebaseAuthMock = module;
    return module;
});

type Listener = (snapshot: DataSnapshot) => void;

interface ListenerGroup {
    value: Listener[];
    childAdded: Listener[];
    childChanged: Listener[];
    childRemoved: Listener[];
}

const createListeners = (): ListenerGroup => ({
    value: [],
    childAdded: [],
    childChanged: [],
    childRemoved: [],
});

interface FirebaseDatabaseMock {
    getDatabase: AnyMock;
    ref: AnyMock;
    query: AnyMock;
    orderByChild: AnyMock;
    startAt: AnyMock;
    push: AnyMock;
    onValue: AnyMock;
    onChildAdded: AnyMock;
    onChildChanged: AnyMock;
    onChildRemoved: AnyMock;
    update: AnyMock;
    remove: AnyMock;
    serverTimestamp: AnyMock;
    __listeners: Map<string, ListenerGroup>;
    __reset: () => void;
}

var firebaseDatabaseMock: FirebaseDatabaseMock;

jest.mock('firebase/database', () => {
    const listeners = new Map<string, ListenerGroup>();

    const ensure = (path: string) => {
        if (!path) {
            throw new Error('Mock Firebase ref missing path');
        }
        if (!listeners.has(path)) {
            listeners.set(path, createListeners());
        }
        return listeners.get(path)!;
    };

    const module: FirebaseDatabaseMock = {
        getDatabase: jest.fn(() => ({ name: 'mock-db' })),
        ref: jest.fn((_db: any, path: string) => ({ path })),
        query: jest.fn((ref: any) => ref),
        orderByChild: jest.fn(() => ({})),
        startAt: jest.fn(() => ({})),
        push: jest.fn(() => ({ key: `mock-${Math.random().toString(36).slice(2)}` })),
        onValue: jest.fn((ref: any, cb: Listener) => {
            const entry = ensure(ref.path);
            entry.value.push(cb);
            return () => {
                entry.value = entry.value.filter((fn) => fn !== cb);
            };
        }),
        onChildAdded: jest.fn((ref: any, cb: Listener) => {
            const entry = ensure(ref.path);
            entry.childAdded.push(cb);
            return () => {
                entry.childAdded = entry.childAdded.filter((fn) => fn !== cb);
            };
        }),
        onChildChanged: jest.fn((ref: any, cb: Listener) => {
            const entry = ensure(ref.path);
            entry.childChanged.push(cb);
            return () => {
                entry.childChanged = entry.childChanged.filter((fn) => fn !== cb);
            };
        }),
        onChildRemoved: jest.fn((ref: any, cb: Listener) => {
            const entry = ensure(ref.path);
            entry.childRemoved.push(cb);
            return () => {
                entry.childRemoved = entry.childRemoved.filter((fn) => fn !== cb);
            };
        }),
        update: jest.fn(() => Promise.resolve()),
        remove: jest.fn(() => Promise.resolve()),
        serverTimestamp: jest.fn(() => ({ '.sv': 'timestamp' })),
        __listeners: listeners,
        __reset: () => {
            listeners.clear();
            module.getDatabase.mockClear();
            module.ref.mockClear();
            module.query.mockClear();
            module.orderByChild.mockClear();
            module.startAt.mockClear();
            module.push.mockClear();
            module.onValue.mockClear();
            module.onChildAdded.mockClear();
            module.onChildChanged.mockClear();
            module.onChildRemoved.mockClear();
            module.update.mockClear();
            module.remove.mockClear();
        },
    };

    firebaseDatabaseMock = module;

    return module;
});

const makeSnapshot = (key: string | null, value: any) =>
    ({
        key,
        val: () => value,
    }) as unknown as DataSnapshot;

const emitValue = (path: string, value: any) => {
    const entry = firebaseDatabaseMock.__listeners.get(path);
    if (!entry) {
        throw new Error(`No value listeners registered for path ${path}`);
    }
    const snapshot = makeSnapshot(null, value);
    entry.value.forEach((cb) => cb(snapshot));
};

const emitChildAdded = (path: string, key: string, value: any) => {
    const entry = firebaseDatabaseMock.__listeners.get(path);
    if (!entry) {
        throw new Error(`No childAdded listeners registered for path ${path}`);
    }
    const snapshot = makeSnapshot(key, value);
    entry.childAdded.forEach((cb) => cb(snapshot));
};

const emitChildChanged = (path: string, key: string, value: any) => {
    const entry = firebaseDatabaseMock.__listeners.get(path);
    if (!entry) {
        throw new Error(`No childChanged listeners registered for path ${path}`);
    }
    const snapshot = makeSnapshot(key, value);
    entry.childChanged.forEach((cb) => cb(snapshot));
};

const emitChildRemoved = (path: string, key: string) => {
    const entry = firebaseDatabaseMock.__listeners.get(path);
    if (!entry) {
        throw new Error(`No childRemoved listeners registered for path ${path}`);
    }
    const snapshot = makeSnapshot(key, null);
    entry.childRemoved.forEach((cb) => cb(snapshot));
};

let syncedFirebase: typeof import('../src/sync-plugins/firebase').syncedFirebase;

describe('syncedFirebase realtime updates', () => {
    const basePath = '/tests/items';
    let activePath = basePath;

    beforeAll(async () => {
        // @ts-expect-error This is fine
        const module = await import('../src/sync-plugins/firebase');
        syncedFirebase = module.syncedFirebase;
    });

    beforeEach(() => {
        firebaseDatabaseMock.__reset();
        firebaseAuthMock.getAuth.mockClear();
        activePath = basePath;
    });

    // Wait for the initial list subscription to be registered before emitting snapshots.
    const waitForValueListeners = async () => {
        for (let i = 0; i < 20; i++) {
            for (const [path, listeners] of firebaseDatabaseMock.__listeners.entries()) {
                if (listeners.value.length) {
                    activePath = path;
                    return;
                }
            }
            await promiseTimeout(0);
        }
        throw new Error('Expected list listener to be registered');
    };

    // Seed the local observable with the initial remote data set.
    const bootstrapList = async () => {
        await waitForValueListeners();
        emitValue(activePath, {
            item1: { id: 'item1', name: 'initial' },
        });
        await promiseTimeout(0);
    };

    // Let pending microtasks flush to simulate async Firebase behavior.
    const flushAsync = async (iterations = 5) => {
        for (let i = 0; i < iterations; i++) {
            await promiseTimeout(0);
        }
    };

    const createObservable = (overrides?: Record<string, any>) =>
        observable<Record<string, { id: string; name: string; test: string }>>(
            syncedFirebase({
                refPath: () => basePath,
                realtime: true,
                fieldId: 'id',
                as: 'object',
                ...(overrides || {}),
            }),
        );

    test('ignores stale remote payload when newer local write is pending', async () => {
        // Ensure older childChanged payloads are ignored while a newer local write is pending.
        const obs$ = createObservable();

        obs$.get();
        await bootstrapList();

        obs$.item1.name.set('local-1');
        await promiseTimeout(0);
        obs$.item1.name.set('local-2');
        await promiseTimeout(0);

        // Newer local value should remain despite stale remote payload.
        expect(obs$.item1.name.get()).toBe('local-2');

        emitChildChanged(activePath, 'item1', { id: 'item1', name: 'local-1' });
        await promiseTimeout(0);
        // Latest remote payload matches local state and should be applied.
        expect(obs$.item1.name.get()).toBe('local-2');

        emitChildChanged(activePath, 'item1', { id: 'item1', name: 'local-2' });
        await promiseTimeout(0);
        expect(obs$.item1.name.get()).toBe('local-2');
    });

    test('applies remote changes once pending writes drain', async () => {
        // After pending writes complete, newer remote payloads should update local state.
        const obs$ = createObservable();

        obs$.get();
        await bootstrapList();

        obs$.item1.name.set('local-change');
        await promiseTimeout(0);

        emitChildChanged(activePath, 'item1', { id: 'item1', name: 'local-change' });
        await promiseTimeout(0);
        expect(obs$.item1.name.get()).toBe('local-change');

        emitChildChanged(activePath, 'item1', { id: 'item1', name: 'remote-update' });
        await promiseTimeout(0);
        expect(obs$.item1.name.get()).toBe('remote-update');
    });

    test('handles remote child added events', async () => {
        // Verify new children appearing remotely are merged into the observable.
        const obs$ = createObservable();

        obs$.get();
        await bootstrapList();

        emitChildAdded(activePath, 'item2', { id: 'item2', name: 'added-from-remote' });
        await promiseTimeout(0);

        // Newly added remote child appears locally.
        expect(obs$.item2.name.get()).toBe('added-from-remote');
    });

    test('handles remote child removed events', async () => {
        // Confirm delete snapshots mark records as removed locally.
        const obs$ = createObservable();

        obs$.get();
        await bootstrapList();

        emitChildRemoved(activePath, 'item1');
        await promiseTimeout(0);

        const current = obs$.get();
        // Removed child should no longer exist in local snapshot.
        expect(current?.item1).toBeUndefined();
    });

    test('fills missing fieldId from snapshot key', async () => {
        // Ensure the plugin injects the fieldId when Firebase omits it in payloads.
        const obs$ = createObservable();

        obs$.get();
        await bootstrapList();

        emitChildChanged(activePath, 'item1', { name: 'remote-without-id' });
        await promiseTimeout(0);

        // Missing id is patched from the Firebase key.
        expect(obs$.item1.id.get()).toBe('item1');
        // Other fields still reflect remote payload.
        expect(obs$.item1.name.get()).toBe('remote-without-id');
    });

    // Utility helper to control when firebase.update resolves in tests.
    const createDeferred = () => {
        let resolve!: () => void;
        let reject!: (reason?: unknown) => void;
        const promise = new Promise<void>((res, rej) => {
            resolve = () => res();
            reject = rej;
        });
        return { promise, resolve, reject };
    };

    test('remote payload is applied only after pending update resolves', async () => {
        // Staged remote payload should not overwrite local state until firebase.update resolves.
        const deferred = createDeferred();
        firebaseDatabaseMock.update.mockImplementation(() => deferred.promise);

        const obs$ = createObservable();

        obs$.get();
        await bootstrapList();

        obs$.item1.name.set('pending-local');
        await flushAsync();

        emitChildChanged(activePath, 'item1', { id: 'item1', name: 'server-confirmed', '@': 1000 });
        await flushAsync();

        // Local state should stay pending until update resolves.
        expect(obs$.item1.name.get()).toBe('pending-local');

        deferred.resolve();
        await flushAsync();

        // After resolve with no new payload, local value remains latest write.
        expect(obs$.item1.name.get()).toBe('pending-local');
    });

    test('multiple pending updates wait for last write before applying staged payload', async () => {
        // Multiple pending writes should emit the final staged payload only after every update resolves.
        const deferreds: Array<ReturnType<typeof createDeferred>> = [];
        firebaseDatabaseMock.update.mockImplementation(() => {
            const deferred = createDeferred();
            deferreds.push(deferred);
            return deferred.promise;
        });

        const obs$ = createObservable();

        obs$.get();
        await bootstrapList();

        obs$.item1.name.set('first-local');
        await flushAsync();
        obs$.item1.name.set('second-local');
        await flushAsync();

        emitChildChanged(activePath, 'item1', { id: 'item1', name: 'server-final', '@': 2000 });
        await flushAsync();

        // Latest local write should still be visible before promises resolve.
        expect(obs$.item1.name.get()).toBe('second-local');

        deferreds[0]?.resolve();
        await flushAsync();
        // Resolving first write alone should not change the staged value.
        expect(obs$.item1.name.get()).toBe('second-local');

        deferreds[1]?.resolve();
        await flushAsync();
        // After every write resolves, local state still reflects last local change without extra payloads.
        expect(obs$.item1.name.get()).toBe('second-local');
    });

    test('unrelated remote field change waits for local name write to resolve', async () => {
        // Changing a different field remotely should not surface until the pending name update resolves.
        const deferred = createDeferred();
        firebaseDatabaseMock.update.mockImplementation(() => deferred.promise);

        const obs$ = createObservable();

        obs$.get();
        await bootstrapList();

        obs$.item1.name.set('pending-name');
        await flushAsync();

        emitChildChanged(activePath, 'item1', { id: 'item1', name: 'pending-name' });
        await flushAsync();

        emitChildChanged(activePath, 'item1', { id: 'item1', test: 'server-value' });
        await flushAsync();

        // Remote field change should not appear while name write is unresolved.
        expect(obs$.item1.test.get()).toBeUndefined();

        deferred.resolve();
        await flushAsync();

        // After resolve, the remote field should be visible.
        expect(obs$.item1.test.get()).toBe('server-value');
        // Name remains the pending local value since no newer remote name arrived.
        expect(obs$.item1.name.get()).toBe('pending-name');
    });

    test('pending name write persists even after remote payload replays post-save', async () => {
        // Remote snapshots emitted during the pending write do not override the local value even after resolve.
        const deferred = createDeferred();
        firebaseDatabaseMock.update.mockImplementation(() => deferred.promise);

        const obs$ = createObservable();

        obs$.get();
        await bootstrapList();

        obs$.item1.name.set('pending-name');
        await flushAsync();

        emitChildChanged(activePath, 'item1', { id: 'item1', name: 'pending-name', '@': 1000 });
        await flushAsync();
        emitChildChanged(activePath, 'item1', { id: 'item1', name: 'remote-final', '@': 2001 });
        await flushAsync();

        // Local value still reflects pending write before resolve.
        expect(obs$.item1.name.get()).toBe('pending-name');

        deferred.resolve();
        await flushAsync();

        expect(obs$.item1.name.get()).toBe('pending-name');
    });
});
