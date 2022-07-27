import { observable } from './observable';
import type { Observable, ObservableComputed, ValidObservableParam } from './observableInterfaces';
import { state } from './observableState';

function onChanged<T>(observable: Observable, compute: () => T) {
    const info = state.infos.get(observable);

    const value = compute();

    // Temporarily disable readonly to set the new value
    info.readonly = false;
    observable.set(value);
    info.readonly = true;
}

export function observableComputed<T>(compute: () => ValidObservableParam<T>): ObservableComputed<T> {
    // Set isTracking so that the proxy `get` function will track accessed proxies
    state.isTracking = true;

    // Create an observable for this computed variable
    const obs = observable<T>(compute());
    state.infos.get(obs).readonly = true;

    // Listen to all tracked proxies
    state.trackedProxies.forEach(([tracked, prop]) =>
        (prop ? tracked.prop(prop) : tracked).on('change', onChanged.bind(this, obs, compute))
    );

    // Reset state
    state.isTracking = false;
    state.trackedProxies = [];

    return obs;
}
