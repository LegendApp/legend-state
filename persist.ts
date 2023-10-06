export { configureObservablePersistence } from './src/persist/configureObservablePersistence';
export { invertFieldMap, transformObject, transformPath } from './src/persist/fieldTransformer';
export { mapPersistences, onChangeRemote, persistObservable, persistState } from './src/persist/persistObservable';
import { internal as internalState } from '@legendapp/state';

export function isInRemoteChange() {
    return internalState.globalState.isLoadingRemote;
}

import type { ObservablePersistenceConfig } from './src/persist/types';
import { observablePersistConfiguration } from './src/persist/configureObservablePersistence';
export const internal: {
    observablePersistConfiguration: ObservablePersistenceConfig;
} = {
    observablePersistConfiguration,
};
