import { ObsListener, ObsListenerWithProp, ObsProxy } from './ObsProxyInterfaces';

export interface StateInfo {
    prop: string;
    target: object;
    safe: boolean;
    listeners?: (ObsListener | ObsListenerWithProp)[];
    proxies?: Map<string, ObsProxy>;
    parent?: ObsProxy;
}

export const state = {
    isInSetFn: false,
    infos: new WeakMap<ObsProxy, StateInfo>(),
};
