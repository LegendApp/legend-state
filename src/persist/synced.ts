import type { SyncedParams } from '@legendapp/state';
import { internal } from '@legendapp/state';
import { persistActivateNode } from './persistActivateNode';

const { symbolLinked } = internal;

export function synced<T>(params: SyncedParams<T>): T {
    installPersistActivateNode();
    return (() => ({
        [symbolLinked]: { ...params, synced: true },
    })) as any;
}

let didInstall = false;
function installPersistActivateNode() {
    if (!didInstall) {
        persistActivateNode();
        didInstall = true;
    }
}
