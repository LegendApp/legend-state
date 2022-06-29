import { ClassConstructor } from 'common/Obs/ObservableInterfaces';
import { ObsPersistLocal, ObsPersistRemote } from './ObsProxyInterfaces';

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
