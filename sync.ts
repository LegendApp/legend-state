import { internal as internalState } from '@legendapp/state';
import type { SyncedOptionsGlobal } from './src/sync/syncTypes';
export * from './src/sync/persistTypes';
export { configureObservableSync } from './src/sync/configureObservableSync';
export { deepEqual, diffObjects, removeNullUndefined } from './src/sync/syncHelpers';
export { mapSyncPlugins, syncObservable } from './src/sync/syncObservable';
export { synced } from './src/sync/synced';
export * from './src/sync/syncTypes';

export function isInRemoteChange() {
    return internalState.globalState.isLoadingRemote;
}

import { observableSyncConfiguration } from './src/sync/configureObservableSync';
export const internal: {
    observableSyncConfiguration: SyncedOptionsGlobal;
} = {
    observableSyncConfiguration,
};
