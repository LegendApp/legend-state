import { isFunction, linked } from '@legendapp/state';
import { enableActivateSyncedNode } from './activateSyncedNode';
import type { Synced, SyncedOptions } from './syncTypes';

export function synced<TRemote, TLocal = TRemote>(
    params: SyncedOptions<TRemote, TLocal> | (() => TRemote),
): Synced<TLocal> {
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
