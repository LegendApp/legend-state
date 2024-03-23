import type { Observable, SyncedParams } from '@legendapp/state';
import { internal, observable } from '@legendapp/state';
import { persistActivateNode } from './persistActivateNode';

const { symbolBound } = internal;

export function synced<T>(params: SyncedParams<T>): Observable<T> {
    installPersistActivateNode();
    return observable(() => ({
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
