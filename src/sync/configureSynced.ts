import { internal } from '@legendapp/state';
import type { PersistOptions, SyncedOptions } from './syncTypes';
import { synced } from './synced';

const { deepMerge } = internal;

interface SyncedOptionsConfigure extends Omit<SyncedOptions, 'persist'> {
    persist?: Partial<PersistOptions<any>>;
}

export function configureSynced<T extends (...args: any[]) => any>(fn: T, origOptions: Parameters<T>[0]): T;
export function configureSynced(origOptions: SyncedOptions): (option: SyncedOptions) => SyncedOptions;
export function configureSynced<T extends (...args: any[]) => any>(fnOrOrigOptions: T, origOptions?: Parameters<T>[0]) {
    const fn = origOptions ? (fnOrOrigOptions as T) : synced;
    origOptions = origOptions ?? (fnOrOrigOptions as SyncedOptionsConfigure);

    return (options: SyncedOptions) => {
        const merged = deepMerge(origOptions as any, options);
        return fn(merged);
    };
}
