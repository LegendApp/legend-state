import { dateModifiedKey, PendingKey, symbolDateModified } from '@legendapp/state';
import type {
    Change,
    ObservablePersistenceConfig,
    ObservablePersistLocal,
    PersistMetadata,
} from '../observableInterfaces';

export class ObservablePersistIndexedDB implements ObservablePersistLocal {
    private tableData: Record<string, any> = {};
    private tableMetadata: Record<string, any> = {};
    private db: IDBDatabase;

    public initialize(config: ObservablePersistenceConfig['persistLocalOptions']) {
        if (typeof indexedDB === 'undefined') return;
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

                const preload =
                    typeof window !== 'undefined' &&
                    ((window as any).__legend_state_preload as { data: any; dataPromise: Promise<any> });

                if (preload) {
                    this.tableData = preload.data || (await preload.dataPromise);
                } else {
                    const transaction = this.db.transaction(tableNames, 'readonly');

                    await Promise.all(tableNames.map((table) => this.initTable(table, transaction)));
                }

                if (this.tableData) {
                    Object.keys(this.tableData).forEach((key) => {
                        const metadata = this.tableData[key]['__legend_metadata'] as PersistMetadata;
                        if (metadata) {
                            if (metadata.modified) {
                                this.tableData[key][symbolDateModified] = metadata.modified;
                            }
                            if (metadata.pending) {
                                this.tableData[key][PendingKey] = metadata.pending;
                            }
                            this.tableMetadata[key] = metadata;
                            delete this.tableData[key]['__legend_metadata'];
                        }
                    });
                }

                resolve();
            };
        });
    }
    public getTable(table: string) {
        return this.tableData[table];
    }
    public async set(table: string, tableValue: any, changes: Change[]) {
        this.tableData[table] = tableValue;

        if (typeof indexedDB === 'undefined') return;

        const metadata: PersistMetadata = this.tableMetadata[table] || {};
        const pending = tableValue[PendingKey];
        const modified = tableValue[symbolDateModified] || tableValue[dateModifiedKey];
        const store = this.transactionStore(table);
        let lastPut: IDBRequest;
        for (let i = 0; i < changes.length; i++) {
            const { path, valueAtPath } = changes[i];
            const key = path[0] as string;
            let value = tableValue[key];
            if ((key as any) === symbolDateModified) {
                metadata.modified = valueAtPath;
            } else {
                if (value.id === undefined) {
                    value = Object.assign({ id: key, __legend_id: true }, value);
                }

                lastPut = store.put(value);
            }
        }
        if (pending || modified) {
            metadata.id = '__legend_metadata';
            if (pending) {
                metadata.pending = pending;
            }
            if (modified) {
                metadata.modified = modified;
            }
            lastPut = store.put(metadata);
        }
    }
    public async deleteTable(table: string): Promise<void> {
        delete this.tableData[table];

        if (typeof indexedDB === 'undefined') return;

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
