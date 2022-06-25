export interface ObsProps<T> {
    get?(): T;
    set?(value: T): ObsProxy<T>;
    set?<K extends keyof T>(key: K, value: T[K]): ObsProxy<T>;
    assign?(value: T): ObsProxy<T>;
}
export interface ObsPropsUnsafe<T> {
    get?(): T;
    set?(value: T): ObsProxyUnsafe<T>;
    set?<K extends keyof T>(key: K, value: T[K]): ObsProxyUnsafe<T>;
    assign?(value: T): ObsProxyUnsafe<T>;
}

export interface ObsListener<T extends ObsProxyChecker = any> {
    target: T;
    callback: ListenerFn<T>;
    /** @internal */
    _disposed?: boolean;
}
export interface ObsListenerWithProp<T extends ObsProxyChecker = any, TProp extends keyof T = never>
    extends Omit<ObsListener<T>, 'callback'> {
    prop?: TProp;
    callback: ListenerFn<T[TProp]>;
}

export interface ObsListenerInfo {
    changedValue: any;
    prevValue: any;
    path: string[];
}

export type ListenerFn<T> = (value: T, info: ObsListenerInfo) => void;

type Recurse<T, K extends keyof T, TRecurse, TProps> = T[K] extends Array<any>
    ? T[K]
    : T[K] extends Map<any, any>
    ? T[K]
    : T[K] extends WeakMap<any, any>
    ? T[K]
    : T[K] extends Set<any>
    ? T[K]
    : T[K] extends WeakSet<any>
    ? T[K]
    : T extends object
    ? TRecurse & TProps
    : T[K];

type ObsPropsRecursiveUnsafe<T> = {
    [K in keyof T]: Recurse<T, K, ObsPropsRecursiveUnsafe<T[K]>, ObsPropsUnsafeIfNotPrimitive<T[K]>>;
};

type ObsPropsRecursive<T> = {
    readonly [K in keyof T]: Recurse<T, K, ObsPropsRecursive<T[K]>, ObsPropsIfNotPrimitive<T[K]>>;
};
type ObsPropsIfNotPrimitive<T> = T extends object ? ObsProps<T> : T;
type ObsPropsUnsafeIfNotPrimitive<T> = T extends object ? ObsPropsUnsafe<T> : T;

export type ObsProxyUnsafe<T = object> = ObsPropsRecursiveUnsafe<T> & ObsPropsUnsafeIfNotPrimitive<T>;
export type ObsProxy<T = object> = ObsPropsRecursive<T> & ObsPropsIfNotPrimitive<T>;

export type ProxyValue<T extends ObsProxyChecker> = T extends ObsProxyUnsafe<infer t>
    ? t
    : T extends ObsProxy<infer t>
    ? t
    : T;

export type MappedProxyValue<T extends ObsProxyUnsafe[]> = {
    [K in keyof T]: ProxyValue<T[K]>;
};

export interface PersistOptionsRemote<T = any> {
    readonly?: boolean;
    once?: boolean;
    requireAuth?: boolean;
    firebase?: {
        syncPath: (uid: string) => `${string}/`;
        fieldTransforms?: any; // SameShapeWithStrings<T>;
        spreadPaths?: Exclude<keyof T, '_id' | 'id'>[];
        queryByModified?: any; // SameShapeWithBooleanOr
    };
}
export interface PersistOptions<T = any> {
    local?: string;
    remote?: PersistOptionsRemote<T>;
    localPersistence?: any;
    remotePersistence?: any;
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
    save<T>(options: PersistOptionsRemote<T>, value: T, info: ObsListenerInfo): Promise<T>;
    listen<T extends object>(
        obs: ObsProxyUnsafe<T>,
        options: PersistOptionsRemote<T>,
        onLoad: () => void,
        onChange: (obs: ObsProxyUnsafe, value: any) => void
    );
}

export interface ObsPersistState {
    isLoadedLocal: boolean;
    isLoadedRemote: boolean;
}
export type ObsProxyChecker = object & (ObsProxy | ObsProxyUnsafe);
