import { ObsListener, ObsListenerWithProp, ObsProxyUnsafe } from './ObsProxyInterfaces';

export interface StateInfo {
    prop: string;
    target: object;
    safe: boolean;
    listeners?: (ObsListener | ObsListenerWithProp)[];
    proxies?: Map<string, ObsProxyUnsafe>;
    parent?: ObsProxyUnsafe;
}

export const state = {
    isInSetFn: false,
    isInAssign: false,
    infos: new WeakMap<ObsProxyUnsafe, StateInfo>(),
};
