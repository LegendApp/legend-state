import { ObsListener, ObsProxy, ObsProxyChecker } from './ObsProxyInterfaces';

export interface StateInfo {
    prop: string;
    target: object;
    safe: boolean;
    primitive: boolean;
    listeners?: ObsListener[];
    proxies?: Map<string, ObsProxy>;
    parent?: ObsProxy;
}

export const state = {
    inSetFn: 0,
    inAssign: 0,
    isTrackingPrimitives: false,
    trackedPrimitives: [] as [ObsProxy, string][],
    infos: new WeakMap<ObsProxyChecker, StateInfo>(),
    skipNotifyFor: [] as ObsProxyChecker[],
};
