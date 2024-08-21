import { internal } from '@legendapp/state';
import type { PersistOptions, SyncedOptions } from './syncTypes';
import type { synced } from './synced';

const { deepMerge } = internal;

interface SyncedOptionsConfigure extends Omit<SyncedOptions, 'persist'> {
    persist?: Partial<PersistOptions<any>>;
}

type RetType = typeof synced;

export function configureSynced<T extends typeof synced>(fn: T, origOptions: SyncedOptionsConfigure): T;
export function configureSynced(origOptions: SyncedOptionsConfigure): RetType;
export function configureSynced<T extends typeof synced<TRemote>, TRemote>(
    fnOrOrigOptions: SyncedOptionsConfigure | T,
    origOptions?: SyncedOptionsConfigure,
): RetType {
    const fn = origOptions ? (fnOrOrigOptions as T) : undefined;
    origOptions = origOptions ?? (fnOrOrigOptions as SyncedOptionsConfigure);

    return ((options: SyncedOptions) => {
        const merged = deepMerge(origOptions as any, options);
        return fn ? fn(merged) : merged;
    }) as any;
}
