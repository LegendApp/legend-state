import { getObservableRawValue } from './globals';
import { observable3 } from './observable3';
import { Observable2, ObservableComputed3, Prop } from './observableInterfaces';

function _onChange(obs: ObservableComputed3, args: (Observable2 | Prop)[], compute: (...values: any) => any) {
    const values = args.map(getObservableRawValue);
    const computed = compute(...values);
    // @ts-ignore Because it's not available to users
    obs._set('value', computed);
}

export function observableComputed3<T extends (Observable2 | Prop)[], T2>(
    args: T,
    compute: (...values: T) => T2
): ObservableComputed3<T2> {
    // Create an observable for this computed variable
    const obs = observable3<{ value: T2 }>({ value: undefined }) as ObservableComputed3<T2>;

    const onChange = _onChange.bind(this, obs, args, compute);

    onChange();

    for (let i = 0; i < args.length; i++) {
        args[i]._onChange(onChange);
    }

    return obs;
}
