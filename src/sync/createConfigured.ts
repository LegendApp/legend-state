import { ObservableParam, internal } from '@legendapp/state';
import type { PersistOptions, SyncedOptions } from './syncTypes';
import { syncObservable } from './syncObservable';
import { synced } from './synced';

const { deepMerge } = internal;

interface SyncedOptionsConfigure extends Omit<SyncedOptions, 'persist'> {
    persist?: Partial<PersistOptions<any>>;
}

export function createSyncObservable(origOptions: SyncedOptionsConfigure): typeof syncObservable {
    return (obs$: ObservableParam, options: SyncedOptionsConfigure) =>
        syncObservable(obs$, deepMerge(origOptions, options));
}
export function createSynced<T extends typeof synced>(fn: T, origOptions: SyncedOptionsConfigure): T {
    return ((options) => fn(deepMerge(origOptions as any, options))) as T;
}
