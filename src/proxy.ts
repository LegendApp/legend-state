import { notify } from './batching';
import { computed } from './computed';
import { extractFunction, getChildNode, getNode, setNodeValue } from './globals';
import { lockObservable } from './helpers';
import { observable } from './observable';
import { onChange } from './onChange';
import { Computed, Observable } from './observableTypes';

const state = observable({
    someObject: {
        a: 12,
        b: 10,
    },
});

const proxiedState = proxy((key: 'a' | 'b') => state.someObject[key]);
const someValue = proxiedState['a'].get(); // number (note: not undefined, because key is of type 'a' | 'b', so we know it exists)

const twoWayProxy = proxy(
    (key: 'a' | 'b') => state.someObject[key],
    (key, value: number) => state.someObject[key].set(value),
);

twoWayProxy['a'].set(12);

export function proxy<T, T2 = T, K extends string = string>(
    get: (key: K) => Observable<T>,
    set?: (key: K, value: T2) => void,
): Record<string, Observable<Computed<T, T2>>> {
    // Create an observable for this computed variable
    const obs = observable({});
    lockObservable(obs, true);

    const mapTargets = new Map<string, any>();
    const node = getNode(obs);
    node.isComputed = true;
    node.proxyFn = (key: string) => {
        let target = mapTargets.get(key);
        if (!target) {
            // Note: Coercing typescript to allow undefined for set in computed because we don't want the public interface to allow undefined
            target = computed(
                () => get(key as K),
                (set ? (value) => set(key as K, value as unknown as T2) : undefined)!,
            );
            mapTargets.set(key, target);
            extractFunction(node, key, target, getNode(target));
            if (node.parentOther) {
                onChange(getNode(target), ({ value, getPrevious }) => {
                    const previous = getPrevious();
                    // Set the raw value on the proxy's parent
                    setNodeValue(node.parentOther!, node.root._);
                    // Notify the proxy
                    notify(getChildNode(node, key), value, previous, 0);
                });
            }
        }

        return target;
    };

    return obs as any;
}
