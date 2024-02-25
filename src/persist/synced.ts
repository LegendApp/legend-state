import { internal } from '@legendapp/state';
import type { SyncedParams, SyncedLookupParams, Synced } from '@legendapp/state';
import { persistActivateNode } from './persistActivateNode';

const { symbolActivated } = internal;

export function synced<T>(params: SyncedLookupParams<Record<string, T>>): Synced<Record<string, T>>;
export function synced<T>(params: SyncedParams<T>): Synced<T>;
export function synced<T>(params: SyncedParams<T>): Synced<T> {
    installPersistActivateNode();
    return (() => ({
        [symbolActivated]: { ...params, synced: true },
    })) as any;
}

let didInstall = false;
function installPersistActivateNode() {
    if (!didInstall) {
        persistActivateNode();
    }
    didInstall = true;
}
