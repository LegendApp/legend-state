import { extendPrototypes } from './primitivePrototypes';
import { ObsPersistLocal, ObsPersistRemote } from './types/observableInterfaces';

type ClassConstructor<I, Args extends any[] = any[]> = new (...args: Args) => I;

interface Config {
    extendPrototypes?: boolean;
    persist?: {
        localPersistence?: ClassConstructor<ObsPersistLocal>;
        remotePersistence?: ClassConstructor<ObsPersistRemote>;
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
