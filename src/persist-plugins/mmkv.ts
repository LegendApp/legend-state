import type { Change } from '@legendapp/state';
import { internal, setAtPath } from '@legendapp/state';
import type { ObservablePersistPlugin, PersistMetadata, PersistOptions } from '@legendapp/state/sync';
import { MMKV, MMKVConfiguration } from 'react-native-mmkv';

const symbolDefault = Symbol();
const MetadataSuffix = '__m';

const { safeParse, safeStringify } = internal;

export class ObservablePersistMMKV implements ObservablePersistPlugin {
    private data: Record<string, any> = {};
    private storages = new Map<symbol | string, MMKV>([
        [
            symbolDefault,
            new MMKV({
                id: `obsPersist`,
            }),
        ],
    ]);
    private configuration: MMKVConfiguration;

    constructor(configuration: MMKVConfiguration) {
        this.configuration = configuration;
    }
    // Gets
    public getTable<T = any>(table: string, init: object, config: PersistOptions): T {
        const storage = this.getStorage(config);
        if (this.data[table] === undefined) {
            try {
                const value = storage.getString(table);
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
        storage.delete(table);
    }
    public deleteMetadata(table: string, config: PersistOptions) {
        this.deleteTable(table + MetadataSuffix, config);
    }
    // Private
    private getStorage(config: PersistOptions): MMKV {
        const configuration = config.mmkv || this.configuration;
        if (configuration) {
            const key = JSON.stringify(configuration);
            let storage = this.storages.get(key);
            if (!storage) {
                storage = new MMKV(configuration);
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
                storage.set(table, safeStringify(v));
            } catch (err) {
                console.error(err);
            }
        } else {
            storage.delete(table);
        }
    }
}

export function observablePersistMMKV(configuration: MMKVConfiguration) {
    return new ObservablePersistMMKV(configuration);
}
