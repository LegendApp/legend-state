import { getObservableRawValue } from './globals';
import { observable3 } from './observable3';
import { Observable2, ObservableComputed3, ObservableComputedFns, Prop } from './observableInterfaces';

function _onChange(obs: ObservableComputed3, args: (Observable2 | Prop)[], compute: (...values: any) => any) {
    const values = args.map(getObservableRawValue);
    const computed = compute(...values);
    // @ts-ignore Because set is not exposed to users
    obs._.set('current', computed);
}

const eventFns: Array<keyof ObservableComputedFns<any>> = ['onChange', 'onEquals', 'onHasValue', 'onTrue'];

export function observableComputed3<T extends (Observable2 | Prop)[], T2>(
    args: T,
    compute: (...values: T) => T2
): ObservableComputed3<T2> {
    // Create an observable for this computed variable
    const obs = observable3<{ current: T2 }>({ current: undefined }) as unknown as ObservableComputed3<T2>;

    const onChange = _onChange.bind(this, obs, args, compute);

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
