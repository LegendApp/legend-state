import type { Change } from '@legendapp/state';
import { applyChanges } from '@legendapp/state';
import type { ObservablePersistPlugin, PersistMetadata } from '@legendapp/state/sync';
import type { SQLiteStorage } from 'expo-sqlite/kv-store';
import { MetadataSuffix, PersistJSONFormat } from '../persistFormat';

export class ObservablePersistSqlite implements ObservablePersistPlugin {
    private data: Record<string, any> = {};
    private storage: SQLiteStorage;
    private format = new PersistJSONFormat();
    constructor(storage: SQLiteStorage) {
        if (!storage) {
            console.error(
                '[legend-state] ObservablePersistSqlite failed to initialize. You need to pass the SQLiteStorage instance.',
            );
        }
        this.storage = storage;
    }
    public getTable(table: string, init: any) {
        if (!this.storage) return undefined;
        if (this.data[table] === undefined) {
            try {
                const value = this.storage.getItemSync(table);
                this.data[table] = value
                    ? this.format.parse(table, value, () => this.storage.getItemSync(table + MetadataSuffix))
                    : init;
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
        this.format.delete(table);
        this.storage.removeItemSync(table);
    }
    public deleteMetadata(table: string) {
        this.deleteTable(table + MetadataSuffix);
    }
    // Private
    private save(table: string) {
        if (!this.storage) return undefined;

        if (this.format.needsUpgrade(table)) {
            // Rewrite the table and then its metadata in the current format. Data is written first so that
            // metadata is only marked with the format version if the data write succeeded.
            const dataTable = this.format.table(table);
            this.getTable(dataTable, undefined);
            this.getTable(dataTable + MetadataSuffix, {});
            if (table === dataTable || this.data[dataTable] !== undefined) this.write(dataTable);
            this.write(dataTable + MetadataSuffix);
        } else {
            this.write(table);
        }
    }
    private write(table: string) {
        const v = this.data[table];

        if (v !== undefined && v !== null) {
            this.storage.setItemSync(table, this.format.stringify(table, v));
        } else {
            this.storage.removeItemSync(table);
        }
    }
}

export function observablePersistSqlite(storage: SQLiteStorage) {
    return new ObservablePersistSqlite(storage);
}
