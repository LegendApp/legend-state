import type { Synced, SyncedParams } from '@legendapp/state';
import { internal } from '@legendapp/state';
import { enableActivateSyncedNode } from './activateSyncedNode';

const { symbolLinked } = internal;

export function synced<T>(params: SyncedParams<T>): Synced<T> {
    installPersistActivateNode();
    return (() => ({
        [symbolLinked]: { ...params, synced: true },
    })) as any;
}

let didInstall = false;
function installPersistActivateNode() {
    if (!didInstall) {
        enableActivateSyncedNode();
        didInstall = true;
    }
}
