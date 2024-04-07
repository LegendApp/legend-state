import type { SyncedParamsGlobal } from '@legendapp/state';

export const observableSyncConfiguration: SyncedParamsGlobal = {};

export function configureObservableSync(options?: SyncedParamsGlobal) {
    Object.assign(observableSyncConfiguration, options);
}
