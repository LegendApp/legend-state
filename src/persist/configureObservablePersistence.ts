import { ObservablePersistenceConfig } from './types';

export const observablePersistConfiguration: ObservablePersistenceConfig = {};

export function configureObservablePersistence(options?: ObservablePersistenceConfig) {
    Object.assign(observablePersistConfiguration, options);
}
