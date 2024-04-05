import type { SyncedParams } from '@legendapp/state';
import { internal } from '@legendapp/state';
import { persistActivateNode } from './persistActivateNode';

const { symbolBound } = internal;

export function synced<T>(params: SyncedParams<T>): T {
    installPersistActivateNode();
    return (() => ({
        [symbolBound]: { ...params, synced: true },
    })) as any;
}

let didInstall = false;
function installPersistActivateNode() {
    if (!didInstall) {
        persistActivateNode();
        didInstall = true;
    }
}
