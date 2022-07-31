import { symbolEqualityFn, symbolProp, symbolShallow } from './globals';

export type ObservableEventType = 'change' | 'changeShallow' | 'equals' | 'hasValue' | 'true';

export interface ObservableBaseFns<T> {
    onChange(cb: ListenerFn3<T>): ObservableListener3<T>;
    onChange<K extends keyof T>(key: K, cb: ListenerFn3<T>): ObservableListener3<T>;
    onChangeShallow(cb: ListenerFn3<T>): ObservableListener3<T>;
    onChangeShallow<K extends keyof T>(key: K, cb: ListenerFn3<T>): ObservableListener3<T>;
    onEquals(value: T, cb?: (value?: T) => void): OnReturnValue3<T>;
    onEquals<K extends keyof T>(key: K, value: T[K], cb?: (value?: T) => void): OnReturnValue3<T>;
    onTrue(cb?: (value?: T) => void): OnReturnValue3<T>;
    onTrue<K extends keyof T>(key: K, cb?: (value?: T) => void): OnReturnValue3<T>;
    onHasValue(cb?: (value?: T) => void): OnReturnValue3<T>;
    onHasValue<K extends keyof T>(key: K, cb?: (value?: T) => void): OnReturnValue3<T>;
}
export interface ObservableFns<T> extends ObservableBaseFns<T> {
    prop<K extends keyof T>(prop: K): Observable2<T[K]>;
    set(value: T): Observable2<T>;
    set<K extends keyof T>(key: K | string | number, value: T[K]): Observable2<T[K]>;
    assign(value: T | Partial<T>): Observable2<T>;
    delete(): Observable2<T>;
    delete<K extends keyof T>(key: K | string | number): Observable2<T>;
}
export interface ObservableComputedFns<T> {
    onChange(cb: ListenerFn3<T>): ObservableListener3<T>;
    onEquals(value: T, cb?: (value?: T) => void): { listener: ObservableListener3<T>; promise: Promise<T> };
    onTrue(cb?: (value?: T) => void): { listener: ObservableListener3<T>; promise: Promise<T> };
    onHasValue(cb?: (value?: T) => void): { listener: ObservableListener3<T>; promise: Promise<T> };
}
export interface ObservableBaseProps2<T> {
    _: ObservableBaseFns<T>;
}
export interface ObservableProps2<T> {
    _: ObservableFns<T>;
}
export interface ObservableComputedProps2<T> {
    _: ObservableComputedFns<T>;
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

export type ListenerFn3<T> = (value: T, info: ObservableListenerInfo2) => void;

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
              [n: number]: Observable2<T[K][number]>;
          }
    : T extends object
    ? TRecurse
    : T[K];

type ObservablePropsRecursive2<T> = {
    readonly [K in keyof T]: Recurse2<T, K, Observable2<T[K]>>;
};

export type Observable2<T = any> = ObservablePropsRecursive2<T> & ObservableProps2<T>;

export interface ObservableEvent {
    fire(): void;
    on(cb?: () => void): ObservableListener3<void>;
    on(eventType: 'change', cb?: () => void): ObservableListener3<void>;
}
export interface ObservableEvent3 {
    fire(): void;
    on(cb?: () => void): ObservableListener3<void>;
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
    save<T>(options: PersistOptions<T>, value: T, info: ObservableListenerInfo2): Promise<T>;
    listen<T>(
        obs: ObservableChecker3<T>,
        options: PersistOptions<T>,
        onLoad: () => void,
        onChange: (obs: Observable2<T>, value: any) => void
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

export interface OnReturnValue3<T> {
    promise: Promise<T>;
    listener: ObservableListener3<T>;
}

export type ClassConstructor<I, Args extends any[] = any[]> = new (...args: Args) => I;
export type Shallow<T = any> = { [symbolShallow]: Observable2<T> };
export type Prop<T = any> = { [symbolProp]: Observable2<T> } & ObservableProps2<T>;
export type EqualityFn<T = any> = { [symbolEqualityFn]: { obs: Observable2<T>; fn: (value: any) => any } };

export interface ObservableListener3<T = any> {
    node: PathNode;
    // path: string[];
    // path: string;
    callback: ListenerFn3<T>;
    shallow: boolean;
    dispose: () => void;
    isDisposed?: boolean;
}
export interface ObservableWrapper<T = any> {
    _: Observable2;
    pathNodes: Map<string, PathNode>;
}

export interface PathNode {
    root: ObservableWrapper;
    path: string;
    parent: string;
    key: string;
    listeners?: Set<ObservableListener3>;
}
export type ObservableChecker3<T = any> = Shallow | EqualityFn | Observable2 | Prop;
export type ObservableComputed3<T = any> = { readonly current: T } & ObservableComputedProps2<{ readonly current: T }>;
