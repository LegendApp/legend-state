import { extendPrototypes } from './primitivePrototypes';
import { ClassConstructor, ObservablePersistLocal, ObservablePersistRemote } from './types/observableInterfaces';

interface Config {
    extendPrototypes?: boolean;
    persist?: {
        localPersistence?: ClassConstructor<ObservablePersistLocal>;
        remotePersistence?: ClassConstructor<ObservablePersistRemote>;
        saveTimeout?: number;
        dateModifiedKey?: string;
    };
}

/** @internal **/
export const config: Config = { extendPrototypes: true };

export function configureObservable(options?: Config) {
    Object.assign(config, options);
    if (config.extendPrototypes) {
        extendPrototypes();
    }
}
