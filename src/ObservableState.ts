import { ListenerFn, Observable, ObservableChecker, ObsListener } from './observableInterfaces';

export interface StateInfo {
    prop: string;
    target: object;
    targetOriginal: object;
    safe: boolean;
    primitive: boolean;
    listeners?: Set<ObsListener>;
    proxies?: Map<string | number, Observable>;
    proxiesProps?: Map<string | number, Observable>;
    parent?: Observable;
}

export const state = {
    inSetFn: 0,
    inAssign: 0,
    isTracking: false,
    inProp: false,
    trackedRootProxies: [] as Observable[],
    trackedProxies: [] as [Observable, string, boolean][],
    lastAccessedProxy: { proxy: undefined as Observable, prop: undefined as string | number },
    infos: new WeakMap<ObservableChecker, StateInfo>(),
    skipNotifyFor: [] as ObservableChecker[],
    updateTracking: (proxy: Observable, prop: any, info: StateInfo, shallow: boolean) => {
        const prev = state.trackedProxies[state.trackedProxies.length - 1];
        if (prev && info.parent && prev[0] === info.parent && prev[1] == info.prop) {
            state.trackedProxies[state.trackedProxies.length - 1] = [proxy, prop, shallow];
        } else {
            state.trackedProxies.push([proxy, prop, shallow]);
        }

        if (state.trackedRootProxies[state.trackedProxies.length - 1] === info.parent) {
            state.trackedRootProxies.pop();
        }
    },
};
