import type { SyncedOptionsGlobal } from '@legendapp/state/sync';

export const observableSyncConfiguration: SyncedOptionsGlobal = {};

export function configureObservableSync(options?: SyncedOptionsGlobal) {
    Object.assign(observableSyncConfiguration, options);
}
