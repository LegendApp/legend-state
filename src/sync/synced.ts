import { isFunction, linked } from '@legendapp/state';
import { enableActivateSyncedNode } from './activateSyncedNode';
import type { Synced, SyncedOptions } from './syncTypes';

export function synced<T>(params: SyncedOptions<T> | (() => T)): Synced<T> {
    installPersistActivateNode();
    if (isFunction(params)) {
        params = { get: params };
    }
    return linked({ ...params, synced: true } as any);
}

let didInstall = false;
function installPersistActivateNode() {
    if (!didInstall) {
        enableActivateSyncedNode();
        didInstall = true;
    }
}
