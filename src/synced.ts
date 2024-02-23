import { symbolSynced } from './globals';
import { SyncedParams, SyncedParamsWithLookup, Synced } from './observableInterfaces';

export function synced<T>(params: SyncedParamsWithLookup<Record<string, T>>): Synced<Record<string, T>>;
export function synced<T>(params: SyncedParams<T>): Synced<T>;
export function synced<T>(params: SyncedParams<T>): Synced<T> {
    return (() => ({
        [symbolSynced]: params,
    })) as any;
}

// TODOV3 Remove this for final release
export const activated = synced;
