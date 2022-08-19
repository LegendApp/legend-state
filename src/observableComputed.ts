import { observable } from './observable';
import { ObservableComputed } from './observableInterfaces';
import { onChange } from './on';
import { tracking } from './tracking';

export function observableComputed<T>(compute: () => T): ObservableComputed<T> {
    const update = () => {
        obs.set(compute());
    };

    tracking.nodes = new Map();

    const computed = compute();

    // Create an observable for this computed variable set to the initial value
    const obs = observable(computed as any);

    for (let tracked of tracking.nodes) {
        onChange(tracked[1].node, update);
    }

    tracking.nodes = undefined;

    return obs as unknown as ObservableComputed<T>;
}
