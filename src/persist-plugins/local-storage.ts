import type {
    Change,
    ObservablePersistenceConfig,
    ObservablePersistLocal,
    PersistMetadata
} from '@legendapp/state';
import { setAtPath } from '@legendapp/state';

const MetadataSuffix = '__m';

export class ObservablePersistLocalStorage implements ObservablePersistLocal {
    private data: Record<string, any> = {};

    private storage: Storage = global.localStorage;

    public async initialize(config: ObservablePersistenceConfig['persistLocalOptions']) {
        if (typeof Storage === 'undefined') return;
        this.storage  = config?.storage || this.storage;
    }
    public getTable(table: string) {
        if (typeof this.storage === 'undefined') return undefined;
        if (this.data[table] === undefined) {
            try {
                const value = this.storage.getItem(table);
                this.data[table] = value ? JSON.parse(value) : undefined;
            } catch {
                console.error('[legend-state] ObservablePersistLocalStorage failed to parse', table);
            }
        }
        return this.data[table];
    }
    public getMetadata(table: string): PersistMetadata {
        return this.getTable(table + MetadataSuffix);
    }
    public get(table: string, id: string) {
        const tableData = this.getTable(table);
        return tableData?.[id];
    }
    public set(table: string, changes: Change[]): void {
        if (!this.data[table]) {
            this.data[table] = {};
        }
        for (let i = 0; i < changes.length; i++) {
            const { path, valueAtPath, pathTypes } = changes[i];
            this.data[table] = setAtPath(this.data[table], path as string[], pathTypes, valueAtPath);
        }
        this.save(table);
    }
    public updateMetadata(table: string, metadata: PersistMetadata) {
        return this.setValue(table + MetadataSuffix, metadata);
    }
    public deleteTable(table: string) {
        delete this.data[table];
        this.storage.removeItem(table);
    }
    public deleteMetadata(table: string) {
        this.deleteTable(table + MetadataSuffix);
    }
    // Private
    private setValue(table: string, value: any) {
        this.data[table] = value;
        this.save(table);
    }
    private save(table: string) {
        if (typeof this.storage === 'undefined') return;

        const v = this.data[table];

        if (v !== undefined && v !== null) {
            this.storage.setItem(table, JSON.stringify(v));
        } else {
            this.storage.removeItem(table);
        }
    }
}
