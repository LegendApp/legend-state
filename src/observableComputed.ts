import { observable } from './observable';
import { ObservableComputed } from './observableInterfaces';
import { onChange } from './on';
import { tracking } from './tracking';

export function observableComputed<T>(compute: () => T): ObservableComputed<T> {
    const update = () => {
        obs.set(compute());
    };

    tracking.nodes = {};

    const computed = compute();

    // Create an observable for this computed variable set to the initial value
    const obs = observable(computed as any);

    const keys = Object.keys(tracking.nodes);
    for (let i = 0; i < keys.length; i++) {
        const node = tracking.nodes[keys[i] as unknown as number].node;
        onChange(node, update);
    }

    tracking.nodes = undefined;

    return obs as unknown as ObservableComputed<T>;
}
