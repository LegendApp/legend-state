import type { SyncedOptionsGlobal } from './src/sync/syncTypes';
export { configureObservableSync } from './src/sync/configureObservableSync';
export * from './src/sync/persistTypes';
export * from './src/sync/syncHelpers';
export { mapSyncPlugins, onChangeRemote, syncObservable } from './src/sync/syncObservable';
export * from './src/sync/syncTypes';
export { synced } from './src/sync/synced';
export * from './src/sync/configureSynced';
export { createRevertChanges } from './src/sync/revertChanges';

import { waitForSet } from './src/sync/waitForSet';
import { observableSyncConfiguration } from './src/sync/configureObservableSync';
import { runWithRetry } from './src/sync/retry';
export const internal: {
    observableSyncConfiguration: SyncedOptionsGlobal;
    waitForSet: typeof waitForSet;
    runWithRetry: typeof runWithRetry;
} = {
    observableSyncConfiguration,
    waitForSet,
    runWithRetry,
};
