import { getObservableRawValue } from './globals';
import { observable } from './observable';
import { Observable, ObservableComputed, ObservableComputedFns, Prop } from './observableInterfaces';

const eventFns: Array<keyof ObservableComputedFns<any>> = ['onChange', 'onEquals', 'onHasValue', 'onTrue'];

export function observableComputed<T extends (Observable | Prop)[], T2>(
    args: T,
    compute: (...values: T) => T2
): ObservableComputed<T2> {
    // Create an observable for this computed variable
    const obs = observable<{ current: T2 }>({ current: undefined }) as unknown as ObservableComputed<T2>;

    const onChange = () => {
        const values = args.map(getObservableRawValue);
        const computed = compute(...(values as any));
        // @ts-ignore Because set is not exposed to users
        obs._.set('current', computed);
    };

    onChange();

    for (let i = 0; i < args.length; i++) {
        args[i]._.onChange(onChange);
    }

    // Bind callbacks to "current" so handlers get the primitive value
    for (let i = 0; i < eventFns.length; i++) {
        obs._[eventFns[i]] = obs._[eventFns[i]].bind(this, 'current');
    }

    return obs;
}
