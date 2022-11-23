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

                        postMessage(tableData);
                    } catch {
                        postMessage({});
                    }
                } else {
                    postMessage({});
                }
            };
            openRequest.onerror = () => postMessage({});
            function initTable(table: string, transaction: IDBTransaction) {
                const store = transaction.objectStore(table);
                const allRequest = store.getAll();

                return new Promise<void>((resolve) => {
                    allRequest.onsuccess = () => {
                        const arr = allRequest.result;
                        let obj = {};
                        for (let i = 0; i < arr.length; i++) {
                            const val = arr[i];
                            if (val.id === '__legend_obj') {
                                obj = val.value;
                            } else {
                                obj[val.id] = val;
                                if (val.__legend_id) {
                                    delete val.__legend_id;
                                    delete val.id;
                                }
                            }
                        }
                        tableData[table] = obj;
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
            (window as any).__legend_state_preload.data = e.data;
            resolve(e.data);
        };
    });

    (window as any).__legend_state_preload = {
        dataPromise: promise,
    };
}
