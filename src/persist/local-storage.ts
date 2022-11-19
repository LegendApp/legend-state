import type { ObservablePersistLocal } from '../observableInterfaces';

export class ObservablePersistLocalStorage implements ObservablePersistLocal {
    private tableData: Record<string, any> = {};

    public getTable(table: string) {
        if (typeof localStorage === 'undefined') return undefined;
        if (this.tableData[table] === undefined) {
            try {
                const value = localStorage.getItem(table);
                return value ? JSON.parse(value) : undefined;
            } catch {
                console.error('[legend-state]: ObservablePersistLocalStorage failed to parse', table);
            }
        }
        return this.tableData[table];
    }
    public get(table: string, id: string) {
        const tableData = this.getTable(table);
        return tableData?.[id];
    }
    public async setTable(table: string, value: any) {
        this.tableData[table] = value;
        this.save(table);
    }
    public async deleteTable(table: string): Promise<void> {
        delete this.tableData[table];
        localStorage.removeItem(table);
    }
    private save(table: string) {
        if (typeof localStorage === 'undefined') return;

        const v = this.tableData[table];

        if (v !== undefined && v !== null) {
            localStorage.setItem(table, JSON.stringify(v));
        } else {
            localStorage.removeItem(table);
        }
    }
}
