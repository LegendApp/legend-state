import { ListenerFn, ObsListener, ObsProxy, ObsProxyChecker } from './ObsProxyInterfaces';

export interface StateInfo {
    prop: string;
    target: object;
    targetOriginal: object;
    safe: boolean;
    primitive: boolean;
    listeners?: Set<ListenerFn<any>>;
    proxies?: Map<string | number, ObsProxy>;
    proxiesProps?: Map<string | number, ObsProxy>;
    parent?: ObsProxy;
}

export const state = {
    inSetFn: 0,
    inAssign: 0,
    isTracking: false,
    inProp: false,
    trackedRootProxies: [] as ObsProxy[],
    trackedProxies: [] as [ObsProxy, string][],
    lastAccessedProxy: { proxy: undefined as ObsProxy, prop: undefined as string | number },
    infos: new WeakMap<ObsProxyChecker, StateInfo>(),
    skipNotifyFor: [] as ObsProxyChecker[],
    updateTracking: (proxy: ObsProxy, prop: any, info: StateInfo) => {
        const prev = state.trackedProxies[state.trackedProxies.length - 1];
        if (prev && info.parent && prev[0] === info.parent && prev[1] == info.prop) {
            state.trackedProxies[state.trackedProxies.length - 1] = [proxy, prop];
        } else {
            state.trackedProxies.push([proxy, prop]);
        }

        if (state.trackedRootProxies[state.trackedProxies.length - 1] === info.parent) {
            state.trackedRootProxies.pop();
        }
    },
};
