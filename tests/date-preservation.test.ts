import { observable } from '@legendapp/state';
import { syncedCrud } from '@legendapp/state/sync-plugins/crud';
import { configureLegendState } from '@legendapp/state/config/configureLegendState';
import { clone, globalState, safeParse, safeStringify } from '../src/globals';
import { ObservablePersistLocalStorageBase } from '../src/persist-plugins/local-storage';
import { ObservablePersistAsyncStorage } from '../src/persist-plugins/async-storage';
import { syncObservable } from '../src/sync/syncObservable';
import { ObservablePersistLocalStorage, getPersistName, localStorage, promiseTimeout } from './testglobals';

const iso = '2024-01-02T03:04:05.678Z';
const iso2 = '2025-06-07T08:09:10.111Z';

function captureWarnings(fn: () => void) {
    const warn = console.warn;
    const messages: string[] = [];
    console.warn = (...args: any[]) => messages.push(args.join(' '));
    try {
        fn();
    } finally {
        console.warn = warn;
    }
    return messages;
}

class FailingStorage {
    map = new Map<string, string>();
    failKey: string | undefined;
    get length() {
        return this.map.size;
    }
    getItem(key: string) {
        return this.map.get(key) ?? null;
    }
    setItem(key: string, value: string) {
        if (key === this.failKey) throw new Error('QuotaExceededError');
        this.map.set(key, value);
    }
    removeItem(key: string) {
        this.map.delete(key);
    }
}

describe('Date preservation (#613/#649)', () => {
    test('clone keeps ISO strings as strings and Dates as Dates', () => {
        const date = new Date(iso);
        const cloned = clone({ str: iso, date, nested: [{ date }], invalid: new Date(NaN) });
        expect(cloned.str).toBe(iso);
        expect(cloned.date).toBeInstanceOf(Date);
        expect(cloned.date.getTime()).toBe(date.getTime());
        expect(cloned.nested[0].date).toBeInstanceOf(Date);
        expect(clone(date)).toEqual(date);
        expect(isNaN(cloned.invalid.getTime())).toBe(true);
    });
    test('clone copies like the JSON round trip', () => {
        class Point {
            constructor(
                public x: number,
                public y: number,
            ) {}
        }
        let toJSONReads = 0;
        const value = {
            n: 1,
            nan: NaN,
            inf: -Infinity,
            s: iso,
            b: false,
            nil: null,
            undef: undefined,
            fn: () => 1,
            arr: [1, undefined, () => 1, NaN, [new Date(iso)], { a: undefined }],
            map: new Map<any, any>([
                ['d', new Date(iso)],
                [{ k: 1 }, new Set([1, new Date(iso2), undefined, () => 1])],
                ['fn', () => 1],
            ]),
            set: new Set([{ a: 1 }]),
            point: new Point(1, 2),
            json: { ignored: true, toJSON: () => ({ out: new Date(iso) }) },
            jsonGetter: {
                get toJSON() {
                    toJSONReads++;
                    return () => 'once';
                },
            },
            proto: JSON.parse('{"__proto__":{"polluted":true}}'),
        };
        const cloned: any = clone(value);
        expect(toJSONReads).toBe(1);
        expect(cloned).toEqual(safeParse(safeStringify(value)));
        expect(Object.keys(cloned)).toEqual(Object.keys(safeParse(safeStringify(value))));
        expect(cloned.map.get('d')).toBeInstanceOf(Date);
        expect(cloned.arr[4][0]).toBeInstanceOf(Date);
        expect(Object.getPrototypeOf(cloned.point)).toBe(Object.prototype);
        expect(Object.getPrototypeOf(cloned.proto)).toBe(Object.prototype);
        expect(cloned.proto.polluted).toBeUndefined();
        expect(cloned.set).not.toBe(value.set);
        expect(cloned.map.get('fn')).toBeNull();
        expect(clone(() => 1)).toBeUndefined();
    });
    test('safeStringify tags Dates and safeParse only revives ISO strings for legacy data', () => {
        expect(safeStringify({ d: new Date(iso) })).toBe(`{"d":{"__LSType":"Date","value":"${iso}"}}`);
        expect(safeParse(`{"s":"${iso}"}`).s).toBe(iso);
        expect(safeParse(`{"s":"${iso}"}`, true).s).toEqual(new Date(iso));
    });
    test('custom revivers keep working', () => {
        configureLegendState({
            jsonReviver: (_key, value) => (value === 'revive-me' ? new Date(iso) : value),
        });
        try {
            expect(clone({ a: 'revive-me', b: iso })).toEqual({ a: new Date(iso), b: iso });
        } finally {
            globalState.reviver = undefined;
        }
    });
    test('warns once per path where ISO strings used to become Dates, and can be silenced', () => {
        const first = captureWarnings(() => clone({ warnPathA: iso, list: [{ at: iso }] }));
        expect(first.length).toBe(2);
        expect(first[0]).toContain('"warnPathA"');
        expect(first[1]).toContain('"list.0.at"');
        expect(captureWarnings(() => clone({ warnPathA: iso2 }))).toEqual([]);

        configureLegendState({ warnOnDateStrings: false });
        try {
            expect(captureWarnings(() => clone({ warnPathB: iso }))).toEqual([]);
        } finally {
            globalState.warnOnDateStrings = undefined;
        }
    });
    test('localStorage persistence round-trips strings and Dates exactly', async () => {
        const persistName = getPersistName();
        const obs$ = observable({ str: iso, date: new Date(iso) });
        syncObservable(obs$, { persist: { name: persistName, plugin: ObservablePersistLocalStorage } });
        obs$.str.set(iso2);
        await promiseTimeout(0);

        expect(localStorage.getItem(persistName + '__m')).toContain('"__LSFormat":1');

        const reloaded$ = observable({});
        syncObservable(reloaded$, {
            persist: {
                name: persistName,
                plugin: class extends ObservablePersistLocalStorageBase {
                    constructor() {
                        super(localStorage);
                    }
                },
            },
        });
        const value = reloaded$.get() as any;
        expect(value.str).toBe(iso2);
        expect(value.date).toBeInstanceOf(Date);
        expect(value.date.getTime()).toBe(new Date(iso).getTime());
    });
    test('unversioned legacy data loads with Date revival and is rewritten tagged on next save', () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, JSON.stringify({ when: iso }));
        localStorage.setItem(persistName + '__m', JSON.stringify({ lastSync: 1 }));

        const plugin = new ObservablePersistLocalStorageBase(localStorage);
        expect(plugin.getTable(persistName, {}).when).toEqual(new Date(iso));
        expect(plugin.getMetadata(persistName)).toEqual({ lastSync: 1 });

        plugin.set(persistName, [{ path: ['label'], pathTypes: ['object'], valueAtPath: iso2, prevAtPath: undefined }]);

        expect(localStorage.getItem(persistName)).toBe(
            `{"when":{"__LSType":"Date","value":"${iso}"},"label":"${iso2}"}`,
        );
        expect(JSON.parse(localStorage.getItem(persistName + '__m')!)).toEqual({ lastSync: 1, __LSFormat: 1 });

        const reloaded = new ObservablePersistLocalStorageBase(localStorage);
        const value = reloaded.getTable(persistName, {});
        expect(value.when).toEqual(new Date(iso));
        expect(value.label).toBe(iso2);
        expect(reloaded.getMetadata(persistName)).toEqual({ lastSync: 1 });
    });
    test('legacy metadata saved first also rewrites the table', () => {
        const persistName = getPersistName();
        localStorage.setItem(persistName, JSON.stringify({ when: iso }));

        const plugin = new ObservablePersistLocalStorageBase(localStorage);
        plugin.setMetadata(persistName, { lastSync: 2 });

        expect(localStorage.getItem(persistName)).toBe(`{"when":{"__LSType":"Date","value":"${iso}"}}`);
        expect(new ObservablePersistLocalStorageBase(localStorage).getTable(persistName, {}).when).toEqual(
            new Date(iso),
        );
    });
    test('AsyncStorage loads legacy tables with Date revival and versioned tables exactly', async () => {
        const store = new Map<string, string>([
            ['legacy', JSON.stringify({ when: iso })],
            ['current', JSON.stringify({ when: iso })],
            ['current__m', JSON.stringify({ __LSFormat: 1 })],
        ]);
        const AsyncStorage: any = {
            getAllKeys: async () => Array.from(store.keys()),
            multiGet: async (keys: string[]) => keys.map((key) => [key, store.get(key) ?? null]),
            setItem: async (key: string, value: string) => void store.set(key, value),
            removeItem: async (key: string) => void store.delete(key),
        };
        const plugin = new ObservablePersistAsyncStorage({ AsyncStorage, preload: true });
        await plugin.initialize({});
        expect(plugin.getTable('legacy', {})).toEqual({ when: new Date(iso) });
        expect(plugin.getTable('current', {})).toEqual({ when: iso });

        await plugin.set('legacy', [{ path: ['x'], pathTypes: ['object'], valueAtPath: 1, prevAtPath: undefined }]);
        expect(store.get('legacy')).toBe(`{"when":{"__LSType":"Date","value":"${iso}"},"x":1}`);
        expect(store.get('legacy__m')).toBe('{"__LSFormat":1}');
    });
    test('a failed data write during upgrade leaves the table legacy', () => {
        const storage = new FailingStorage();
        storage.setItem('upgrade', JSON.stringify({ when: iso }));
        const plugin = new ObservablePersistLocalStorageBase(storage as any);
        expect(plugin.getTable('upgrade', {}).when).toEqual(new Date(iso));
        storage.failKey = 'upgrade';
        expect(() =>
            plugin.set('upgrade', [{ path: ['x'], pathTypes: ['object'], valueAtPath: 1, prevAtPath: undefined }]),
        ).toThrow();
        expect(storage.getItem('upgrade__m')).toBe(null);
        expect(new ObservablePersistLocalStorageBase(storage as any).getTable('upgrade', {}).when).toEqual(
            new Date(iso),
        );
    });
    test('AsyncStorage writes metadata only after the data write succeeds', async () => {
        const store = new Map<string, string>([['upgrade', JSON.stringify({ when: iso })]]);
        const AsyncStorage: any = {
            getAllKeys: async () => Array.from(store.keys()),
            multiGet: async (keys: string[]) => keys.map((key) => [key, store.get(key) ?? null]),
            setItem: async (key: string, value: string) => {
                if (key === 'upgrade') throw new Error('killed');
                store.set(key, value);
            },
            removeItem: async (key: string) => void store.delete(key),
        };
        const plugin = new ObservablePersistAsyncStorage({ AsyncStorage, preload: true });
        await plugin.initialize({});
        await plugin.setMetadata('upgrade', { lastSync: 1 }).catch(() => {});
        expect(store.has('upgrade__m')).toBe(false);
    });
    test('warns once per field rather than once per row', () => {
        const rows: Record<string, any> = {};
        for (let i = 0; i < 300; i++) rows['id' + i] = { id: 'id' + i, perRowField: iso };
        expect(captureWarnings(() => clone(rows)).length).toBe(1);
    });
    test('extended-year Dates round-trip as Dates', () => {
        const date = new Date('+010000-01-01T00:00:00.000Z');
        expect(clone({ date }).date).toEqual(date);
    });
    test('CRUD create sends the local string and persists the server createdAt (#613)', async () => {
        const persistName = getPersistName();
        let created: any;
        const obs$ = observable(
            syncedCrud({
                list: () => [],
                create: async (input: { id: string; createdAt: string }) => {
                    created = input;
                    return { ...input, createdAt: iso2 };
                },
                persist: { name: persistName, plugin: ObservablePersistLocalStorage },
            }),
        );
        obs$.get();
        await promiseTimeout(0);
        obs$.id1.set({ id: 'id1', createdAt: iso });
        await promiseTimeout(20);

        expect(created.createdAt).toBe(iso);
        expect(obs$.id1.createdAt.get()).toBe(iso2);
        expect(JSON.parse(localStorage.getItem(persistName)!).id1.createdAt).toBe(iso2);
    });
});
