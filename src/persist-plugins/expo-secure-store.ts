import type { Change } from '@legendapp/state';
import { applyChanges, internal, isArray } from '@legendapp/state';
import type { ObservablePersistPlugin, ObservablePersistPluginOptions, PersistMetadata } from '@legendapp/state/sync';
import * as SecureStore from 'expo-secure-store';

const MetadataSuffix = '__m';
const { safeParse, safeStringify } = internal;

export interface ObservablePersistExpoSecureStoreOptions {
    preload?: string[] | boolean;
}

export class ObservablePersistExpoSecureStore implements ObservablePersistPlugin {
    private data: Record<string, any> = {};
    private config: ObservablePersistExpoSecureStoreOptions;

    constructor(configuration: ObservablePersistExpoSecureStoreOptions) {
        this.config = configuration;
    }

    public async initialize(_: ObservablePersistPluginOptions) {
        const { preload } = this.config;

        if (isArray(preload) && preload.length) {
            const keys = preload.flatMap((key) => (key.endsWith(MetadataSuffix) ? [key] : [key, key + MetadataSuffix]));
            const pairs = await Promise.all(
                keys.map(async (key) => [key, await SecureStore.getItemAsync(key)] as const),
            );
            pairs.forEach(([key, val]) => {
                this.data[key] = val ? safeParse(val) : undefined;
            });
        } else if (preload === true) {
            console.warn('[legend-state] Expo SecureStore cannot preload all keys; please supply a string[]');
        }
    }

    public loadTable(table: string): void | Promise<void> {
        if (this.data[table] === undefined) {
            return Promise.all([SecureStore.getItemAsync(table), SecureStore.getItemAsync(table + MetadataSuffix)])
                .then(([raw, meta]) => {
                    try {
                        this.data[table] = raw ? safeParse(raw) : undefined;
                        this.data[table + MetadataSuffix] = meta ? safeParse(meta) : undefined;
                    } catch (err) {
                        console.error('[legend-state] SecureStore parse failed for', table, err);
                    }
                })
                .catch((err) => {
                    console.error('[legend-state] SecureStore.getItemAsync failed', table, err);
                });
        }
    }

    public getTable(table: string, init: object) {
        return this.data[table] ?? init ?? {};
    }
    public getMetadata(table: string): PersistMetadata {
        return this.getTable(table + MetadataSuffix, {});
    }

    public set(table: string, changes: Change[]): Promise<void> {
        this.data[table] = applyChanges(this.data[table] ?? {}, changes);
        return this.save(table);
    }
    public setMetadata(table: string, metadata: PersistMetadata) {
        return this.setValue(table + MetadataSuffix, metadata);
    }

    public async deleteTable(table: string) {
        this.data[table] = undefined;
        return SecureStore.deleteItemAsync(table);
    }
    public deleteMetadata(table: string) {
        return this.deleteTable(table + MetadataSuffix);
    }

    private async setValue(key: string, value: any) {
        this.data[key] = value;
        await this.save(key);
    }
    private async save(key: string) {
        const v = this.data[key];
        if (v !== undefined && v !== null) {
            return SecureStore.setItemAsync(key, safeStringify(v));
        } else {
            return SecureStore.deleteItemAsync(key);
        }
    }
}

export function observablePersistExpoSecureStore(config: ObservablePersistExpoSecureStoreOptions) {
    return new ObservablePersistExpoSecureStore(config);
}
