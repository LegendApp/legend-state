import { internal } from '@legendapp/state';
import type { SyncedParams, SyncedParamsWithLookup, Synced } from '@legendapp/state';

const { symbolActivated } = internal;

export function synced<T>(params: SyncedParamsWithLookup<Record<string, T>>): Synced<Record<string, T>>;
export function synced<T>(params: SyncedParams<T>): Synced<T>;
export function synced<T>(params: SyncedParams<T>): Synced<T> {
    return (() => ({
        [symbolActivated]: { ...params, synced: true },
    })) as any;
}
