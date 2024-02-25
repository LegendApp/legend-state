import type { Synced, SyncedParams } from '@legendapp/state';
import { internal } from '@legendapp/state';
import { persistActivateNode } from './persistActivateNode';

const { symbolActivated } = internal;

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
