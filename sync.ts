import type { SyncedParamsGlobal } from '@legendapp/state';
import { internal as internalState } from '@legendapp/state';
export { configureObservableSync } from './src/sync/configureObservableSync';
export { mapSyncPlugins, syncObservable } from './src/sync/syncObservable';
export { synced } from './src/sync/synced';

export function isInRemoteChange() {
    return internalState.globalState.isLoadingRemote;
}

import { observableSyncConfiguration } from './src/sync/configureObservableSync';
export const internal: {
    observableSyncConfiguration: SyncedParamsGlobal;
} = {
    observableSyncConfiguration,
};
