export type EventType = 'change' | 'equals' | 'hasValue' | 'true';

export interface ObsProps<T> {
    get(): T;
    set(value: T): ObsProxy<T>;
    set<K extends keyof T>(key: K | string, value: T[K]): ObsProxy<T[K]>;
    assign(value: T | Partial<T>): ObsProxy<T>;
    on(eventType: 'change', cb: ListenerFn<T>): ObsListener<T>;
    on(eventType: 'equals', value: T, cb?: (value?: T) => void): { listener: ObsListener<T>; promise: Promise<T> };
    on(eventType: 'hasValue', cb?: (value?: T) => void): { listener: ObsListener<T>; promise: Promise<T> };
    on(eventType: 'true', cb?: (value?: T) => void): { listener: ObsListener<T>; promise: Promise<T> };
    on(
        eventType: EventType,
        cb?: (value?: T) => void
    ): ObsListener<T> | { listener: ObsListener<T>; promise: Promise<T> };
}
export type ObsPropsUnsafe<T> = Partial<ObsProps<T>>;

export interface ObsListener<T = any> {
    target: ObsProxy<T>;
    callback: ListenerFn<T>;
    /** @internal */
    _disposed?: boolean;
}

export interface ObsListenerInfo {
    changedValue: any;
    prevValue: any;
    path: string[];
}

export type ListenerFn<T> = (value: T, info: ObsListenerInfo) => void;

type Recurse<T, K extends keyof T, TRecurse, TProps> = T[K] extends
    | Function
    | Array<any>
    | Map<any, any>
    | WeakMap<any, any>
    | Set<any>
    | WeakSet<any>
    ? T[K]
    : T extends object
    ? TRecurse & TProps
    : T[K];

type ObsPropsRecursiveUnsafe<T> = {
    [K in keyof T]: Recurse<T, K, ObsPropsRecursiveUnsafe<T[K]>, ObsPropsUnsafe<T[K]>>;
};

type ObsPropsRecursive<T> = {
    readonly [K in keyof T]: Recurse<T, K, ObsPropsRecursive<T[K]>, ObsProps<T[K]>>;
};

export type ObsProxyUnsafe<T = object> = ObsPropsRecursiveUnsafe<T> & ObsPropsUnsafe<T>;
export type ObsProxy<T = object> = ObsPropsRecursive<T> & ObsProps<T>;

export type ProxyValue<T extends ObsProxy | ObsProxyUnsafe> = T extends ObsProxyUnsafe<infer t>
    ? t
    : T extends ObsProxy<infer t>
    ? t
    : T;

export type MappedProxyValue<T extends ObsProxyChecker[]> = {
    [K in keyof T]: ProxyValue<T[K]>;
};

export type QueryByModified<T> =
    | boolean
    | '*'
    | {
          [K in keyof T]?: QueryByModified<T[K]>;
      };

export interface PersistOptionsRemote<T = any> {
    readonly?: boolean;
    once?: boolean;
    requireAuth?: boolean;
    saveTimeout?: number;
    firebase?: {
        syncPath: (uid: string) => `/${string}/`;
        fieldTransforms?: SameShapeWithStrings<T>;
        spreadPaths?: Exclude<keyof T, '_id' | 'id'>[];
        queryByModified?: QueryByModified<T>;
    };
}
export interface PersistOptions<T = any> {
    local?: string;
    remote?: PersistOptionsRemote<T>;
    localPersistence?: any;
    remotePersistence?: any;
    dateModifiedKey?: string;
}

export interface ObsPersistLocal {
    getValue<T = any>(path: string): T;
    setValue(path: string, value: any): void;
    deleteById(path: string): void;
}
export interface ObsPersistLocalAsync extends ObsPersistLocal {
    preload(path: string): Promise<void>;
}
export interface ObsPersistRemote {
    save<T>(options: PersistOptions<T>, value: T, info: ObsListenerInfo): Promise<T>;
    listen<T>(
        obs: ObsProxyChecker<T>,
        options: PersistOptions<T>,
        onLoad: () => void,
        onChange: (obs: ObsProxy<T>, value: any) => void
    );
}

export interface ObsPersistState {
    isLoadedLocal: boolean;
    isLoadedRemote: boolean;
    clearLocal: () => Promise<void>;
}
export type ObsProxyChecker<T = any> = ObsProxy<T> | ObsProxyUnsafe<T>;

export type RecordValue<T> = T extends Record<string, infer t> ? t : never;
export type ArrayValue<T> = T extends Array<infer t> ? t : never;

type SameShapeWithStringsRecord<T> = {
    [K in keyof Omit<T, '_id' | 'id'>]-?: '*' | string | T[K] extends Record<string, Record<string, any>>
        ?
              | {
                    _: string;
                    __dict: SameShapeWithStrings<RecordValue<T[K]>>;
                }
              | SameShapeWithStrings<T[K]>
        : T[K] extends Array<infer t>
        ?
              | {
                    _: string;
                    __arr: SameShapeWithStrings<t> | Record<string, string>;
                }
              | string
        : T[K] extends Record<string, object>
        ?
              | (
                    | {
                          _: string;
                          __obj: SameShapeWithStrings<RecordValue<T[K]>> | SameShapeWithStrings<T[K]>;
                      }
                    | { _: string; __dict: SameShapeWithStrings<RecordValue<T[K]>> }
                )
              | string
        : T[K] extends Record<string, any>
        ?
              | ({ _: string; __obj: SameShapeWithStrings<T[K]> } | { _: string; __dict: SameShapeWithStrings<T[K]> })
              | string
        : string | { _: string; __val: Record<string, string> };
};
type SameShapeWithStrings<T> = T extends Record<string, Record<string, any>>
    ? { __dict: SameShapeWithStrings<RecordValue<T>> } | SameShapeWithStringsRecord<T>
    : SameShapeWithStringsRecord<T>;
