import { ObsPersistLocal, ObsPersistRemote } from './ObsProxyInterfaces';

interface Config {
    persist?: {
        localPersistence?: ObsPersistLocal;
        remotePersistence?: ObsPersistRemote;
    };
}

/** @internal **/
export const config: Config = {};

export function configureObsProxy(options: Config) {
    Object.assign(config, options);
}
