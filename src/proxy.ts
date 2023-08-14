import { computed } from './computed';
import { getNode } from './globals';
import { lockObservable } from './helpers';
import { observable } from './observable';
import {
    ObservableProxy,
    ObservableProxyLink,
    ObservableProxyTwoWay,
    Observable as ObservableWriteable,
} from './observableInterfaces';

export function proxy<T, T2 = T>(
    get: (key: string) => T,
    set: (key: string, value: T2) => void,
): ObservableProxyTwoWay<Record<string, T>, T2>;
export function proxy<T extends Record<string, any>>(
    get: <K extends keyof T>(key: K) => ObservableWriteable<T[K]>,
): ObservableProxyLink<T>;
export function proxy<T>(get: (key: string) => ObservableWriteable<T>): ObservableProxyLink<Record<string, T>>;
export function proxy<T>(get: (key: string) => T): ObservableProxy<Record<string, T>>;
export function proxy<T extends Record<string, any>, T2 = T>(
    get: (key: any) => ObservableWriteable<any>,
    set?: (key: any, value: T2) => void,
): any {
    // Create an observable for this computed variable
    const obs = observable();
    lockObservable(obs, true);

    const mapTargets = new Map<string, any>();
    const node = getNode(obs);
    node.isComputed = true;
    node.proxyFn = (key: string) => {
        let target = mapTargets.get(key);
        if (!target) {
            // Note: Coercing typescript to allow undefined for set in computed because we don't want the public interface to allow undefined
            target = computed(() => get(key), (set ? (value) => set(key, value as T2) : undefined)!);
            mapTargets.set(key, target);
        }

        return target;
    };

    return obs;
}
