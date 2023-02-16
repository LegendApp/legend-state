import type { FieldTransforms, PersistMetadata } from '@legendapp/state';

export function preloadIndexedDB({
    databaseName,
    tableNames,
    version,
    loadTables,
    processTables,
    fieldTransforms,
}: {
    databaseName: string;
    tableNames: string[];
    version: number;
    loadTables?: string[];
    processTables?: (tableData: Record<string, any>) => void;
    fieldTransforms?: Record<string, FieldTransforms<any>>;
}) {
    if (fieldTransforms) {
        const invertedMaps = new WeakMap();

        // Note: eslint warns about this but we can save a little bit of declaration cost by only doing this if using fieldTransforms
        // eslint-disable-next-line no-inner-declarations
        function invertFieldMap(obj: Record<string, any>) {
            const existing = invertedMaps.get(obj);
            if (existing) return existing;

            const target: Record<string, any> = {} as any;

            Object.keys(obj).forEach((key) => {
                const val = obj[key];
                if (key === '_dict') {
                    target[key] = invertFieldMap(val);
                } else if (
                    key.endsWith('_obj') ||
                    key.endsWith('_dict') ||
                    key.endsWith('_arr') ||
                    key.endsWith('_val')
                ) {
                    const keyMapped = obj[key.replace(/_obj|_dict|_arr|_val$/, '')];
                    const suffix = key.match(/_obj|_dict|_arr|_val$/)[0];
                    target[keyMapped + suffix] = invertFieldMap(val);
                } else if (typeof val === 'string') {
                    target[val] = key;
                }
            });
            invertedMaps.set(obj, target);

            return target;
        }
        Object.keys(fieldTransforms).forEach((table) => {
            fieldTransforms[table] = invertFieldMap(fieldTransforms[table]);
        });
    }
    function workerCode() {
        const tableData: Record<string, any> = {};
        const tableMetadata: Record<string, any> = {};
        let db: IDBDatabase;

        function isArray(obj: unknown): obj is Array<any> {
            return Array.isArray(obj);
        }
        function isObject(obj: unknown): obj is Record<any, any> {
            return !!obj && typeof obj === 'object' && !isArray(obj);
        }

        self.onmessage = function onmessage(
            e: MessageEvent<[string, string[], string[], number, Record<string, FieldTransforms<any>>]>
        ) {
            const [databaseName, tableNames, loadTables, version, fieldTransforms] = e.data;

            const transformObject =
                fieldTransforms &&
                function transformObject(dataIn: Record<string, any>, map: Record<string, any>) {
                    let ret = dataIn;
                    if (dataIn) {
                        ret = {};

                        const dict = Object.keys(map).length === 1 && map['_dict'];

                        Object.keys(dataIn).forEach((key) => {
                            if (ret[key] !== undefined) return;

                            let v = dataIn[key];

                            if (dict) {
                                ret[key] = transformObject(v, dict);
                            } else {
                                const mapped = map[key];
                                if (mapped === undefined) {
                                    // Don't transform dateModified if user doesn't want it
                                    if (key !== '@') {
                                        ret[key] = v;
                                        if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
                                            console.error(
                                                'A fatal field transformation error has occurred',
                                                key,
                                                dataIn,
                                                map
                                            );
                                        }
                                    }
                                } else if (mapped !== null) {
                                    if (v !== undefined && v !== null) {
                                        if (map[key + '_val']) {
                                            const valMap = map[key + '_val'];
                                            v = valMap[key];
                                        } else if (map[key + '_arr'] && isArray(v)) {
                                            const mapChild = map[key + '_arr'];
                                            v = v.map((vChild) => transformObject(vChild, mapChild));
                                        } else if (isObject(v)) {
                                            if (map[key + '_obj']) {
                                                v = transformObject(v, map[key + '_obj']);
                                            } else if (map[key + '_dict']) {
                                                const mapChild = map[key + '_dict'];
                                                let out = {};
                                                Object.keys(v).forEach((keyChild) => {
                                                    out[keyChild] = transformObject(v[keyChild], mapChild);
                                                });
                                                v = out;
                                            }
                                        }
                                    }
                                    ret[mapped] = v;
                                }
                            }
                        });
                    }

                    return ret;
                };

            const openRequest = indexedDB.open(databaseName, version);
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

                        if (processTables) {
                            processTables(tableData);
                        }

                        postMessage({ tableData, tableMetadata });
                    } catch (e) {
                        console.error(e);
                        postMessage({ error: e });
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
                        if (!tableData[table]) {
                            tableData[table] = {};
                        }
                        for (let i = 0; i < arr.length; i++) {
                            const val = arr[i];

                            // In case id is a number convert it to a string
                            if (!val.id.includes) {
                                val.id = val.id + '';
                            }

                            if (val.id.endsWith('__legend_metadata')) {
                                const id = val.id.replace('__legend_metadata', '');
                                // Save this as metadata
                                delete val.id;
                                metadata = val;
                                const tableName = id ? table + '/' + id : table;
                                tableMetadata[tableName] = metadata;
                            } else {
                                let tableName = table;

                                if (val.id.includes('/')) {
                                    const [prefix, id] = val.id.split('/');
                                    tableName += '/' + prefix;
                                    val.id = id;
                                }

                                if (!tableData[tableName]) {
                                    tableData[tableName] = {};
                                }
                                tableData[tableName][val.id] = val;
                            }
                        }

                        if (fieldTransforms) {
                            Object.keys(fieldTransforms).forEach((table) => {
                                Object.keys(tableData).forEach((tableName) => {
                                    if (tableName === table || tableName.startsWith(table + '/')) {
                                        const data = tableData[tableName];
                                        if (data) {
                                            tableData[tableName + '_transformed'] = transformObject(
                                                data,
                                                fieldTransforms[table]
                                            );
                                        }
                                    }
                                });
                            });
                        }
                        resolve();
                    };
                });
            }
        };
    }

    let code = workerCode.toString().replace(/^function .+\{?|\}$/g, '');

    if (processTables) {
        code = 'const processTables = ' + processTables.toString() + '\n' + code;
    }

    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    const worker = new Worker(url);
    worker.postMessage([databaseName, tableNames, loadTables, version, fieldTransforms]);

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
