import { notify } from './batching';
import { computed } from './computed';
import { extractFunction, getChildNode, getNode, setNodeValue } from './globals';
import { lockObservable } from './helpers';
import { observable } from './observable';
import { onChange } from './onChange';
import { Computed, Observable } from './observableInterfaces2';

// TODO
// export function proxy<T, T2 = T>(
//     get: (key: string) => T,
//     set: (key: string, value: T2) => void,
// ): ObservableProxyTwoWay<Record<string, T>, T2>;

// don't think we need this
// export function proxy<T>(get: (key: string) => T): Proxy<Record<string, T>>;

const state = observable({
    someObject: {
        a: 12,
        b: 10,
    },
});

const proxiedState = proxy((key: 'a' | 'b') => state.someObject[key]);
const someValue = proxiedState['a'].get(); // number

export function proxy<T, K extends string>(get: (key: K) => Observable<T>, set?: (key: K, value: T) => void) {
    // Create an observable for this computed variable
    const obs = observable({});
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore type too deep, recursion limit
    lockObservable(obs, true);

    const mapTargets = new Map<string, any>();
    const node = getNode(obs);
    node.isComputed = true;
    node.proxyFn = (key: string) => {
        let target = mapTargets.get(key);
        if (!target) {
            // Note: Coercing typescript to allow undefined for set in computed because we don't want the public interface to allow undefined
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore type too deep, recursion limit
            target = computed(() => get(key as K), (set ? (value) => set(key as K, value) : undefined)!);
            mapTargets.set(key, target);
            extractFunction(node, key, target, getNode(target));
            if (node.parentOther) {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore type too deep, recursion limit
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

    return obs as unknown as Record<string, Observable<Computed<T>>>;
}
