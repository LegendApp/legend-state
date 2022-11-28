import type { PersistMetadata } from '../observableInterfaces';

export function preloadIndexedDB({
    databaseName,
    tableNames,
    version,
    loadTables,
}: {
    databaseName: string;
    tableNames: string[];
    version: number;
    loadTables?: string[];
}) {
    function workerCode() {
        const tableData: Record<string, any> = {};
        const tableMetadata: Record<string, any> = {};
        let db: IDBDatabase;

        self.onmessage = function onmessage(e: MessageEvent<[string, string[], string[], number]>) {
            const [databaseName, tableNames, loadTables, version] = e.data;

            let openRequest = indexedDB.open(databaseName, version);
            openRequest.onupgradeneeded = () => {
                const db = openRequest.result;
                tableNames.forEach((table) => {
                    db.createObjectStore(table, {
                        keyPath: 'id',
                    });
                });
            };
            openRequest.onsuccess = async () => {
                db = openRequest.result;

                const tables = (loadTables || tableNames).filter((table) => db.objectStoreNames.contains(table));

                if (tables.length > 0) {
                    try {
                        const transaction = db.transaction(tables, 'readonly');

                        await Promise.all(tables.map((table) => initTable(table, transaction)));

                        postMessage({ tableData, tableMetadata });
                    } catch {
                        postMessage({});
                    }
                } else {
                    postMessage({});
                }
            };
            openRequest.onerror = () => postMessage({});
            function initTable(table: string, transaction: IDBTransaction) {
                // If changing this, change it in indexddb.ts too
                const store = transaction.objectStore(table);
                const allRequest = store.getAll();

                return new Promise<void>((resolve) => {
                    allRequest.onsuccess = () => {
                        const arr = allRequest.result;
                        let metadata: PersistMetadata;
                        for (let i = 0; i < arr.length; i++) {
                            const val = arr[i];
                            if (val.id === '__legend_metadata') {
                                // Save this as metadata
                                delete val.id;
                                metadata = val;
                            } else {
                                let tableName = table;

                                if (val.id.includes('/')) {
                                    const [prefix, id] = val.id.split('/');
                                    tableName += prefix;
                                    val.id = id;
                                }

                                if (!this.tableData[tableName]) {
                                    this.tableData[tableName] = {};
                                }
                                this.tableData[tableName][val.id] = val;
                            }
                        }
                        tableMetadata[table] = metadata;
                        resolve();
                    };
                });
            }
        };
    }

    const code = workerCode.toString().replace(/^function .+\{?|\}$/g, '');

    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    const worker = new Worker(url);
    worker.postMessage([databaseName, tableNames, loadTables, version]);

    const promise = new Promise((resolve) => {
        worker.onmessage = (e) => {
            Object.assign((window as any).__legend_state_preload, e.data);

            resolve(e.data);
        };
    });

    (window as any).__legend_state_preload = {
        dataPromise: promise,
    };
}
