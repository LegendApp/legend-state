import type { Change } from '@legendapp/state';
import { internal, setAtPath } from '@legendapp/state';
import type { ObservablePersistPlugin, PersistMetadata, PersistOptions } from '@legendapp/state/sync';
import * as mmkv from 'react-native-mmkv';

const symbolDefault = Symbol();
const MetadataSuffix = '__m';

const { safeParse, safeStringify } = internal;

// Type definitions for MMKV v3 and older
// v3 and older use storage.delete() while v4+ uses storage.remove()
type MMKVLegacyInstance = Omit<mmkv.MMKV, 'remove'> & {
    delete: mmkv.MMKV['remove'];
};

type MMKVInstance = MMKVLegacyInstance | mmkv.MMKV;
type Configuration = mmkv.Configuration;

function createMMKVInstance(config: Configuration): MMKVInstance {
    const hasCreateFunction = 'createMMKV' in mmkv;
    if (hasCreateFunction) {
        // v4+: uses createMMKV() function
        return mmkv.createMMKV(config);
    } else {
        // v3 and older: uses MMKV constructor
        const { MMKV: MMKVConstructor } = mmkv as unknown as {
            MMKV: new (config: Configuration) => MMKVLegacyInstance;
        };
        return new MMKVConstructor(config);
    }
}

function deleteFromMMKV(storage: MMKVInstance, key: string): void {
    if ('remove' in storage) {
        // v4+
        storage.remove(key);
    } else {
        // v3 and older
        storage.delete(key);
    }
}

export class ObservablePersistMMKV implements ObservablePersistPlugin {
    private data: Record<string, any> = {};
    private storages = new Map<symbol | string, MMKVInstance>([
        [
            symbolDefault,
            createMMKVInstance({
                id: `obsPersist`,
            }),
        ],
    ]);
    private configuration: Configuration;

    constructor(configuration: Configuration) {
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
        deleteFromMMKV(storage, table);
    }
    public deleteMetadata(table: string, config: PersistOptions) {
        this.deleteTable(table + MetadataSuffix, config);
    }
    // Private
    private getStorage(config: PersistOptions): MMKVInstance {
        const configuration = config.mmkv || this.configuration;
        if (configuration) {
            const key = JSON.stringify(configuration);
            let storage = this.storages.get(key);
            if (!storage) {
                storage = createMMKVInstance(configuration);
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
            deleteFromMMKV(storage, table);
        }
    }
}

export function observablePersistMMKV(configuration: Configuration) {
    return new ObservablePersistMMKV(configuration);
}
