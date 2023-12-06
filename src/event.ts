import { getNode, symbolGetNode } from './globals';
import { observable } from './observable';
import type { ObservableEvent, ObservablePrimitive } from './observableInterfaces';

export function event<T = void>(): ObservableEvent<T> {
    // event simply wraps around a number observable
    // which increments its value to dispatch change events
    const obs = observable<{ count: number; data?: T }>({ count: 0 });

    const node = getNode(obs);
    node.isEvent = true;
    return {
        fire: function (data: T) {
            obs.set(({ count }) => ({ count: count + 1, data }));
        },
        on: function (cb: (data?: T) => void) {
            return obs.onChange(({ value }) => cb(value.data));
        },
        get: function () {
            // Return the value so that when will be truthy
            return (obs.count as ObservablePrimitive<number>).get();
        },
        // @ts-expect-error eslint doesn't like adding symbols to the object but this does work
        [symbolGetNode]: node,
    };
}
