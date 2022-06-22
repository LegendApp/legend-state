export interface ObsProps<T> {
    value?: T;
    set?: (value: T) => ObsProxy<T>;
}

export interface ObsListener<T = any> {
    target: ObsProxy<T>;
    callback: ListenerFn<T>;
    /** @internal */
    _disposed: boolean;
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

export type ProxyValue<T extends ObsProxy<any>> = T extends ObsProxy<infer t> ? t : T;

export type MappedProxyValue<T> = {
    [K in keyof T]: ProxyValue<T[K]>;
};

export type ObsProxy<T = object> = T & ObsProps<T> & ObsPropsRecursive<T>;

export interface PersistOptions<T = any> {
    local?: string;
    remote?: {
        readonly?: boolean;
        once?: boolean;
        requireAuth?: boolean;
        firebase?: {
            syncPath: (uid: string) => string;
            fieldTransforms?: any; // SameShapeWithStrings<T>;
            spreadPaths?: Exclude<keyof T, '_id' | 'id'>[];
        };
    };
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
    save<T>(value: T, info: ObsListenerInfo): Promise<T>;
    setValue<T extends object>(value: T, options: PersistOptions['remote'], extra?: any): Promise<T>;
    listen(options: PersistOptions['remote'], dateModified: number, onLoad: () => void, onChange: (value: any) => void);
}
