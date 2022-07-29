import { symbolEqualityFn, symbolShallow } from './globals';

export type ObservableEventType = 'change' | 'changeShallow' | 'equals' | 'hasValue' | 'true';

export type ObservableFnName = 'get' | 'set' | 'assign' | 'on' | 'prop' | 'delete';

export interface ObservableBaseProps<T> {
    get(): T;
    prop<K extends keyof T>(prop: K): Observable<T[K]>;
    on(eventType: 'change', cb: ListenerFn<T>): ObservableListener<T>;
    on(eventType: 'changeShallow', cb: ListenerFn<T>): ObservableListener<T>;
    on(
        eventType: 'equals',
        value: T,
        cb?: (value?: T) => void
    ): { listener: ObservableListener<T>; promise: Promise<T> };
    on(eventType: 'hasValue', cb?: (value?: T) => void): { listener: ObservableListener<T>; promise: Promise<T> };
    on(eventType: 'true', cb?: (value?: T) => void): { listener: ObservableListener<T>; promise: Promise<T> };
    on(
        eventType: ObservableEventType,
        cb?: (value?: T) => void
    ): ObservableListener<T> | { listener: ObservableListener<T>; promise: Promise<T> };
}

export interface ObservableProps<T> extends ObservableBaseProps<T> {
    set(value: ValidObservableParam<T>): Observable<T>;
    set<K extends keyof T>(key: K | string | number, value: ValidObservableParam<T[K]>): Observable<T[K]>;
    assign(value: ValidObservableParam<T> | Partial<ValidObservableParam<T>>): Observable<T>;
    delete(): Observable<T>;
    delete<K extends keyof T>(key: K | string | number): Observable<T>;
}

export interface ObservableBaseProps2<T> {
    _get(): T;
    _prop<K extends keyof T>(prop: K): Observable2<T[K]>;
    _on(eventType: 'change', cb: ListenerFn<T>): ObservableListener<T>;
    _on(eventType: 'changeShallow', cb: ListenerFn<T>): ObservableListener<T>;
    _on(
        eventType: 'equals',
        value: T,
        cb?: (value?: T) => void
    ): { listener: ObservableListener<T>; promise: Promise<T> };
    _on(eventType: 'hasValue', cb?: (value?: T) => void): { listener: ObservableListener<T>; promise: Promise<T> };
    _on(eventType: 'true', cb?: (value?: T) => void): { listener: ObservableListener<T>; promise: Promise<T> };
    _on(
        eventType: ObservableEventType,
        cb?: (value?: T) => void
    ): ObservableListener<T> | { listener: ObservableListener<T>; promise: Promise<T> };
    _on<K extends keyof T>(key: K, eventType: 'change', cb: ListenerFn<T>): ObservableListener<T>;
    _on<K extends keyof T>(key: K, eventType: 'changeShallow', cb: ListenerFn<T>): ObservableListener<T>;
    _on(
        eventType: 'equals',
        value: T,
        cb?: (value?: T) => void
    ): { listener: ObservableListener<T>; promise: Promise<T> };
    _on<K extends keyof T>(
        key: K,
        eventType: 'hasValue',
        cb?: (value?: T) => void
    ): { listener: ObservableListener<T>; promise: Promise<T> };
    _on<K extends keyof T>(
        key: K,
        eventType: 'true',
        cb?: (value?: T) => void
    ): { listener: ObservableListener<T>; promise: Promise<T> };
    _on<K extends keyof T>(
        key: K,
        eventType: ObservableEventType,
        cb?: (value?: T) => void
    ): ObservableListener<T> | { listener: ObservableListener<T>; promise: Promise<T> };
}
export interface ObservableProps2<T> extends ObservableBaseProps2<T> {
    _set(value: ValidObservableParam2<T>): Observable2<T>;
    _set<K extends keyof T>(key: K | string | number, value: ValidObservableParam2<T[K]>): Observable2<T[K]>;
    _assign(value: ValidObservableParam2<T> | Partial<ValidObservableParam2<T>>): Observable2<T>;
    _delete(): Observable2<T>;
    _delete<K extends keyof T>(key: K | string | number): Observable2<T>;
}
export type ObservablePropsUnsafe<T> = Partial<ObservableProps<T>>;

export interface ObservableListener<T = any> {
    target: Observable<T>;
    callback: ListenerFn<T>;
    shallow: boolean;
    dispose: () => void;
    isDisposed: boolean;
}

export interface ObservableListenerInfo {
    changedValue: any;
    prevValue: any;
    path: string[];
}

export interface ObservableListenerInfo2 {
    value: any;
    prevValue: any;
    path: string[];
}

export type ListenerFn<T> = (value: T, info: ObservableListenerInfo) => void;
export type ListenerFn2<T> = (value: T, info: ObservableListenerInfo2) => void;
export type ListenerFn3<T> = (value: T, info: ObservableListenerInfo2) => void;

type Recurse<T, K extends keyof T, TRecurse> = T[K] extends
    | Function
    | Map<any, any>
    | WeakMap<any, any>
    | Set<any>
    | WeakSet<any>
    | Promise<any>
    ? T[K]
    : T[K] extends Array<any>
    ? T[K] &
          ObservableProps<T[K]> & {
              [n: number]: TRecurse extends Observable ? Observable<T[K][number]> : ObservableUnsafe<T[K][number]>;
          }
    : T extends object
    ? TRecurse
    : T[K];

type Recurse2<T, K extends keyof T, TRecurse> = T[K] extends
    | Function
    | Map<any, any>
    | WeakMap<any, any>
    | Set<any>
    | WeakSet<any>
    | Promise<any>
    | number
    | boolean
    | string
    ? T[K]
    : T[K] extends Array<any>
    ? T[K] &
          ObservableProps2<T[K]> & {
              [n: number]: TRecurse extends Observable ? Observable<T[K][number]> : ObservableUnsafe<T[K][number]>;
          }
    : T extends object
    ? TRecurse
    : T[K];

type ObservablePropsRecursiveUnsafe<T> = {
    [K in keyof T]: Recurse<T, K, ObservableUnsafe<T[K]>>;
};

type ObservablePropsRecursive<T> = {
    readonly [K in keyof T]: Recurse<T, K, Observable<T[K]>>;
};
type ObservablePropsRecursive2<T> = {
    readonly [K in keyof T]: Recurse2<T, K, Observable2<T[K]>>;
};

export type ObservableUnsafe<T = any> = ObservablePropsRecursiveUnsafe<T> & ObservablePropsUnsafe<T>;
export type Observable<T = any> = ObservablePropsRecursive<T> & ObservableProps<T>;
export type ObservableComputed<T = any> = ObservableBaseProps<T>;

export type Observable2<T = any> = ObservablePropsRecursive2<T> & ObservableProps2<T>;

export interface ObservableEvent {
    fire(): void;
    on(cb?: () => void): ObservableListener<void>;
    on(eventType: 'change', cb?: () => void): ObservableListener<void>;
}

export type ObservableValue<T extends Observable | ObservableUnsafe | ObservableEvent | ObservableComputed> =
    T extends ObservableEvent ? void : T extends ObservableComputed<infer t> ? t : T;

export type MappedObservableValue<
    T extends ObservableCheckerLoose | ObservableCheckerLoose[] | Record<string, ObservableCheckerLoose>
> = T extends ObservableCheckerStrict
    ? ObservableValue<T>
    : T extends object | Array<any>
    ? {
          [K in keyof T]: ObservableValue<T[K]>;
      }
    : ObservableValue<T>;

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
    persistLocal?: ClassConstructor<ObservablePersistLocal>;
    persistRemote?: ClassConstructor<ObservablePersistRemote>;
    dateModifiedKey?: string;
}

export interface ObservablePersistLocal {
    get<T = any>(path: string): T;
    set(path: string, value: any): Promise<void>;
    delete(path: string): Promise<void>;
    load?(path: string): Promise<void>;
}
export interface ObservablePersistLocalAsync extends ObservablePersistLocal {
    preload(path: string): Promise<void>;
}
export interface ObservablePersistRemote {
    save<T>(options: PersistOptions<T>, value: T, info: ObservableListenerInfo): Promise<T>;
    listen<T>(
        obs: ObservableChecker<T>,
        options: PersistOptions<T>,
        onLoad: () => void,
        onChange: (obs: Observable<T>, value: any) => void
    );
}

export interface ObservablePersistState {
    isLoadedLocal: boolean;
    isLoadedRemote: boolean;
    clearLocal: () => Promise<void>;
}
export type ObservableCheckerLoose<T = any> =
    | Observable<T>
    | ObservableComputed<T>
    | ObservableEvent
    | ObservableUnsafe<T>;
export type ObservableCheckerStrict<T = any> = Observable<T> | ObservableComputed<T>;
export type ObservableChecker<T = any> = Observable<T> | ObservableComputed<T> | ObservableUnsafe<T>;
export type ObservableCheckerWriteable<T = any> = Observable<T> | ObservableUnsafe<T>;

export type RecordValue<T> = T extends Record<string, infer t> ? t : never;
export type ArrayValue<T> = T extends Array<infer t> ? t : never;

// This converts the state object's shape to the field transformer's shape
// TODO: FieldTransformer and this shape can likely be refactored to be simpler
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
export type ValidObservableParam2<T> = T extends Record<string, any>
    ? T extends Map<any, any> | WeakMap<any, any> | Set<any> | WeakSet<any>
        ? T
        : T extends Observable2
        ? never
        : { [K in keyof T]: ValidObservableParam2<T[K]> }
    : T;
export interface OnReturnValue<T> {
    promise: Promise<T>;
    listener: ObservableListener<T>;
}

export type ClassConstructor<I, Args extends any[] = any[]> = new (...args: Args) => I;
export type Shallow<T = any> = { [symbolShallow]: Observable2<T> };
export type EqualityFn<T = any> = { [symbolEqualityFn]: { obs: Observable2<T>; fn: (value: any) => any } };
