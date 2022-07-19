import { observable } from './observable';
import { Observable, ObservableComputed, ValidObservableParam } from './types/observableInterfaces';
import { state } from './observableState';

function onChanged<T>(observable: Observable, fn: () => T) {
    const info = state.infos.get(observable);
    info.readonly = false;
    observable.set(fn());
    info.readonly = true;
}

export function observableComputed<T>(fn: () => ValidObservableParam<T>): ObservableComputed<T> {
    state.isTracking = true;

    // Create an observable for this computed variable
    const obs = observable<T>(fn());
    state.infos.get(obs).readonly = true;

    // Listen to all tracked proxies
    state.trackedProxies.forEach(([tracked, prop]) =>
        (prop ? tracked.prop(prop) : tracked).on('change', onChanged.bind(this, obs, fn))
    );

    // Reset state
    state.isTracking = false;
    state.trackedProxies = [];

    return obs;
}
