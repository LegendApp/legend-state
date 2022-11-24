import type { ObservablePersistenceConfig } from '../observableInterfaces';

export const observablePersistConfiguration: ObservablePersistenceConfig = {};

export function configureObservablePersistence(options?: ObservablePersistenceConfig) {
    Object.assign(observablePersistConfiguration, options);
}
