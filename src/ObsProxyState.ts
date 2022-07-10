import { ObsListener, ObsProxy, ObsProxyChecker } from './ObsProxyInterfaces';

export interface StateInfo {
    prop: string;
    target: object;
    targetOriginal: object;
    safe: boolean;
    primitive: boolean;
    listeners?: ObsListener[];
    proxies?: Map<string | number, ObsProxy>;
    parent?: ObsProxy;
}

export const state = {
    inSetFn: 0,
    inAssign: 0,
    infos: new WeakMap<ObsProxyChecker, StateInfo>(),
    skipNotifyFor: [] as ObsProxyChecker[],
};
