import type { Change } from '@legendapp/state';
import { applyChanges, internal } from '@legendapp/state';
import type { ObservablePersistKeychainPluginOptions, ObservablePersistPlugin } from '@legendapp/state/sync';
import {
    hasGenericPassword,
    getGenericPassword,
    resetGenericPassword,
    setGenericPassword,
} from 'react-native-keychain';

const { safeParse, safeStringify } = internal;

export class ObservablePersistKeychain implements ObservablePersistPlugin {
    private data: Record<string, unknown> = {};
    private configuration: ObservablePersistKeychainPluginOptions;

    constructor(configuration?: ObservablePersistKeychainPluginOptions) {
        this.configuration = configuration ?? {};
    }
    public async initialize() {
        const { preload } = this.configuration;
        if (preload && preload.length > 0) {
            await Promise.all(
                preload.map(async (table) => {
                    try {
                        const credentials = await this.getIfExists(table);
                        this.data[table] =
                            credentials && credentials.password ? safeParse(credentials.password) : undefined;
                    } catch (error) {
                        console.error('[legend-state] ObservablePersistKeychain failed to preload table', table, error);
                        this.data[table] = undefined;
                        this.configuration.onError?.(table, error, 'preload');
                    }
                }),
            );
        }
    }
    public loadTable(table: string): void | Promise<void> {
        if (this.data[table] === undefined) {
            return this.getIfExists(table)
                .then((credentials) => {
                    try {
                        this.data[table] =
                            credentials && credentials.password ? safeParse(credentials.password) : undefined;
                    } catch (error) {
                        console.error('[legend-state] ObservablePersistKeychain failed to parse', table, error);
                        this.configuration.onError?.(table, error, 'load');
                        this.data[table] = undefined;
                    }
                })
                .catch((error: Error) => {
                    if (error?.message !== 'UserCancel') {
                        console.error('[legend-state] Keychain.getGenericPassword failed', table, error);
                    }
                    this.data[table] = undefined;
                    this.configuration.onError?.(table, error, 'load');
                });
        }
    }
    public getTable<T = unknown>(table: string, init: object): T {
        return (this.data[table] as T) ?? (init as T) ?? (undefined as T);
    }
    /**
     * Metadata operations are not supported for keychain storage
     */
    public getMetadata(): Record<string, unknown> {
        return {};
    }
    public set(table: string, changes: Change[]): Promise<void> {
        if (!this.data[table]) {
            this.data[table] = {};
        }

        this.data[table] = applyChanges(this.data[table] as object, changes);
        return this.save(table);
    }
    /**
     * Metadata operations are not supported for keychain storage
     */
    public setMetadata(): Promise<void> {
        return Promise.resolve();
    }
    public async deleteTable(table: string): Promise<void> {
        try {
            await resetGenericPassword({
                service: table,
                ...this.configuration.options,
            });
            delete this.data[table];
        } catch (error) {
            console.error('[legend-state] ObservablePersistKeychain failed to delete table', table, error);
            this.configuration.onError?.(table, error, 'delete');
        }
    }
    /**
     * Metadata operations are not supported for keychain storage
     */
    public deleteMetadata(): Promise<void> {
        return Promise.resolve();
    }
    private async save(table: string): Promise<void> {
        const value = this.data[table];

        try {
            if (value !== undefined && value !== null) {
                const serializedValue = safeStringify(value);
                await setGenericPassword(
                    table, // Use table name as username
                    serializedValue,
                    {
                        service: table,
                        ...this.configuration.options,
                    },
                );
            } else {
                // Remove the entry if value is undefined or null
                await resetGenericPassword({
                    service: table,
                    ...this.configuration.options,
                });
                delete this.data[table];
            }
        } catch (error) {
            console.error('[legend-state] ObservablePersistKeychain failed to save', table, error);
            this.configuration.onError?.(table, error, 'save');
            throw error;
        }
    }
    /**
     * getGenericPassword could take several seconds in low-spec devices, so we first check credentials presence with hasGenericPassword since it is a lightweight check and does not incur the same overhead.
     */
    private async getIfExists(table: string) {
        if (
            !(await hasGenericPassword({
                service: table,
                ...this.configuration.options,
            }))
        ) {
            return undefined;
        }
        return await getGenericPassword({
            service: table,
            ...this.configuration.options,
        });
    }
}

export function observablePersistKeychain(configuration?: ObservablePersistKeychainPluginOptions) {
    return new ObservablePersistKeychain(configuration);
}
