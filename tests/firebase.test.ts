/* eslint-disable no-var */
import { beforeAll, beforeEach, expect, jest, test } from '@jest/globals';
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
        // @ts-expect-error This works fine
        ({ syncedFirebase } = await import('../src/sync-plugins/firebase'));
    });

    beforeEach(() => {
        firebaseDatabaseMock.__reset();
        firebaseAuthMock.getAuth.mockClear();
        activePath = basePath;
    });

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

    const bootstrapList = async () => {
        await waitForValueListeners();
        emitValue(activePath, {
            item1: { id: 'item1', name: 'initial' },
        });
        await promiseTimeout(0);
    };

    const createObservable = (overrides?: Record<string, any>) =>
        observable<Record<string, { id: string; name: string }>>(
            syncedFirebase({
                refPath: () => basePath,
                realtime: true,
                fieldId: 'id',
                as: 'object',
                ...(overrides || {}),
            }),
        );

    test('ignores stale remote payload when newer local write is pending', async () => {
        const obs$ = createObservable();

        obs$.get();
        await bootstrapList();

        obs$.item1.name.set('local-1');
        await promiseTimeout(0);
        obs$.item1.name.set('local-2');
        await promiseTimeout(0);

        expect(obs$.item1.name.get()).toBe('local-2');

        emitChildChanged(activePath, 'item1', { id: 'item1', name: 'local-1' });
        await promiseTimeout(0);
        expect(obs$.item1.name.get()).toBe('local-2');

        emitChildChanged(activePath, 'item1', { id: 'item1', name: 'local-2' });
        await promiseTimeout(0);
        expect(obs$.item1.name.get()).toBe('local-2');
    });

    test('applies remote changes once pending writes drain', async () => {
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
        const obs$ = createObservable();

        obs$.get();
        await bootstrapList();

        emitChildAdded(activePath, 'item2', { id: 'item2', name: 'added-from-remote' });
        await promiseTimeout(0);

        expect(obs$.item2.name.get()).toBe('added-from-remote');
    });

    test('handles remote child removed events', async () => {
        const obs$ = createObservable();

        obs$.get();
        await bootstrapList();

        emitChildRemoved(activePath, 'item1');
        await promiseTimeout(0);

        const current = obs$.get();
        expect(current?.item1).toBeUndefined();
    });

    test('fills missing fieldId from snapshot key', async () => {
        const obs$ = createObservable();

        obs$.get();
        await bootstrapList();

        emitChildChanged(activePath, 'item1', { name: 'remote-without-id' });
        await promiseTimeout(0);

        expect(obs$.item1.id.get()).toBe('item1');
        expect(obs$.item1.name.get()).toBe('remote-without-id');
    });
});
