import { ObsListener, ObsListenerWithProp, ObsProxy, ObsProxyChecker } from './ObsProxyInterfaces';

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
    isTrackingPrimitives: false,
    trackedPrimitives: [] as [ObsProxy, string][],
    infos: new WeakMap<ObsProxyChecker, StateInfo>(),
    skipNotifyFor: [] as ObsProxyChecker[],
};
