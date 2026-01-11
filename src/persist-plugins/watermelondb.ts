import { applyChanges, internal } from '@legendapp/state';

import type { ObservablePersistPlugin, PersistMetadata, PersistOptions } from '@legendapp/state/sync';
import type { Change } from '@legendapp/state';
import type LocalStorage from '@nozbe/watermelondb/Database/LocalStorage';

const MetadataSuffix = '__m';

const { safeParse, safeStringify } = internal;

class ObservablePersistWatermelonDB implements ObservablePersistPlugin {
    private readonly storage: LocalStorage;
    private data: Record<string, unknown> = {};

    constructor(storage: LocalStorage) {
        if (!storage) {
            throw new Error(
                '[legend-state] ObservablePersistWatermelonDB failed to initialize. You need to pass the WatermelonDB localStorage instance.',
            );
        }

        this.storage = storage;
    }

    getTable<T = any>(table: string, init: any): T {
        if (this.data[table] === undefined) {
            try {
                this.storage._getSync(table, (val) => {
                    this.data[table] = val ? safeParse(val) : init;
                });
            } catch (e) {
                console.error('[legend-state] ObservablePersistWatermelonDB parse failed', table, e);
            }
        }

        return this.data[table] as T;
    }

    deleteTable(table: string): Promise<void> | void {
        if (!this.storage) return undefined;

        delete this.data[table];

        return this.storage.remove(table);
    }

    set(table: string, changes: Change[]): Promise<void> | void {
        const current = this.data[table] ?? {};
        const updated = applyChanges(current, changes);
        this.data[table] = updated;

        return this.storage.set(table, safeStringify(updated));
    }

    getMetadata(table: string, _config: PersistOptions): PersistMetadata {
        return this.getTable(table + MetadataSuffix, {});
    }

    setMetadata(table: string, metadata: PersistMetadata): Promise<void> | void {
        const key = table + MetadataSuffix;
        this.data[key] = metadata;

        return this.storage.set(key, metadata);
    }

    deleteMetadata(table: string): Promise<void> | void {
        const key = table + MetadataSuffix;
        delete this.data[key];

        return this.storage.remove(key);
    }
}

/**
 * Usage:
 * ```ts
 * import { observablePersistWatermelonDB } from '@legendapp/state/sync-plugins/ObservablePersistWatermelonDB'
 * import { database } from '@/lib/db'
 *
 * syncObservable(settings$, {
 *   persist: {
 *     name: 'settings',
 *     plugin: observablePersistWatermelonDB(database.localStorage),
 *   },
 * })
 * ```
 */
export function observablePersistWatermelonDB(localStorage: LocalStorage) {
    return new ObservablePersistWatermelonDB(localStorage);
}
