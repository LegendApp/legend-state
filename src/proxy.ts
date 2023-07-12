import { computed } from './computed';
import { createObservable } from './createObservable';
import { getNode } from './globals';
import { lockObservable } from './helpers';
import { Observable as ObservableWriteable, ObservableProxy } from './observableInterfaces';

export function proxy<T>(get: (key: string) => ObservableWriteable<T>): ObservableProxy<T> {
    // Create an observable for this computed variable
    const obs = createObservable();
    lockObservable(obs, true);

    const mapTargets = new Map<string, ObservableWriteable<T>>();
    const node = getNode(obs);
    node.isComputed = true;
    node.proxyFn = (key: string) => {
        let target = mapTargets.get(key);
        if (!target) {
            target = computed(() => get(key));
            mapTargets.set(key, target);
        }

        return target;
    };

    return obs as unknown as ObservableProxy<T>;
}
