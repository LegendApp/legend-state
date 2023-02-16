import type { Change, ObservablePersistLocal, PersistMetadata } from '@legendapp/state';
import { setAtPath } from '@legendapp/state';

const MetadataSuffix = '__m';

export class ObservablePersistLocalStorage implements ObservablePersistLocal {
    private data: Record<string, any> = {};

    public getTable(table: string) {
        if (typeof localStorage === 'undefined') return undefined;
        if (this.data[table] === undefined) {
            try {
                const value = localStorage.getItem(table);
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
    public async set(table: string, changes: Change[]): Promise<void> {
        if (!this.data[table]) {
            this.data[table] = {};
        }
        for (let i = 0; i < changes.length; i++) {
            let { path, valueAtPath, pathTypes } = changes[i];
            this.data[table] = setAtPath(this.data[table], path as string[], pathTypes, valueAtPath);
        }
        this.save(table);
    }
    public updateMetadata(table: string, metadata: PersistMetadata) {
        this.setValue(table + MetadataSuffix, metadata);
    }
    public async deleteTable(table: string): Promise<void> {
        delete this.data[table];
        localStorage.removeItem(table);
    }
    public async deleteMetadata(table: string): Promise<void> {
        this.deleteTable(table + MetadataSuffix);
    }
    // Private
    private async setValue(table: string, value: any) {
        this.data[table] = value;
        this.save(table);
    }
    private save(table: string) {
        if (typeof localStorage === 'undefined') return;

        const v = this.data[table];

        if (v !== undefined && v !== null) {
            localStorage.setItem(table, JSON.stringify(v));
        } else {
            localStorage.removeItem(table);
        }
    }
}
