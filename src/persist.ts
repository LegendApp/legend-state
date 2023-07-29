export { configureObservablePersistence } from './lib/persist/configureObservablePersistence';
export { invertFieldMap, transformObject, transformPath } from './lib/persist/fieldTransformer';
export { mapPersistences, onChangeRemote, persistObservable, persistState } from './lib/persist/persistObservable';
import { tracking } from '@legendapp/state';

export function isInRemoteChange() {
    return tracking.inRemoteChange;
}

import type { ObservablePersistenceConfig } from './lib/observableInterfaces';
import { observablePersistConfiguration } from './lib/persist/configureObservablePersistence';
export const internal: {
    observablePersistConfiguration: ObservablePersistenceConfig;
} = {
    observablePersistConfiguration,
};
