import { internal as internalState } from '@legendapp/state';
import type { SyncedOptionsGlobal } from './src/sync/syncTypes';
export { configureObservableSync } from './src/sync/configureObservableSync';
export * from './src/sync/persistTypes';
export * from './src/sync/syncHelpers';
export { mapSyncPlugins, onChangeRemote, syncObservable } from './src/sync/syncObservable';
export * from './src/sync/syncTypes';
export { synced } from './src/sync/synced';

export function isInRemoteChange() {
    return internalState.globalState.isLoadingRemote;
}

import { observableSyncConfiguration } from './src/sync/configureObservableSync';
export const internal: {
    observableSyncConfiguration: SyncedOptionsGlobal;
} = {
    observableSyncConfiguration,
};
