import type { Change } from '@legendapp/state';
import { applyChanges, isArray } from '@legendapp/state';
import type {
    ObservablePersistAsyncStoragePluginOptions,
    ObservablePersistPlugin,
    ObservablePersistPluginOptions,
    PersistMetadata,
} from '@legendapp/state/sync';
import type { AsyncStorageStatic } from '@react-native-async-storage/async-storage';
import { MetadataSuffix, PersistJSONFormat } from '../persistFormat';

let AsyncStorage: AsyncStorageStatic;

export class ObservablePersistAsyncStorage implements ObservablePersistPlugin {
    private data: Record<string, any> = {};
    private configuration: ObservablePersistAsyncStoragePluginOptions;
    private format = new PersistJSONFormat();

    constructor(configuration: ObservablePersistAsyncStoragePluginOptions) {
        this.configuration = configuration;
    }
    public async initialize(configOptions: ObservablePersistPluginOptions) {
        const storageConfig = this.configuration || configOptions.asyncStorage;

        let tables: readonly string[] = [];
        if (storageConfig) {
            AsyncStorage = storageConfig.AsyncStorage;
            const { preload } = storageConfig;
            try {
                if (preload === true) {
                    // If preloadAllKeys, load all keys and preload tables on startup
                    tables = await AsyncStorage.getAllKeys();
                } else if (isArray(preload)) {
                    // If preloadKeys, preload load the tables on startup
                    const metadataTables = preload.map((table) =>
                        table.endsWith(MetadataSuffix) ? undefined : table + MetadataSuffix,
                    );
                    tables = [...preload, ...(metadataTables.filter(Boolean) as string[])];
                }
                if (tables) {
                    this.parseValues(await AsyncStorage.multiGet(tables));
                }
            } catch (e) {
                console.error('[legend-state] ObservablePersistAsyncStorage failed to initialize', e);
            }
        } else {
            console.error('[legend-state] Missing asyncStorage configuration');
        }
    }
    public loadTable(table: string): void | Promise<void> {
        if (this.data[table] === undefined) {
            return AsyncStorage.multiGet([table, table + MetadataSuffix])
                .then((values) => {
                    try {
                        this.parseValues(values);
                    } catch (err) {
                        console.error('[legend-state] ObservablePersistLocalAsyncStorage failed to parse', table, err);
                    }
                })
                .catch((err: Error) => {
                    if (err?.message !== 'window is not defined') {
                        console.error('[legend-state] AsyncStorage.multiGet failed', table, err);
                    }
                });
        }
    }
    // Gets
    public getTable(table: string, init: object) {
        return this.data[table] ?? init;
    }
    public getMetadata(table: string): PersistMetadata {
        return this.getTable(table + MetadataSuffix, {});
    }
    // Sets
    public set(table: string, changes: Change[]): Promise<void> {
        if (!this.data[table]) {
            this.data[table] = {};
        }

        this.data[table] = applyChanges(this.data[table], changes);
        return this.save(table);
    }
    public setMetadata(table: string, metadata: PersistMetadata) {
        return this.setValue(table + MetadataSuffix, metadata);
    }
    public async deleteTable(table: string) {
        this.format.delete(table);
        return AsyncStorage.removeItem(table);
    }
    public deleteMetadata(table: string) {
        return this.deleteTable(table + MetadataSuffix);
    }
    // Private
    private parseValues(values: readonly (readonly [string, string | null])[]) {
        const raw = new Map(values);
        values.forEach(([table, value]) => {
            this.data[table] = value
                ? this.format.parse(table, value, () => raw.get(table + MetadataSuffix))
                : undefined;
        });
    }
    private async setValue(table: string, value: any) {
        this.data[table] = value;
        await this.save(table);
    }
    private async save(table: string) {
        if (this.format.needsUpgrade(table)) {
            // Rewrite the table and then its metadata in the current format. Data is written first so that
            // metadata is only marked with the format version if the data write succeeded.
            const dataTable = this.format.table(table);
            this.data[dataTable + MetadataSuffix] ??= {};
            if (table === dataTable || this.data[dataTable] !== undefined) await this.write(dataTable);
            await this.write(dataTable + MetadataSuffix);
        } else {
            return this.write(table);
        }
    }
    private write(table: string) {
        const v = this.data[table];

        if (v !== undefined && v !== null) {
            return AsyncStorage.setItem(table, this.format.stringify(table, v));
        } else {
            return AsyncStorage.removeItem(table);
        }
    }
}

export function observablePersistAsyncStorage(configuration: ObservablePersistAsyncStoragePluginOptions) {
    return new ObservablePersistAsyncStorage(configuration);
}
