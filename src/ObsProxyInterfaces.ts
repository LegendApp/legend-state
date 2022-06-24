export interface ObsProps<T> {
    get?(): T;
    set?(value: T): ObsProxyUnsafe<T>;
    set?<K extends keyof T>(key: K, value: T[K]): ObsProxyUnsafe<T>;
    assign?: (value: T) => ObsProxyUnsafe<T>;
}

export interface ObsListener<T extends object = any> {
    target: ObsProxyUnsafe<T>;
    callback: ListenerFn<T>;
    /** @internal */
    _disposed?: boolean;
}
export interface ObsListenerWithProp<T extends object = object, TProp extends keyof T = never>
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

type Recurse<T, K extends keyof T, T2> = T[K] extends Array<any>
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
    ? ObsProps<T[K]> & T2
    : T[K];

type ObsPropsRecursiveUnsafe<T> = {
    [K in keyof T]: Recurse<T, K, ObsPropsRecursiveUnsafe<T[K]>>;
};

type ObsPropsRecursive<T> = {
    readonly [K in keyof T]: Recurse<T, K, ObsPropsRecursive<T[K]>>;
};

export type ObsProxyUnsafe<T = object> = ObsProps<T> & ObsPropsRecursiveUnsafe<T>;
export type ObsProxy<T = object> = ObsProps<T> & ObsPropsRecursive<T>;

export type ProxyValue<T extends ObsProxyUnsafe> = T extends ObsProxyUnsafe<infer t> ? t : T;

export type MappedProxyValue<T extends ObsProxyUnsafe[]> = {
    [K in keyof T]: ProxyValue<T[K]>;
};

// type A = ObsProxy<{ test: { test2: { test3: string } } }>;
// let a: A = {} as A;
// a.test.test2 = { test3: 'hello' };

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
