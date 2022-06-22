import { ObsListener, ObsProxy } from './ObsProxyInterfaces';

export interface StateInfo {
    isWrapped: boolean;
    prop: string;
    listeners?: ObsListener[];
    proxies?: Map<string, ObsProxy>;
    parent?: ObsProxy;
}

export const state = {
    infos: new WeakMap<ObsProxy<any>, StateInfo>(),
};
