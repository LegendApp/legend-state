import { computed } from './computed';
import { getNode } from './globals';
import { lockObservable } from './helpers';
import { observable } from './observable';
import { ObservableProxy, Observable as ObservableWriteable } from './observableInterfaces';

export function proxy<T extends Record<string, any>>(
    get: <K extends keyof T>(key: K) => ObservableWriteable<T[K]>,
): ObservableProxy<T>;
export function proxy<T>(get: (key: string) => ObservableWriteable<T>): ObservableProxy<Record<string, T>>;
export function proxy<T extends Record<string, any>>(get: (key: any) => ObservableWriteable<any>): ObservableProxy<T> {
    // Create an observable for this computed variable
    const obs = observable();
    lockObservable(obs, true);

    const mapTargets = new Map<string, any>();
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
