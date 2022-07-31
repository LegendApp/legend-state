import { getObservableRawValue } from './globals';
import { observable } from './observable';
import { Observable, ObservableComputed, Prop } from './observableInterfaces';

export function observableComputed<T extends (Observable | Prop)[], T2>(
    args: T,
    compute: (...values: T) => T2
): ObservableComputed<T2> {
    // Create an observable for this computed variable
    // Initialize it to 0 temporarily to make it a primitive, but it will change immediately
    const obs = observable(0) as unknown as ObservableComputed<T2>;

    const onChange = () => {
        const values = args.map(getObservableRawValue);
        const computed = compute(...(values as any));

        // @ts-ignore Using hidden param
        obs._.set(computed);
    };

    onChange();

    for (let i = 0; i < args.length; i++) {
        args[i]._.onChange(onChange);
    }

    return obs;
}
