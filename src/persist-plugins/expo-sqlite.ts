import type { Change } from "@legendapp/state";
import { applyChanges,internal,isArray } from "@legendapp/state";
import type {
  ObservablePersistPlugin,
  ObservablePersistPluginOptions,
  ObservablePersistSQLiteStoragePluginOptions,
  PersistMetadata,
} from "@legendapp/state/sync";
import type { SQLiteStorage as SQLiteStorageStatic } from "expo-sqlite/kv-store";

const MetadataSuffix = "__m";

let SQLiteStorage: SQLiteStorageStatic;

const { safeParse, safeStringify } = internal;

export class ObservablePersistSQLiteStorage implements ObservablePersistPlugin {
  private data: Record<string, any> = {};
  private configuration: ObservablePersistSQLiteStoragePluginOptions;

  constructor(configuration: ObservablePersistSQLiteStoragePluginOptions) {
    this.configuration = configuration;
  }
  public async initialize(configOptions: ObservablePersistPluginOptions) {
    const storageConfig = this.configuration || configOptions.sQLiteStorage;

    let tables: readonly string[] = [];
    if (storageConfig) {
      SQLiteStorage = storageConfig.SQLiteStorage;
      const { preload } = storageConfig;
      try {
        if (preload === true) {
          // If preloadAllKeys, load all keys and preload tables on startup
          tables = await SQLiteStorage.getAllKeys();
        } else if (isArray(preload)) {
          // If preloadKeys, preload load the tables on startup
          const metadataTables = preload.map((table) =>
            table.endsWith(MetadataSuffix) ? undefined : table + MetadataSuffix
          );
          tables = [
            ...preload,
            ...(metadataTables.filter(Boolean) as string[]),
          ];
        }
        if (tables) {
          const values = await SQLiteStorage.multiGet(tables);

          values.forEach(([table, value]) => {
            this.data[table] = value ? safeParse(value) : undefined;
          });
        }
      } catch (e) {
        console.error(
          "[legend-state] ObservablePersistSQLiteStorage failed to initialize",
          e
        );
      }
    } else {
      console.error("[legend-state] Missing sQLiteStorage configuration");
    }
  }
  public loadTable(table: string): void | Promise<void> {
    if (this.data[table] === undefined) {
      return SQLiteStorage.multiGet([table, table + MetadataSuffix])
        .then((values) => {
          try {
            values.forEach(([table, value]) => {
              this.data[table] = value ? safeParse(value) : undefined;
            });
          } catch (err) {
            console.error(
              "[legend-state] ObservablePersistLocalSQLiteStorage failed to parse",
              table,
              err
            );
          }
        })
        .catch((err: Error) => {
          if (err?.message !== "window is not defined") {
            console.error(
              "[legend-state] SQLiteStorage.multiGet failed",
              table,
              err
            );
          }
        });
    }
  }
  // Gets
  public getTable(table: string, init: object) {
    return this.data[table] ?? init ?? {};
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
    return SQLiteStorage.removeItem(table);
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
      return SQLiteStorage.setItem(table, safeStringify(v));
    } else {
      return SQLiteStorage.removeItem(table);
    }
  }
}

export function observablePersistSQLiteStorage(
  configuration: ObservablePersistSQLiteStoragePluginOptions
) {
  return new ObservablePersistSQLiteStorage(configuration);
}
