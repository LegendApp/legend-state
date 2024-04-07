import type { ObservablePersistenceConfig } from '@legendapp/state';
import { internal as internalState } from '@legendapp/state';
export { configureObservablePersistence } from './src/persist/configureObservablePersistence';
export { invertFieldMap, transformObject, transformPath } from './src/persist/fieldTransformer';
export { mapPersistences, persistObservable } from './src/persist/persistObservable';
export { synced } from './src/synced/synced';

export function isInRemoteChange() {
    return internalState.globalState.isLoadingRemote;
}

import { observablePersistConfiguration } from './src/persist/configureObservablePersistence';
export const internal: {
    observablePersistConfiguration: ObservablePersistenceConfig;
} = {
    observablePersistConfiguration,
};
