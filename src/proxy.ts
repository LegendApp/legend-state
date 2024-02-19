import { activated } from './activated';
import { observable } from './observable';
import { ObservableProxy, ObservableProxyLink, ObservableProxyTwoWay } from './observableInterfaces';
import { ObservableWriteable } from './observableTypes';

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
    return observable(
        activated({
            lookup: (key) =>
                set
                    ? activated({
                          get: () => get(key),
                          onSet: ({ value }) => set(key, value as any),
                      })
                    : get(key),
        }),
    );
}
