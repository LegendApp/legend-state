import type { Change } from '@legendapp/state';
import { applyChanges, internal } from '@legendapp/state';
import type { ObservablePersistPlugin, PersistMetadata } from '@legendapp/state/sync';
import { SQLiteStorage, Storage } from 'expo-sqlite/kv-store';

const { safeParse, safeStringify } = internal;

const MetadataSuffix = '__m';

export class ObservablePersistSqlite implements ObservablePersistPlugin {
    private data: Record<string, any> = {};
    private storage: SQLiteStorage | undefined;
    constructor(storage: SQLiteStorage | undefined) {
        this.storage = storage || Storage;
    }
    public getTable(table: string, init: any) {
        if (!this.storage) return undefined;
        if (this.data[table] === undefined) {
            try {
                const value = this.storage.getItemSync(table);
                this.data[table] = value ? safeParse(value) : init;
            } catch {
                console.error('[legend-state] ObservablePersistSqlite failed to parse', table);
            }
        }
        return this.data[table];
    }
    public getMetadata(table: string): PersistMetadata {
        return this.getTable(table + MetadataSuffix, {});
    }
    public set(table: string, changes: Change[]): void {
        if (!this.data[table]) {
            this.data[table] = {};
        }
        this.data[table] = applyChanges(this.data[table], changes);
        this.save(table);
    }
    public setMetadata(table: string, metadata: PersistMetadata) {
        table = table + MetadataSuffix;
        this.data[table] = metadata;
        this.save(table);
    }
    public deleteTable(table: string) {
        if (!this.storage) return undefined;
        delete this.data[table];
        this.storage.removeItemSync(table);
    }
    public deleteMetadata(table: string) {
        this.deleteTable(table + MetadataSuffix);
    }
    // Private
    private save(table: string) {
        if (!this.storage) return undefined;

        const v = this.data[table];

        if (v !== undefined && v !== null) {
            this.storage.setItemSync(table, safeStringify(v));
        } else {
            this.storage.removeItemSync(table);
        }
    }
}

export function observablePersistSqlite(storage?: SQLiteStorage) {
    return new ObservablePersistSqlite(storage);
}
