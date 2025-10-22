import type { Change } from '@legendapp/state';
import { internal, setAtPath } from '@legendapp/state';
import type { ObservablePersistPlugin, PersistMetadata, PersistOptions } from '@legendapp/state/sync';

const symbolDefault = Symbol();
const MetadataSuffix = '__m';

const { safeParse, safeStringify } = internal;

export interface MMKVStorageAdapter<TStorage, TConfig> {
    createStorage: (config: TConfig) => TStorage;
    getString: (storage: TStorage, key: string) => string | undefined;
    setString: (storage: TStorage, key: string, value: string) => void;
    remove: (storage: TStorage, key: string) => void;
}

export class ObservablePersistMMKVBase<TStorage, TConfig> implements ObservablePersistPlugin {
    private data: Record<string, any> = {};
    private storages = new Map<symbol | string, TStorage>();
    private configuration: TConfig;
    private adapter: MMKVStorageAdapter<TStorage, TConfig>;

    constructor(configuration: TConfig, adapter: MMKVStorageAdapter<TStorage, TConfig>) {
        this.configuration = configuration;
        this.adapter = adapter;
        this.storages.set(symbolDefault, adapter.createStorage({ id: 'obsPersist' } as TConfig));
    }
    // Gets
    public getTable<T = any>(table: string, init: object, config: PersistOptions): T {
        const storage = this.getStorage(config);
        if (this.data[table] === undefined) {
            try {
                const value = this.adapter.getString(storage, table);
                this.data[table] = value ? safeParse(value) : init;
            } catch {
                console.error('[legend-state] MMKV failed to parse', table);
            }
        }
        return this.data[table];
    }
    public getMetadata(table: string, config: PersistOptions): PersistMetadata {
        return this.getTable(table + MetadataSuffix, {}, config);
    }
    // Sets
    public set(table: string, changes: Change[], config: PersistOptions) {
        if (!this.data[table]) {
            this.data[table] = {};
        }
        for (let i = 0; i < changes.length; i++) {
            const { path, valueAtPath, pathTypes } = changes[i];
            this.data[table] = setAtPath(this.data[table], path as string[], pathTypes, valueAtPath);
        }
        this.save(table, config);
    }
    public setMetadata(table: string, metadata: PersistMetadata, config: PersistOptions) {
        return this.setValue(table + MetadataSuffix, metadata, config);
    }
    public deleteTable(table: string, config: PersistOptions): void {
        const storage = this.getStorage(config);
        delete this.data[table];
        this.adapter.remove(storage, table);
    }
    public deleteMetadata(table: string, config: PersistOptions) {
        this.deleteTable(table + MetadataSuffix, config);
    }
    // Private
    private getStorage(config: PersistOptions): TStorage {
        const configuration = (config.mmkv as TConfig) || this.configuration;
        if (configuration) {
            const key = JSON.stringify(configuration);
            let storage = this.storages.get(key);
            if (!storage) {
                storage = this.adapter.createStorage(configuration);
                this.storages.set(key, storage);
            }
            return storage;
        } else {
            return this.storages.get(symbolDefault)!;
        }
    }
    private async setValue(table: string, value: any, config: PersistOptions) {
        this.data[table] = value;
        this.save(table, config);
    }
    private save(table: string, config: PersistOptions) {
        const storage = this.getStorage(config);
        const v = this.data[table];
        if (v !== undefined) {
            try {
                this.adapter.setString(storage, table, safeStringify(v));
            } catch (err) {
                console.error(err);
            }
        } else {
            this.adapter.remove(storage, table);
        }
    }
}
