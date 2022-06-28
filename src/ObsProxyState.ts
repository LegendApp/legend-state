import { ObsListener, ObsListenerWithProp, ObsProxy, ObsProxyUnsafe } from './ObsProxyInterfaces';

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
    isInAssign: false,
    infos: new WeakMap<ObsProxyUnsafe, StateInfo>(),
};
