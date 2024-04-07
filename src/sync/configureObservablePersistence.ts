import type { ObservablePersistenceConfig } from '@legendapp/state';

export const observablePersistConfiguration: ObservablePersistenceConfig = {};

export function configureObservablePersistence(options?: ObservablePersistenceConfig) {
    Object.assign(observablePersistConfiguration, options);
}
