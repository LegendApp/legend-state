import type { ObservableStoreDictionary, ObservableStoreType, StoreOptions } from 'common/Obs/ObservableInterfaces';

type OptionsDictionary<T = any> = {
    [K in keyof T]?: StoreOptions<T[K]>;
};

export function ObsStore<T extends object, T2 extends Record<string, Function>>(
    obj: T,
    params: { name?: string; options?: OptionsDictionary<T>; fns?: T2 } = { options: {} }
) {}
