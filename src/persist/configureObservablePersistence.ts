import type { ClassConstructor, ObservablePersistLocal, ObservablePersistRemote } from '../observableInterfaces';

interface Config {
    persistLocal?: ClassConstructor<ObservablePersistLocal>;
    persistRemote?: ClassConstructor<ObservablePersistRemote>;
    saveTimeout?: number;
    dateModifiedKey?: string;
}

export const observablePersistConfiguration: Config = {};

export function configureObservablePersistence(options?: Config) {
    Object.assign(observablePersistConfiguration, options);
}
