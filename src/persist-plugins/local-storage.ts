import { constructObjectWithPath, mergeIntoObservable } from '@legendapp/state';
import type { Change, ObservablePersistLocal, PersistMetadata } from '../observableInterfaces';

export class ObservablePersistLocalStorage implements ObservablePersistLocal {
    private data: Record<string, any> = {};

    public getTable(table: string) {
        if (typeof localStorage === 'undefined') return undefined;
        if (this.data[table] === undefined) {
            try {
                const value = localStorage.getItem(table);
                return value ? JSON.parse(value) : undefined;
            } catch {
                console.error('[legend-state] ObservablePersistLocalStorage failed to parse', table);
            }
        }
        return this.data[table];
    }
    public getMetadata(table: string): PersistMetadata {
        return this.getTable(table + '__m');
    }
    public get(table: string, id: string) {
        const tableData = this.getTable(table);
        return tableData?.[id];
    }
    public async set(table: string, changes: Change[]): Promise<void> {
        if (!this.data[table]) {
            this.data[table] = {};
        }
        this.data[table] = mergeIntoObservable(
            this.data[table],
            ...changes.map(({ path, valueAtPath, pathTypes }) => constructObjectWithPath(path, valueAtPath, pathTypes))
        );
        this.save(table);
    }
    public updateMetadata(table: string, metadata: PersistMetadata) {
        return this.setValue(table + '__m', metadata);
    }
    public async deleteTable(table: string): Promise<void> {
        delete this.data[table];
        localStorage.removeItem(table);
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
