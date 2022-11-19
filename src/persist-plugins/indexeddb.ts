import type { ObservablePersistenceConfig, ObservablePersistLocal } from '../observableInterfaces';

export class ObservablePersistIndexedDB implements ObservablePersistLocal {
    private tableData: Record<string, any> = {};
    private db: IDBDatabase;

    public initialize(config: ObservablePersistenceConfig['persistLocalOptions']) {
        if (process.env.NODE_ENV === 'development' && !config) {
            console.error('[legend-state] Must configure ObservablePersistIndexedDB');
        }
        const { databaseName, version, tableNames } = config.indexedDB;
        const openRequest = indexedDB.open(databaseName, version);

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

                const preload = (window as any).__legend_state_preload as { data: any; dataPromise: Promise<any> };

                if (preload) {
                    this.tableData = preload.data || (await preload.dataPromise);
                } else {
                    const transaction = this.db.transaction(tableNames, 'readonly');

                    await Promise.all(tableNames.map((table) => this.initTable(table, transaction)));
                }

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
                const key = keys[i];
                let val = value[key];
                if (val.id === undefined) {
                    val = Object.assign({ id: key, __legend_id: true }, val);
                }

                const request = store.put(val);
                requests.push(request);
            }
            requests[requests.length - 1].onsuccess = () => resolve();
        });
    }
    public async set(table: string, id: string, value: any) {
        if (value.id === undefined) {
            value = Object.assign({ id, __legend_id: true }, value);
        }

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
    private initTable(table: string, transaction: IDBTransaction): Promise<void> {
        // If changing this, change it in the preloader too
        const store = transaction.objectStore(table);
        const allRequest = store.getAll();

        return new Promise((resolve) => {
            allRequest.onsuccess = () => {
                const arr = allRequest.result;
                const obj = {};
                for (let i = 0; i < arr.length; i++) {
                    const val = arr[i];
                    obj[val.id] = val;
                    if (val.__legend_id) {
                        delete val.__legend_id;
                        delete val.id;
                    }
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
