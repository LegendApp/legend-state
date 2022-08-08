import { observable } from './observable';
import { ObservableComputed } from './observableInterfaces';
import { onChange } from './on';
import { tracking } from './state';

export function observableComputed<T>(compute: () => T): ObservableComputed<T> {
    // Create an observable for this computed variable
    // Initialize it to 0 temporarily to make it a primitive, but it will change immediately
    const obs = observable(0 as any);

    const update = () => {
        const computed = compute();

        obs.set(computed);
    };

    tracking.is = true;
    tracking.nodes = [];

    update();

    tracking.is = false;

    // Todo shallow
    for (let { node } of tracking.nodes) {
        onChange(node, update);
    }

    return obs as unknown as ObservableComputed<T>;
}
