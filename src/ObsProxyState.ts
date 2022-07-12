import { ObsListener, ObsProxy, ObsProxyChecker } from './ObsProxyInterfaces';

export interface StateInfo {
    prop: string;
    target: object;
    targetOriginal: object;
    safe: boolean;
    primitive: boolean;
    listeners?: ObsListener[];
    proxies?: Map<string | number, ObsProxy>;
    proxiesProps?: Map<string | number, ObsProxy>;
    parent?: ObsProxy;
}

export const state = {
    inSetFn: 0,
    inAssign: 0,
    inProp: false,
    lastAccessedProxy: { proxy: undefined as ObsProxy, prop: undefined as string | number },
    infos: new WeakMap<ObsProxyChecker, StateInfo>(),
    skipNotifyFor: [] as ObsProxyChecker[],
};
