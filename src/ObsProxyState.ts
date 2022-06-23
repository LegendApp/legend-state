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
    isInSetFn: false,
    infos: new WeakMap<ObsProxy<any>, StateInfo>(),
};
