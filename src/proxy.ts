import { getNode } from './globals';
import { lockObservable } from './helpers';
import { observable } from './observable';
import { ObservableProxy, Observable as ObservableWriteable } from './observableInterfaces';

export function proxy<T>(get: (key: string) => ObservableWriteable<T>): ObservableProxy<T> {
    // Create an observable for this computed variable
    const obs = observable();
    lockObservable(obs, true);

    const mapTargets = new Map<string, ObservableWriteable<T>>();
    const node = getNode(obs);
    node.isComputed = true;
    node.proxyFn = (key: string) => {
        let target = mapTargets.get(key);
        if (!target) {
            target = get(key);
            mapTargets.set(key, target);
        }

        return target;
    };

    return obs as unknown as ObservableProxy<T>;
}
