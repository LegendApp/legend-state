export function preloadIndexedDB(databaseName: string, tableNames: string[], version: number) {
    function workerCode() {
        const tableData: Record<string, any> = {};
        let db: IDBDatabase;

        self.onmessage = function (e) {
            const [databaseName, tableNames, version] = e.data as [string, string[], number];

            let openRequest = indexedDB.open(databaseName, version);
            openRequest.onsuccess = async () => {
                db = openRequest.result;

                const transaction = db.transaction(tableNames, 'readonly');

                await Promise.all(tableNames.map((table) => initTable(table, transaction)));

                postMessage(tableData);
            };
            function initTable(table: string, transaction: IDBTransaction): Promise<void> {
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
    }

    const code = workerCode.toString().replace(/^function .+\{?|\}$/g, '');

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
