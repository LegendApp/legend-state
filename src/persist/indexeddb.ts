import type { ObservablePersistenceConfig, ObservablePersistLocal } from '../observableInterfaces';

export class ObservablePersistIndexedDB implements ObservablePersistLocal {
    private tableData: Record<string, any> = {};
    private db: IDBDatabase;

    public initialize(config: ObservablePersistenceConfig['persistLocalOptions']) {
        if (process.env.NODE_ENV === 'development' && !config) {
            console.error('[legend-state]: Must configure ObservablePersistIndexedDB');
        }
        const { databaseName, version, tableNames } = config.indexedDB;
        let openRequest = indexedDB.open(databaseName, version);

        openRequest.onerror = () => {
            console.error('Error', openRequest.error);
        };

        openRequest.onupgradeneeded = () => {
            const db = openRequest.result;
            const { tableNames } = config.indexedDB;
            tableNames.forEach((table) => {
                db.createObjectStore(table, {
                    keyPath: 'id',
                });
            });
        };

        return new Promise<void>((resolve) => {
            openRequest.onsuccess = async () => {
                this.db = openRequest.result;

                const transaction = this.db.transaction(tableNames, 'readonly');

                await Promise.all(tableNames.map((table) => this.loadTable(table, transaction)));

                resolve();
            };
        });
    }
    public getTable(table: string) {
        return this.tableData[table];
    }
    public async setTable(table: string, value: any) {
        this.tableData[table] = value;

        const store = this.transactionStore(table);
        return new Promise<void>((resolve) => {
            const keys = Object.keys(value);
            const requests: IDBRequest[] = [];
            for (let i = 0; i < keys.length; i++) {
                const request = store.put(value[keys[i]]);
                requests.push(request);
            }
            requests[requests.length - 1].onsuccess = () => resolve();
        });
    }
    public async set(table: string, id: string, value: any) {
        if (!this.tableData[table]) {
            this.tableData[table] = {};
        }
        this.tableData[table][id] = value;

        const store = this.transactionStore(table);
        return new Promise<void>((resolve) => {
            const putRequest = store.put(value);
            putRequest.onsuccess = () => resolve();
        });
    }
    public async deleteTable(table: string): Promise<void> {
        const store = this.transactionStore(table);
        const clear = store.clear();
        return new Promise((resolve) => {
            clear.onsuccess = () => {
                resolve();
            };
        });
    }
    // Private
    private loadTable(table: string, transaction: IDBTransaction): Promise<void> {
        const store = transaction.objectStore(table);
        const allRequest = store.getAll();

        return new Promise((resolve) => {
            allRequest.onsuccess = () => {
                const arr = allRequest.result;
                const obj = {};
                for (let i = 0; i < arr.length; i++) {
                    const val = arr[i];
                    obj[val.id] = val;
                }
                this.tableData[table] = obj;
                resolve();
            };
        });
    }
    private transactionStore(table: string) {
        const transaction = this.db.transaction(table, 'readwrite');
        return transaction.objectStore(table);
    }
}
