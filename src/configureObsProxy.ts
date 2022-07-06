import { ObsPersistLocal, ObsPersistRemote } from './ObsProxyInterfaces';

type ClassConstructor<I, Args extends any[] = any[]> = new (...args: Args) => I;

interface Config {
    persist?: {
        localPersistence?: ClassConstructor<ObsPersistLocal>;
        remotePersistence?: ClassConstructor<ObsPersistRemote>;
        saveTimeout?: number;
        dateModifiedKey?: string;
    };
}

/** @internal **/
export const config: Config = {};

export function configureObsProxy(options: Config) {
    Object.assign(config, options);
}
