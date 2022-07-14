import { observable } from './observable';
import { Observable, ValidObservableParam } from './observableInterfaces';
import { state } from './observableState';

function onChanged<T>(observable: Observable, fn: () => T) {
    observable.set(fn());
}

export function observableComputed<T>(fn: () => ValidObservableParam<T>) {
    state.isTracking = true;

    // Create an observable for this computed variable
    const obs = observable<T>(fn());

    // Listen to all tracked proxies
    state.trackedProxies.forEach(([tracked, prop]) =>
        (prop ? tracked.prop(prop) : tracked).on('change', onChanged.bind(this, obs, fn))
    );

    // Reset state
    state.isTracking = false;
    state.trackedProxies = [];

    return obs;
}
