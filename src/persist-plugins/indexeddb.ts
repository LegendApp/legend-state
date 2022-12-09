import { isArray, isObject, isPromise, observable, when } from '@legendapp/state';
import type {
    Change,
    Observable,
    ObservablePersistenceConfig,
    ObservablePersistLocal,
    PersistMetadata,
    PersistOptionsLocal,
} from '../observableInterfaces';

export class ObservablePersistIndexedDB implements ObservablePersistLocal {
    private tableData: Record<string, any> = {};
    private tableMetadata: Record<string, any> = {};
    private tablesAdjusted: Map<string, Observable<boolean>> = new Map();
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

                let didPreload;
                if (preload) {
                    // Load from preload or wait for it to finish, if it exists
                    if (!preload.tableData && preload.dataPromise) {
                        await preload.dataPromise;
                    }
                    this.tableData = preload.tableData;
                    this.tableMetadata = preload.tableMetadata;
                    didPreload = !!preload.tableData;
                }
                if (!didPreload) {
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
    public loadTable(table: string, config: PersistOptionsLocal): void | Promise<void> {
        if (!this.tableData[table]) {
            const transaction = this.db.transaction(table, 'readonly');

            return this.initTable(table, transaction).then(() => this.loadTable(table, config));
        }

        const { adjustData } = config;
        const prefix = config.indexedDB?.prefixID;

        if (adjustData || prefix) {
            const tableName = prefix ? table + '/' + prefix : table;
            if (this.tablesAdjusted.has(tableName)) {
                const promise = when(this.tablesAdjusted.get(tableName));
                if (isPromise(promise)) {
                    return promise as unknown as Promise<void>;
                }
            } else {
                const obsLoaded = observable(false);
                this.tablesAdjusted.set(tableName, obsLoaded);
                const data = this.getTable(table, config);
                let hasPromise = false;
                let promises: Promise<any>[];
                if (data) {
                    const keys = Object.keys(data);
                    promises = keys.map((key) => {
                        let value = data[key];

                        if (adjustData?.load) {
                            value = adjustData.load(value);
                        }
                        if (isPromise(value)) {
                            hasPromise = true;
                            return value.then((v) => {
                                data[key] = value;
                            });
                        } else {
                            data[key] = value;
                        }
                    });
                }
                if (hasPromise) {
                    return Promise.all(promises).then(() => {
                        obsLoaded.set(true);
                    });
                } else {
                    obsLoaded.set(true);
                }
            }
        }
    }
    public getTable(table: string, config: PersistOptionsLocal) {
        const configIDB = config.indexedDB;
        const prefix = configIDB?.prefixID;
        const data = this.tableData[prefix ? table + '/' + prefix : table];
        if (data && configIDB?.itemID) {
            return data[configIDB.itemID];
        } else {
            return data;
        }
    }
    public getTableTransformed<T = any>(table: string, config: PersistOptionsLocal<any>): T {
        const configIDB = config.indexedDB;
        const prefix = configIDB?.prefixID;
        const data = this.tableData[(prefix ? table + '/' + prefix : table) + '_transformed'];
        if (data && configIDB?.itemID) {
            return data[configIDB.itemID];
        } else {
            return data;
        }
    }
    public getMetadata(table: string, config: PersistOptionsLocal) {
        const configIDB = config.indexedDB;
        const prefix = configIDB?.prefixID;
        return this.tableMetadata[prefix ? table + '/' + prefix : table];
    }
    public async updateMetadata(table: string, metadata: PersistMetadata, config: PersistOptionsLocal): Promise<void> {
        const configIDB = config.indexedDB;
        const prefix = configIDB?.prefixID;
        const tableName = prefix ? table + '/' + prefix : table;
        // Assign new metadata into the table, and make sure it has the id
        metadata = Object.assign(this.tableMetadata[tableName] || {}, metadata, {
            id: (prefix ? prefix + '/' : '') + '__legend_metadata',
        });
        this.tableMetadata[tableName] = metadata;
        const store = this.transactionStore(table);
        const set = store.put(metadata);
        return new Promise<void>((resolve) => (set.onsuccess = () => resolve()));
    }
    public async set(table: string, tableValue: Record<string, any>, changes: Change[], config: PersistOptionsLocal) {
        if (typeof indexedDB === 'undefined') return;

        if (process.env.NODE_ENV === 'development' && !(isObject(tableValue) || isArray(tableValue))) {
            console.warn('[legend-state] IndexedDB persistence can only save objects or arrays');
        }

        const store = this.transactionStore(table);

        const prefixID = config.indexedDB?.prefixID;
        if (prefixID) {
            table += '/' + prefixID;
        }
        const prev = this.tableData[table];

        const itemID = config.indexedDB?.itemID;
        if (itemID) {
            tableValue = { [itemID]: tableValue };
        }

        // Combine changes into a minimal set of saves
        const savesItems: Record<string, any> = {};
        const savesTables: Record<string, any> = {};
        for (let i = 0; i < changes.length; i++) {
            let { path, valueAtPath } = changes[i];
            if (itemID) {
                path = [itemID].concat(path as string[]);
            }
            if (path.length > 0) {
                // If change is deep in an object save it to IDB by the first key
                const key = path[0] as string;
                savesItems[key] = tableValue[key];
            } else {
                // Set the whole table
                savesTables[table] = valueAtPath;
            }
        }
        const puts = await Promise.all(
            Object.keys(savesItems)
                .map((key) => this._setItem(table, key, tableValue[key], store, config))
                .concat(
                    Object.keys(savesTables).map((key) => this._setTable(table, prev, savesItems[key], store, config))
                )
        );

        const lastPut = puts[puts.length - 1];
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

        if (!this.tableData[table]) {
            this.tableData[table] = {};
        }
        return new Promise((resolve) => {
            allRequest.onsuccess = () => {
                const arr = allRequest.result;
                let metadata: PersistMetadata;
                if (!this.tableData[table]) {
                    this.tableData[table] = {};
                }
                for (let i = 0; i < arr.length; i++) {
                    const val = arr[i];

                    let tableName = table;

                    if (val.id.includes('/')) {
                        const [prefix, id] = val.id.split('/');
                        tableName += '/' + prefix;
                        val.id = id;
                    }

                    if (val.id === '__legend_metadata') {
                        // Save this as metadata
                        delete val.id;
                        metadata = val;
                        this.tableMetadata[tableName] = metadata;
                    } else {
                        if (!this.tableData[tableName]) {
                            this.tableData[tableName] = {};
                        }
                        this.tableData[tableName][val.id] = val;
                    }
                }
                resolve();
            };
        });
    }
    private transactionStore(table: string) {
        const transaction = this.db.transaction(table, 'readwrite');
        return transaction.objectStore(table);
    }
    private async _setItem(table: string, key: string, value: any, store: IDBObjectStore, config: PersistOptionsLocal) {
        if (!value) {
            if (this.tableData[table]) {
                delete this.tableData[table][key];
            }
            return store.delete(key);
        } else {
            if (value.id === undefined) {
                // If value does not have its own ID, assign it the key from the Record
                value.id = key;
            }

            if (config) {
                if (!this.tableData[table]) {
                    this.tableData[table] = {};
                }
                this.tableData[table][key] = value;

                let didClone = false;

                if (config.adjustData?.save) {
                    didClone = true;
                    value = await config.adjustData.save(JSON.parse(JSON.stringify(value)));
                }
                const prefixID = config.indexedDB?.prefixID;
                if (prefixID) {
                    if (didClone) {
                        value.id = prefixID + '/' + value.id;
                    } else {
                        value = Object.assign({}, value, {
                            id: prefixID + '/' + value.id,
                        });
                    }
                }
            }

            return store.put(value);
        }
    }
    private async _setTable(
        table: string,
        prev: object,
        value: object,
        store: IDBObjectStore,
        config: PersistOptionsLocal
    ) {
        const keys = Object.keys(value);
        let lastSet: IDBRequest;
        // Do a set for each key in the object
        const sets = await Promise.all(
            keys.map((key) => {
                const val = value[key];
                return this._setItem(table, key, val, store, config);
            })
        );
        lastSet = sets[sets.length - 1];

        // Delete keys that are no longer in the object
        if (prev) {
            const keysOld = Object.keys(prev);
            const deletes = (
                await Promise.all(
                    keysOld.map((key) => {
                        if (value[key] === undefined) {
                            return this._setItem(table, key, null, store, config);
                        }
                    })
                )
            ).filter((a) => !!a);
            if (deletes.length > 0) {
                lastSet = deletes[deletes.length - 1];
            }
        }
        return lastSet;
    }
}
