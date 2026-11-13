import { snapshotDetachedValue } from '../src/sync/syncObservable';

describe('snapshotDetachedValue', () => {
    test('detaches supported values while preserving Map keys and accepting shared references', () => {
        const shared = { count: 1 };
        const key = { id: 'key' };
        const member = { count: 2 };
        const date = new Date(1234);
        const frozen = Object.freeze({ child: { count: 3 } });
        const sealed = Object.seal({ child: { count: 4 } });
        const value = {
            shared: [shared, shared],
            map: new Map([[key, shared]]),
            set: new Set([member]),
            date,
            frozen,
            sealed,
            record: Object.assign(Object.create(null), { count: 5 }),
        };
        const state = { seen: new Set<object>(), supported: true };
        const snapshot = snapshotDetachedValue(value, state) as typeof value;

        expect(state.supported).toBe(true);
        expect(state.seen.size).toBe(0);
        expect(snapshot).toEqual(value);
        expect(snapshot).not.toBe(value);
        expect(snapshot.shared).not.toBe(value.shared);
        expect(snapshot.shared[0]).not.toBe(shared);
        expect(snapshot.shared[1]).not.toBe(shared);
        expect(snapshot.shared[0]).not.toBe(snapshot.shared[1]);
        expect(snapshot.map).not.toBe(value.map);
        expect([...snapshot.map.keys()][0]).toBe(key);
        expect(snapshot.map.get(key)).not.toBe(shared);
        expect(snapshot.set).not.toBe(value.set);
        expect([...snapshot.set][0]).not.toBe(member);
        expect(snapshot.date).not.toBe(date);
        expect(snapshot.frozen).not.toBe(frozen);
        expect(snapshot.sealed).not.toBe(sealed);
        expect(snapshot.record).not.toBe(value.record);
        expect(Object.getPrototypeOf(snapshot.record)).toBe(null);

        shared.count = 10;
        member.count = 20;
        date.setTime(9999);
        frozen.child.count = 30;
        sealed.child.count = 40;
        value.record.count = 50;

        expect(snapshot.shared).toEqual([{ count: 1 }, { count: 1 }]);
        expect(snapshot.map.get(key)).toEqual({ count: 1 });
        expect([...snapshot.set]).toEqual([{ count: 2 }]);
        expect(snapshot.date.getTime()).toBe(1234);
        expect(snapshot.frozen.child.count).toBe(3);
        expect(snapshot.sealed.child.count).toBe(4);
        expect(snapshot.record.count).toBe(5);

        snapshot.shared[0].count = 100;
        expect(shared.count).toBe(10);
        expect(snapshot.shared[1].count).toBe(1);
    });

    test('marks classes, cycles, accessors and throwing objects unsupported without throwing or retaining seen values', () => {
        class Instance {
            count = 1;
        }
        const record: { self?: unknown } = {};
        record.self = record;
        const array: unknown[] = [];
        array.push(array);
        const map = new Map();
        map.set('self', map);
        const set = new Set();
        set.add(set);
        let getterCalls = 0;
        const accessor = {
            get value() {
                getterCalls++;
                throw new Error('must not invoke getters');
            },
        };
        const throwing = new Proxy(
            {},
            {
                getPrototypeOf() {
                    throw new Error('cannot inspect prototype');
                },
            },
        );

        for (const value of [
            new Instance(),
            Object.freeze(new Instance()),
            Object.seal(new Instance()),
            record,
            array,
            map,
            set,
            accessor,
            throwing,
        ]) {
            const state = { seen: new Set<object>(), supported: true };
            expect(() => snapshotDetachedValue(value, state)).not.toThrow();
            expect(state.supported).toBe(false);
            expect(state.seen.size).toBe(0);

            state.supported = true;
            expect(snapshotDetachedValue({ count: 1 }, state)).toEqual({ count: 1 });
            expect(state.supported).toBe(true);
            expect(state.seen.size).toBe(0);
        }
        expect(getterCalls).toBe(0);
    });
});

test('detached arrays preserve own sparse slots and metadata without invoking inherited setters', () => {
    const tag = Symbol('tag');
    const value: any[] = new Array(4);
    Object.defineProperty(value, '1', { value: { count: 1 }, enumerable: false });
    Object.defineProperty(value, '__proto__', { value: { count: 2 }, enumerable: true });
    Object.defineProperty(value, tag, { value: { count: 3 }, enumerable: true });
    const state = { seen: new Set<object>(), supported: true };
    const previous = Object.getOwnPropertyDescriptor(Array.prototype, '1');
    let writes = 0;
    let snapshot: any;
    try {
        Object.defineProperty(Array.prototype, '1', {
            configurable: true,
            get: () => 'inherited',
            set: () => writes++,
        });
        snapshot = snapshotDetachedValue(value, state);
    } finally {
        if (previous) Object.defineProperty(Array.prototype, '1', previous);
        else delete Array.prototype[1];
    }
    expect(state.supported).toBe(true);
    expect(writes).toBe(0);
    expect(snapshot.length).toBe(4);
    expect(0 in snapshot).toBe(false);
    expect(2 in snapshot).toBe(false);
    expect(3 in snapshot).toBe(false);
    expect(snapshot[1]).toEqual({ count: 1 });
    expect(snapshot[1]).not.toBe(value[1]);
    expect(Object.getPrototypeOf(snapshot)).toBe(Array.prototype);
    expect(Object.getOwnPropertyDescriptor(snapshot, '__proto__')?.value).toEqual({ count: 2 });
    expect(snapshot[tag]).toEqual({ count: 3 });
    expect(snapshot[tag]).not.toBe((value as any)[tag]);
});

test('array snapshots retain the own length descriptor and ignore missing proxy descriptors', () => {
    for (const extra of [false, true])
        for (const rejectLength of [false, true]) {
            let reads = 0;
            const value = new Proxy([1], {
                ownKeys: (target) => [...Reflect.ownKeys(target), '4'],
                getOwnPropertyDescriptor: (target, key) =>
                    key === '4'
                        ? extra
                            ? { value: 2, enumerable: true, configurable: true, writable: true }
                            : undefined
                        : Reflect.getOwnPropertyDescriptor(target, key),
                get: (target, key) => {
                    if (key === 'length') {
                        reads++;
                        if (rejectLength) throw Error('must read the descriptor');
                    }
                    return Reflect.get(target, key);
                },
            });
            const state = { seen: new Set<object>(), supported: true };
            const snapshot = snapshotDetachedValue(value, state);
            expect(state.supported).toBe(true);
            expect(reads).toBe(0);
            expect(snapshot).toEqual([1]);
            expect(4 in snapshot).toBe(false);
        }
});
