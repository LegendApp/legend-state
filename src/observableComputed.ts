import { observable } from './observable';
import { ObservableComputed } from './observableInterfaces';
import { onChange } from './on';
import { state } from './state';

export function observableComputed<T>(compute: () => T): ObservableComputed<T> {
    // Create an observable for this computed variable
    // Initialize it to 0 temporarily to make it a primitive, but it will change immediately
    const obs = observable(0 as any);

    const update = () => {
        const computed = compute();

        obs.set(computed);
    };

    state.isTracking = true;
    state.trackedNodes = [];

    update();

    state.isTracking = false;

    // Todo shallow
    for (let { node } of state.trackedNodes) {
        onChange(node, update);
    }

    return obs as unknown as ObservableComputed<T>;
}
