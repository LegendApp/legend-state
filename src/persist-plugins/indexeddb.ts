import { isArray, isEmpty, isObject } from '@legendapp/state';
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
            // Create a table for each name with "id" as the key
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
                    ((window as any).__legend_state_preload as {
                        tableData: any;
                        tableMetadata: any;
                        dataPromise: Promise<any>;
                    });

                if (preload) {
                    // Load from preload or wait for it to finish, if it exists
                    this.tableData = preload.tableData || (await preload.dataPromise);
                    this.tableMetadata = preload.tableMetadata;
                } else {
                    // Load each table
                    const tables = tableNames.filter((table) => this.db.objectStoreNames.contains(table));
                    try {
                        const transaction = this.db.transaction(tables, 'readonly');

                        await Promise.all(tables.map((table) => this.initTable(table, transaction)));
                    } catch (err) {
                        console.error('[legend-state] Error loading IndexedDB', err);
                    }
                }

                resolve();
            };
        });
    }
    public getTable(table: string) {
        return this.tableData[table];
    }
    public getMetadata(table: string) {
        return this.tableMetadata[table];
    }
    public async updateMetadata(table: string, metadata: PersistMetadata): Promise<void> {
        // Assign new metadata into the table, and make sure it has the id
        metadata = Object.assign(this.tableMetadata[table] || {}, metadata, { id: '__legend_metadata' });
        this.tableMetadata[table] = metadata;
        const store = this.transactionStore(table);
        const set = this._setItem('__legend_metadata', metadata, store);
        return new Promise<void>((resolve) => (set.onsuccess = () => resolve()));
    }
    public async set(table: string, tableValue: Record<string, any>, changes: Change[]) {
        const prev = this.tableData[table];
        this.tableData[table] = tableValue;

        if (typeof indexedDB === 'undefined') return;

        if (process.env.NODE_ENV === 'development' && (!isObject(tableValue) || !isArray(tableValue))) {
            console.warn('[legend-state] IndexedDB persistence can only save objects or arrays');
        }

        const store = this.transactionStore(table);
        let lastPut: IDBRequest;
        for (let i = 0; i < changes.length; i++) {
            const { path, valueAtPath } = changes[i];
            if (path.length > 0) {
                // If change is deep in an object save it to IDB by the first key
                const key = path[0] as string;
                lastPut = this._setItem(key, valueAtPath, store);
            } else {
                // If change is the full object
                if (isArray(valueAtPath)) {
                    // If it's an array set that in the metadata so it loads as an array
                    this.updateMetadata(table, { array: true });
                }
                // Set the whole table
                lastPut = this._setTable(prev, valueAtPath, store);
            }
        }
        return new Promise<void>((resolve) => (lastPut.onsuccess = () => resolve()));
    }
    public async deleteTable(table: string): Promise<void> {
        delete this.tableData[table];

        if (typeof indexedDB === 'undefined') return;

        // Clear the table from IDB
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
                let obj: Record<string, any> | any[] = {};
                let metadata: PersistMetadata;
                let isArray = false;
                for (let i = 0; i < arr.length; i++) {
                    const val = arr[i];
                    if (val.id === '__legend_metadata') {
                        // Save this as metadata
                        delete val.id;
                        metadata = val;
                        if (metadata.array) {
                            // Load the data as an array instead of an object
                            obj = isEmpty(obj) ? [] : Object.keys(obj).map((key) => obj[key]);
                            isArray = true;
                        }
                    } else if (val.id === '__legend_obj') {
                        // Data is a basic object so load the value
                        obj = val.value;
                    } else {
                        if (isArray) {
                            (obj as any[]).push(val);
                        } else {
                            obj[val.id] = val;
                        }
                        // If it had __legend_id the source object should not have an id key
                        if (val.__legend_id) {
                            delete val.__legend_id;
                            delete val.id;
                        }
                    }
                }
                this.tableData[table] = obj;
                this.tableMetadata[table] = obj;
                resolve();
            };
        });
    }
    private transactionStore(table: string) {
        const transaction = this.db.transaction(table, 'readwrite');
        return transaction.objectStore(table);
    }
    private _setItem(key: string, value: any, store: IDBObjectStore) {
        if (!value) {
            return store.delete(key);
        } else {
            if (value.id === undefined) {
                // If value does not have its own ID, assign it the key from the Record
                // with __legend_id meaning it should get removed on load
                value = Object.assign({ id: key, __legend_id: true }, value);
            }

            return store.put(value);
        }
    }
    private _setTable(prev: object, value: object, store: IDBObjectStore) {
        const keys = Object.keys(value);
        let isBasic = false;
        // If any direct child is not an object then this has to be saved as a basic object
        for (let i = 0; i < keys.length; i++) {
            if (!isObject(value[keys[i]])) {
                isBasic = true;
                break;
            }
        }
        let lastSet: IDBRequest;
        if (isBasic) {
            // Save basic object
            lastSet = store.put({ id: '__legend_obj', value });
        } else {
            // Do a set for each key in the object
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                const val = value[key];
                lastSet = this._setItem(key, val, store);
            }

            // Delete keys that are no longer in the object
            if (prev) {
                const keysOld = Object.keys(prev);
                for (let i = 0; i < keysOld.length; i++) {
                    const key = keysOld[i];
                    if (value[key] === undefined) {
                        lastSet = this._setItem(key, null, store);
                    }
                }
            }
        }
        return lastSet;
    }
}
