import { symbolEqualityFn, symbolProp, symbolShallow } from './globals';

export type ObservableEventType = 'change' | 'changeShallow' | 'equals' | 'hasValue' | 'true';

export interface ObservableBaseFns<T> {
    onChange(cb: ListenerFn<T>): ObservableListener<T>;
    onChange<K extends keyof T>(key: K, cb: ListenerFn<T>): ObservableListener<T>;
    onChangeShallow(cb: ListenerFn<T>): ObservableListener<T>;
    onChangeShallow<K extends keyof T>(key: K, cb: ListenerFn<T>): ObservableListener<T>;
    onEquals(value: T, cb?: (value?: T) => void): OnReturnValue<T>;
    onEquals<K extends keyof T>(key: K, value: T[K], cb?: (value?: T) => void): OnReturnValue<T>;
    onTrue(cb?: (value?: T) => void): OnReturnValue<T>;
    onTrue<K extends keyof T>(key: K, cb?: (value?: T) => void): OnReturnValue<T>;
    onHasValue(cb?: (value?: T) => void): OnReturnValue<T>;
    onHasValue<K extends keyof T>(key: K, cb?: (value?: T) => void): OnReturnValue<T>;
}
export interface ObservableFns<T> extends ObservableBaseFns<T> {
    prop<K extends keyof T>(prop: K): Observable<T[K]>;
    set(value: T): Observable<T>;
    set<K extends keyof T>(key: K | string | number, value: T[K]): Observable<T[K]>;
    assign(value: T | Partial<T>): Observable<T>;
    delete(): Observable<T>;
    delete<K extends keyof T>(key: K | string | number): Observable<T>;
}
export interface ObservableComputedFns<T> {
    onChange(cb: ListenerFn<T>): ObservableListener<T>;
    onEquals(value: T, cb?: (value?: T) => void): { listener: ObservableListener<T>; promise: Promise<T> };
    onTrue(cb?: (value?: T) => void): { listener: ObservableListener<T>; promise: Promise<T> };
    onHasValue(cb?: (value?: T) => void): { listener: ObservableListener<T>; promise: Promise<T> };
}
export interface ObservableBaseProps<T> {
    _: ObservableBaseFns<T>;
}
export interface ObservableProps<T> {
    _: ObservableFns<T>;
}
export interface ObservableComputedProps<T> {
    _: ObservableComputedFns<T>;
}

export interface ObservableListenerInfo {
    value: any;
    prevValue: any;
    path: string[];
}

export type ListenerFn<T> = (value: T, info: ObservableListenerInfo) => void;

type Recurse<T, K extends keyof T, TRecurse> = T[K] extends
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
          ObservableProps<T[K]> & {
              [n: number]: Observable<T[K][number]>;
          }
    : T extends object
    ? TRecurse
    : T[K];

type ObservablePropsRecursive2<T> = {
    readonly [K in keyof T]: Recurse<T, K, Observable<T[K]>>;
};

export type Observable<T = any> = ObservablePropsRecursive2<T> & ObservableProps<T>;

export interface ObservableEvent {
    fire(): void;
    on(cb?: () => void): ObservableListener<void>;
    on(eventType: 'change', cb?: () => void): ObservableListener<void>;
}
export interface ObservableEvent3 {
    fire(): void;
    on(cb?: () => void): ObservableListener<void>;
}

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

export interface OnReturnValue<T> {
    promise: Promise<T>;
    listener: ObservableListener<T>;
}

export type ClassConstructor<I, Args extends any[] = any[]> = new (...args: Args) => I;
export type Shallow<T = any> = { [symbolShallow]: Observable<T> };
export type Prop<T = any> = { [symbolProp]: Observable<T> } & ObservableProps<T>;
export type EqualityFn<T = any> = { [symbolEqualityFn]: { obs: Observable<T>; fn: (value: any) => any } };

export interface ObservableListener<T = any> {
    node: PathNode;
    // path: string[];
    // path: string;
    callback: ListenerFn<T>;
    shallow: boolean;
    dispose: () => void;
    isDisposed?: boolean;
}
export interface ObservableWrapper<T = any> {
    _: Observable;
    pathNodes: Map<string, PathNode>;
}

export interface PathNode {
    root: ObservableWrapper;
    path: string;
    parent: string;
    key: string;
    listeners?: Set<ObservableListener>;
}
export type ObservableChecker<T = any> = Shallow | EqualityFn | Observable | Prop;
export type ObservableComputed<T = any> = { readonly current: T } & ObservableComputedProps<{ readonly current: T }>;
export type ObservablePrimitive<T = any> = { readonly current: T } & ObservableProps<T>;
