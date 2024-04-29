import type { SyncedOptionsGlobal } from '@legendapp/state';
import { internal as internalState } from '@legendapp/state';
export { configureObservableSync } from './src/sync/configureObservableSync';
export { mapSyncPlugins, syncObservable } from './src/sync/syncObservable';
export { synced } from './src/sync/synced';
export { removeNullUndefined, deepEqual, diffObjects } from './src/sync/syncHelpers';

export function isInRemoteChange() {
    return internalState.globalState.isLoadingRemote;
}

import { observableSyncConfiguration } from './src/sync/configureObservableSync';
export const internal: {
    observableSyncConfiguration: SyncedOptionsGlobal;
} = {
    observableSyncConfiguration,
};
