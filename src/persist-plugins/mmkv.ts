import type { Change, ObservablePersistLocal, PersistMetadata, PersistOptionsLocal } from '@legendapp/state';
import { setAtPath } from '@legendapp/state';
import { MMKV } from 'react-native-mmkv';

const symbolDefault = Symbol();
const MetadataSuffix = '__m';

export class ObservablePersistMMKV implements ObservablePersistLocal {
    private data: Record<string, any> = {};
    private storages = new Map<symbol | string, MMKV>([
        [
            symbolDefault,
            new MMKV({
                id: `obsPersist`,
            }),
        ],
    ]);
    // Gets
    public getTable<T = any>(table: string, config: PersistOptionsLocal): T {
        const storage = this.getStorage(config);
        if (this.data[table] === undefined) {
            try {
                const value = storage.getString(table);
                this.data[table] = value ? JSON.parse(value) : undefined;
            } catch {
                console.error('[legend-state] MMKV failed to parse', table);
            }
        }
        return this.data[table];
    }
    public getMetadata(table: string, config: PersistOptionsLocal): PersistMetadata {
        return this.getTable(table + MetadataSuffix, config);
    }
    // Sets
    public set(table: string, changes: Change[], config: PersistOptionsLocal) {
        if (!this.data[table]) {
            this.data[table] = {};
        }
        for (let i = 0; i < changes.length; i++) {
            const { path, valueAtPath, pathTypes } = changes[i];
            this.data[table] = setAtPath(this.data[table], path as string[], pathTypes, valueAtPath);
        }
        this.save(table, config);
    }
    public setMetadata(table: string, metadata: PersistMetadata, config: PersistOptionsLocal) {
        return this.setValue(table + MetadataSuffix, metadata, config);
    }
    public deleteTable(table: string, config: PersistOptionsLocal): void {
        const storage = this.getStorage(config);
        delete this.data[table];
        storage.delete(table);
    }
    public deleteMetadata(table: string, config: PersistOptionsLocal) {
        this.deleteTable(table + MetadataSuffix, config);
    }
    // Private
    private getStorage(config: PersistOptionsLocal): MMKV {
        const { mmkv } = config;
        if (mmkv) {
            const key = JSON.stringify(mmkv);
            let storage = this.storages.get(key);
            if (!storage) {
                storage = new MMKV(mmkv);
                this.storages.set(key, storage);
            }
            return storage;
        } else {
            return this.storages.get(symbolDefault)!;
        }
    }
    private async setValue(table: string, value: any, config: PersistOptionsLocal) {
        this.data[table] = value;
        this.save(table, config);
    }
    private save(table: string, config: PersistOptionsLocal) {
        const storage = this.getStorage(config);
        const v = this.data[table];
        if (v !== undefined) {
            try {
                storage.set(table, JSON.stringify(v));
            } catch (err) {
                console.error(err);
            }
        } else {
            storage.delete(table);
        }
    }
}
