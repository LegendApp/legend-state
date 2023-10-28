export { configureObservablePersistence } from './src/persist/configureObservablePersistence';
export { invertFieldMap, transformObject, transformPath } from './src/persist/fieldTransformer';
export { mapPersistences, persistObservable } from './src/persist/persistObservable';
import { internal as internalState } from '@legendapp/state';

export function isInRemoteChange() {
    return internalState.globalState.isLoadingRemote$.get();
}

import type { ObservablePersistenceConfig } from './src/observableInterfaces';
import { observablePersistConfiguration } from './src/persist/configureObservablePersistence';
export const internal: {
    observablePersistConfiguration: ObservablePersistenceConfig;
} = {
    observablePersistConfiguration,
};

import { persistActivateNode } from './src/persist/persistActivateNode';
persistActivateNode();
