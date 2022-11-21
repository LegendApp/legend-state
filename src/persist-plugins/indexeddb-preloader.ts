export function preloadIndexedDB({
    databaseName,
    tableNames,
    version,
}: {
    databaseName: string;
    tableNames: string[];
    version: number;
}) {
    const code = `
        const tableData = {};
        let db;

        self.onmessage = function onmessage(e) {
            const [databaseName, tableNames, version] = e.data;

            let openRequest = indexedDB.open(databaseName, version);
            openRequest.onsuccess = async () => {
                db = openRequest.result;

                const tables = tableNames.filter(table => db.objectStoreNames.contains(table));

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
            function initTable(table, transaction) {
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
                        tableData[table] = obj;
                        resolve();
                    };
                });
            }
        };
    `;

    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    const worker = new Worker(url);
    worker.postMessage([databaseName, tableNames, version]);

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
