import type { Change } from '../src/observableInterfaces';
import { observable } from '../src/observable';
import { syncObservable } from '../src/sync/syncObservable';
import { when } from '../src/when';

// Run with MMKV_TEST_VERSION=legacy to exercise the constructor/delete API as well.
jest.mock('react-native-mmkv', () => {
    const stores = new Map<string, Map<string, string | number | boolean>>();
    class Storage {
        data: Map<string, string | number | boolean>;
        constructor(config: { id: string }) {
            if (!stores.has(config.id)) stores.set(config.id, new Map());
            this.data = stores.get(config.id)!;
        }
        set(key: string, value: string | number | boolean) {
            expect(['string', 'number', 'boolean']).toContain(typeof value);
            this.data.set(key, value);
        }
        getString(key: string) {
            const value = this.data.get(key);
            return typeof value === 'string' ? value : undefined;
        }
    }
    class LegacyStorage extends Storage {
        delete(key: string) {
            this.data.delete(key);
        }
    }
    class ModernStorage extends Storage {
        remove(key: string) {
            this.data.delete(key);
        }
    }
    return process.env.MMKV_TEST_VERSION === 'legacy'
        ? { MMKV: LegacyStorage }
        : { createMMKV: (config: { id: string }) => new ModernStorage(config) };
});
let ObservablePersistMMKV: typeof import('../src/persist-plugins/mmkv').ObservablePersistMMKV;
beforeAll(async () => {
    ({ ObservablePersistMMKV } = await import('../src/persist-plugins/mmkv'));
});
let id = 0;
const config = {};
function create() {
    const options = { id: `test-${++id}` };
    return { options, plugin: new ObservablePersistMMKV(options) };
}
function rootChange(value: unknown): Change[] {
    return [{ path: [], pathTypes: [], prevAtPath: undefined, valueAtPath: value }];
}

describe(`MMKV ${process.env.MMKV_TEST_VERSION || 'modern'}`, () => {
    for (const value of [null, false, 0, '', 'value', { value: null }, [null, false, 0, '']]) {
        it(`roundtrips ${JSON.stringify(value)}`, () => {
            const { plugin, options } = create();
            plugin.set('table', rootChange(value), config);
            const reloaded = new ObservablePersistMMKV(options);
            expect(reloaded.getTable('table', { missing: true }, config)).toStrictEqual(value);
        });
    }
    it('keeps null distinct from deletion and permits recreation', () => {
        const { plugin, options } = create();
        plugin.set('table', rootChange(null), config);
        expect(new ObservablePersistMMKV(options).getTable('table', { missing: true }, config)).toBeNull();
        plugin.deleteTable('table', config);
        expect(new ObservablePersistMMKV(options).getTable('table', { missing: true }, config)).toStrictEqual({
            missing: true,
        });
        plugin.set('table', rootChange('recreated'), config);
        expect(new ObservablePersistMMKV(options).getTable('table', {}, config)).toBe('recreated');
    });
    it('uses the selected deletion API for undefined and metadata', () => {
        const { plugin, options } = create();
        plugin.set('table', rootChange('saved'), config);
        plugin.set('table', rootChange(undefined), config);
        expect(new ObservablePersistMMKV(options).getTable('table', { missing: true }, config)).toStrictEqual({
            missing: true,
        });
        plugin.setMetadata('table', { lastSync: 123 }, config);
        expect(new ObservablePersistMMKV(options).getMetadata('table', config)).toStrictEqual({ lastSync: 123 });
        plugin.deleteMetadata('table', config);
        expect(new ObservablePersistMMKV(options).getMetadata('table', config)).toStrictEqual({});
    });
    it('persists null through syncObservable and reload', async () => {
        const { plugin, options } = create();
        const state = observable<string | null>('initial');
        const status = syncObservable(state, { persist: { name: 'state', plugin } });
        await when(status.isPersistLoaded);
        state.set(null);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(new ObservablePersistMMKV(options).getTable('state', { missing: true }, config)).toBeNull();
        const reloaded = observable<string | null>('different initial value');
        const reloadStatus = syncObservable(reloaded, {
            persist: { name: 'state', plugin: new ObservablePersistMMKV(options) },
        });
        await when(reloadStatus.isPersistLoaded);
        expect(reloaded.get()).toBeNull();
    });
});

for (const value of [null, false, 0, '']) {
    test(`restores ${JSON.stringify(value)} over a nonempty array initializer`, async () => {
        const { plugin, options } = create();
        plugin.set('state', rootChange(value), config);
        const state = observable<unknown>([1]);
        const status = syncObservable(state, {
            persist: { name: 'state', plugin: new ObservablePersistMMKV(options) },
        });
        await when(status.isPersistLoaded);
        expect(state.get()).toStrictEqual(value);
    });
}
