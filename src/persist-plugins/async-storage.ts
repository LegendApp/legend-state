import type {
    Change,
    ObservablePersistLocal,
    ObservablePersistenceConfigLocalOptions,
    PersistMetadata,
} from '@legendapp/state';
import { setAtPath } from '@legendapp/state';
import type { AsyncStorageStatic } from '@react-native-async-storage/async-storage';

const MetadataSuffix = '__m';

let AsyncStorage: AsyncStorageStatic;

export class ObservablePersistAsyncStorage implements ObservablePersistLocal {
    private data: Record<string, any> = {};

    // Init
    public async initialize(config: ObservablePersistenceConfigLocalOptions) {
        let tables: readonly string[] = [];
        const storageConfig = config.asyncStorage;
        if (storageConfig) {
            AsyncStorage = storageConfig.AsyncStorage;
            const { preloadAllKeys, preloadKeys } = storageConfig;
            try {
                if (preloadAllKeys) {
                    // If preloadAllKeys, load all keys and preload tables on startup
                    tables = await AsyncStorage.getAllKeys();
                } else if (preloadKeys) {
                    // If preloadKeys, preload load the tables on startup
                    tables = preloadKeys;
                }
                if (tables) {
                    const values = await AsyncStorage.multiGet(tables);

                    values.forEach(([table, value]) => {
                        this.data[table] = value ? JSON.parse(value) : undefined;
                    });
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
            try {
                return (async () => {
                    const value = await AsyncStorage.getItem(table);
                    this.data[table] = value ? JSON.parse(value) : undefined;
                })();
            } catch {
                console.error('[legend-state] ObservablePersistLocalAsyncStorage failed to parse', table);
            }
        }
    }
    // Gets
    public getTable(table: string) {
        return this.data[table] ?? {};
    }
    public getMetadata(table: string): PersistMetadata {
        return this.getTable(table + MetadataSuffix);
    }
    // Sets
    public set(table: string, changes: Change[]): Promise<void> {
        if (!this.data[table]) {
            this.data[table] = {};
        }

        for (let i = 0; i < changes.length; i++) {
            const { path, valueAtPath, pathTypes } = changes[i];
            this.data[table] = setAtPath(this.data[table], path as string[], pathTypes, valueAtPath);
        }
        return this.save(table);
    }
    public setMetadata(table: string, metadata: PersistMetadata) {
        return this.setValue(table + MetadataSuffix, metadata);
    }
    public async deleteTable(table: string) {
        return AsyncStorage.removeItem(table);
    }
    public deleteMetadata(table: string) {
        return this.deleteTable(table + MetadataSuffix);
    }
    // Private
    private async setValue(table: string, value: any) {
        this.data[table] = value;
        await this.save(table);
    }
    private async save(table: string) {
        const v = this.data[table];

        if (v !== undefined && v !== null) {
            return AsyncStorage.setItem(table, JSON.stringify(v));
        } else {
            return AsyncStorage.removeItem(table);
        }
    }
}
