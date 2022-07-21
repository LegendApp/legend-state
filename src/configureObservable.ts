import { extendPrototypes } from './primitivePrototypes';
import { ClassConstructor, ObservablePersistLocal, ObservablePersistRemote } from './types/observableInterfaces';

interface Config {
    extendPrototypes?: boolean;
    persistLocal?: ClassConstructor<ObservablePersistLocal>;
    persistRemote?: ClassConstructor<ObservablePersistRemote>;
    saveTimeout?: number;
    dateModifiedKey?: string;
}

export const observableConfiguration: Config = { extendPrototypes: true };

export function configureObservable(options?: Config) {
    Object.assign(observableConfiguration, options);
    if (observableConfiguration.extendPrototypes) {
        extendPrototypes();
    }
}
