import { ObsListener, ObsProxy } from './ObsProxyInterfaces';

export interface StateInfo {
    isWrapped: boolean;
    prop: string;
    safe: boolean;
    listeners?: ObsListener[];
    proxies?: Map<string, ObsProxy>;
    parent?: ObsProxy;
}

export const state = {
    infos: new WeakMap<ObsProxy<any>, StateInfo>(),
};
