export interface ObsProps<T> {
    value?: T;
    set(value: T): ObsProxy<T>;
    set<K extends keyof T>(key: K, value: T[K]): ObsProxy<T>;
    assign?: (value: T) => ObsProxy<T>;
}

export interface ObsListener<T extends object = any> {
    target: ObsProxy<T>;
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

type ObsPropsRecursive<T> = {
    [K in keyof T]: ObsProxy<T[K]>;
};

type ObsPropsRecursiveReadonly<T> = {
    readonly [K in keyof T]: ObsProxy<T[K]>;
};

export type ProxyValue<T extends ObsProxy> = T extends ObsProxy<infer t> ? t : T;

export type MappedProxyValue<T extends ObsProxy[]> = {
    [K in keyof T]: ProxyValue<T[K]>;
};

export type ObsProxy<T = object> = T extends object ? T & ObsProps<T> & ObsPropsRecursive<T> : T;
export type ObsProxySafe<T = object> = T extends object ? Readonly<T> & ObsProps<T> & ObsPropsRecursiveReadonly<T> : T;

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
        obs: ObsProxy<T>,
        options: PersistOptionsRemote<T>,
        onLoad: () => void,
        onChange: (obs: ObsProxy, value: any) => void
    );
}

export interface ObsPersistState {
    isLoadedLocal: boolean;
    isLoadedRemote: boolean;
}
