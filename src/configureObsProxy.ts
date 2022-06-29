import { ObsPersistLocal, ObsPersistRemote } from './ObsProxyInterfaces';

type ClassConstructor<I, Args extends any[] = any[]> = new (...args: Args) => I;

interface Config {
    persist?: {
        localPersistence?: ClassConstructor<ObsPersistLocal>;
        remotePersistence?: ClassConstructor<ObsPersistRemote>;
    };
}

/** @internal **/
export const config: Config = {};

export function configureObsProxy(options: Config) {
    Object.assign(config, options);
}
