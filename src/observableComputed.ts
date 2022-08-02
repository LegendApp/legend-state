import state from './state';
import { getObservableRawValue } from './globals';
import { observable } from './observable';
import { Observable, ObservableComputed, Prop } from './observableInterfaces';
import { onChange } from './on';

export function observableComputed<T extends (Observable | Prop)[], T2>(
    args: T,
    compute: (...values: T) => T2
): ObservableComputed<T2> {
    // Create an observable for this computed variable
    // Initialize it to 0 temporarily to make it a primitive, but it will change immediately
    const obs = observable(0 as any);

    const update = () => {
        const values: any[] = [];
        for (let i = 0; i < args.length; i++) {
            values.push(getObservableRawValue(args[i] as Observable<any>));
        }
        const computed = compute(...(values as T));

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

    return obs as unknown as ObservableComputed<T2>;
}
