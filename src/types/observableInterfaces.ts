export type ObservableEventType = 'change' | 'changeShallow' | 'equals' | 'hasValue' | 'true';

export type ObservableFnName = 'get' | 'set' | 'assign' | 'on' | 'prop' | 'delete';

export interface ObsProps<T> {
    get(): T;
    set(value: ValidObservableParam<T>): Observable<T>;
    set<K extends keyof T>(key: K | string | number, value: ValidObservableParam<T[K]>): Observable<T[K]>;
    assign(value: ValidObservableParam<T> | Partial<ValidObservableParam<T>>): Observable<T>;
    prop<K extends keyof T>(prop: K): Observable<T[K]>;
    delete(): Observable<T>;
    delete<K extends keyof T>(key: K | string | number): Observable<T>;
    on(eventType: 'change', cb: ListenerFn<T>): ObsListener<T>;
    on(eventType: 'changeShallow', cb: ListenerFn<T>): ObsListener<T>;
    on(eventType: 'equals', value: T, cb?: (value?: T) => void): { listener: ObsListener<T>; promise: Promise<T> };
    on(eventType: 'hasValue', cb?: (value?: T) => void): { listener: ObsListener<T>; promise: Promise<T> };
    on(eventType: 'true', cb?: (value?: T) => void): { listener: ObsListener<T>; promise: Promise<T> };
    on(
        eventType: ObservableEventType,
        cb?: (value?: T) => void
    ): ObsListener<T> | { listener: ObsListener<T>; promise: Promise<T> };
}
export type ObsPropsUnsafe<T> = Partial<ObsProps<T>>;

export interface ObsListener<T = any> {
    target: Observable<T>;
    callback: ListenerFn<T>;
    shallow: boolean;
}

export interface ObsListenerInfo {
    changedValue: any;
    prevValue: any;
    path: string[];
}

export type ListenerFn<T> = (value: T, info: ObsListenerInfo) => void;

type Recurse<T, K extends keyof T, TRecurse> = T[K] extends
    | Function
    | Map<any, any>
    | WeakMap<any, any>
    | Set<any>
    | WeakSet<any>
    | Promise<any>
    ? T[K]
    : T[K] extends Array<any>
    ? T[K] & { [n: number]: TRecurse extends Observable ? Observable<T[K][number]> : ObservableUnsafe<T[K][number]> }
    : T extends object
    ? TRecurse
    : T[K];

type ObsPropsRecursiveUnsafe<T> = {
    [K in keyof T]: Recurse<T, K, ObservableUnsafe<T[K]>>;
};

type ObsPropsRecursive<T> = {
    readonly [K in keyof T]: Recurse<T, K, Observable<T[K]>>;
};

export type ObservableUnsafe<T = any> = ObsPropsRecursiveUnsafe<T> & ObsPropsUnsafe<T>;
export type Observable<T = any> = ObsPropsRecursive<T> & ObsProps<T>;
export type ObservableComputed<T = any> = Omit<Observable<T>, 'set' | 'assign' | 'delete'>;

export interface ObservableEvent {
    fire(): void;
    on(cb?: () => void): ObsListener<void>;
    on(eventType: 'change', cb?: () => void): ObsListener<void>;
}

export type ObservableValue<T extends Observable | ObservableUnsafe | ObservableEvent> = T extends Observable<infer t>
    ? t
    : T extends ObservableEvent
    ? void
    : T extends ObservableUnsafe<infer t>
    ? t
    : T;

export type MappedObservableValue<
    T extends (ObservableChecker | ObservableEvent)[] | Record<string, ObservableChecker | ObservableEvent>
> = {
    [K in keyof T]: ObservableValue<T[K]>;
};

export type QueryByModified<T> =
    | boolean
    | '*'
    | { '*': '*' | true }
    | {
          [K in keyof T]?: QueryByModified<T[K]>;
      };

export interface PersistOptionsRemote<T = any> {
    readonly?: boolean;
    once?: boolean;
    requireAuth?: boolean;
    saveTimeout?: number;
    adjustData?: {
        load: (value: any, basePath: string) => Promise<any>;
        save: (value: any, basePath: string, path: string[]) => Promise<any>;
    };
    firebase?: {
        syncPath: (uid: string) => `/${string}/`;
        fieldTransforms?: SameShapeWithStrings<T>;
        queryByModified?: QueryByModified<T>;
        ignoreKeys?: Record<string, true>;
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
        obs: ObservableChecker<T>,
        options: PersistOptions<T>,
        onLoad: () => void,
        onChange: (obs: Observable<T>, value: any) => void
    );
}

export interface ObsPersistState {
    isLoadedLocal: boolean;
    isLoadedRemote: boolean;
    clearLocal: () => Promise<void>;
}
export type ObservableChecker<T = any> = Observable<T> | ObservableUnsafe<T>;

export type RecordValue<T> = T extends Record<string, infer t> ? t : never;
export type ArrayValue<T> = T extends Array<infer t> ? t : never;

type SameShapeWithStringsRecord<T> = {
    [K in keyof Omit<T, '_id' | 'id'>]-?: T[K] extends Record<string, Record<string, any>>
        ?
              | {
                    _: string;
                    __obj: SameShapeWithStrings<RecordValue<T[K]>> | SameShapeWithStrings<T[K]>;
                }
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

type DisallowedAttributes<T extends string> = Partial<Record<T, void>>;

export type ValidObservableParam<T> = T extends Record<string, any>
    ? T extends Map<any, any> | WeakMap<any, any> | Set<any> | WeakSet<any>
        ? T
        : T extends Observable
        ? never
        : { [K in keyof T]: ValidObservableParam<T[K]> } & DisallowedAttributes<ObservableFnName>
    : T;
export interface OnReturnValue<T> {
    promise: Promise<T>;
    listener: ObsListener<T>;
}
