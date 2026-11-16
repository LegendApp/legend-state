import type { Change } from '@legendapp/state';
import { applyChanges } from '@legendapp/state';
import type { ObservablePersistPlugin, PersistMetadata } from '@legendapp/state/sync';
import { MetadataSuffix, PersistJSONFormat } from '../persistFormat';

export class ObservablePersistLocalStorageBase implements ObservablePersistPlugin {
    private data: Record<string, any> = {};
    private storage: Storage | undefined;
    private format = new PersistJSONFormat();
    constructor(storage: Storage | undefined) {
        this.storage = storage;
    }
    public getTable(table: string, init: any) {
        if (!this.storage) return undefined;
        if (this.data[table] === undefined) {
            try {
                const value = this.storage.getItem(table);
                this.data[table] = value
                    ? this.format.parse(table, value, () => this.storage!.getItem(table + MetadataSuffix))
                    : init;
            } catch {
                console.error('[legend-state] ObservablePersistLocalStorageBase failed to parse', table);
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
        this.storage.removeItem(table);
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
            this.storage!.setItem(table, this.format.stringify(table, v));
        } else {
            this.storage!.removeItem(table);
        }
    }
}
export class ObservablePersistLocalStorage extends ObservablePersistLocalStorageBase {
    constructor() {
        super(
            typeof localStorage !== 'undefined'
                ? localStorage
                : process.env.NODE_ENV === 'test'
                  ? // @ts-expect-error This is ok to do in jest
                    globalThis._testlocalStorage
                  : undefined,
        );
    }
}
export class ObservablePersistSessionStorage extends ObservablePersistLocalStorageBase {
    constructor() {
        super(
            typeof sessionStorage !== 'undefined'
                ? sessionStorage
                : process.env.NODE_ENV === 'test'
                  ? // @ts-expect-error This is ok to do in jest
                    globalThis._testlocalStorage
                  : undefined,
        );
    }
}
