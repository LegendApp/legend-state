import type { ObservablePrimitive } from './ObservablePrimitive';

export type ObservableEventType = 'change' | 'changeShallow' | 'equals' | 'hasValue' | 'true';

export interface ObservableBaseFns<T> {
    get?(track?: boolean | Symbol): T;
    obs?(track?: boolean | Symbol): ObservableRef<T>;
    onChange?(cb: ListenerFn<T>, track?: boolean | Symbol): ObservableListenerDispose;
}
export interface ObservablePrimitiveFns<T> extends ObservableBaseFns<T> {
    set?(value: T | ((prev: T) => T)): ObservableChild<T>;
}
export interface ObservableObjectFns<T> extends ObservablePrimitiveFns<T> {
    get?(track?: boolean | Symbol): T;
    get?<K extends keyof T>(key: K, track?: boolean | Symbol): T[K];
    obs?(track?: boolean | Symbol): ObservableRef<T>;
    obs?<K extends keyof T>(prop: K, track?: boolean | Symbol): ObservableRef<T[K]>;
    set?(value: T | ((prev: T) => T)): ObservableChild<T>;
    set?<K extends keyof T>(key: K, prev: T[K] | ((prev: T[K]) => T[K])): ObservableChild<T[K]>;
    set?<V>(key: string | number, value: V): ObservableChild<V>;
    assign?(value: T | Partial<T>): ObservableChild<T>;
    delete?(): ObservableChild<T>;
    delete?<K extends keyof T>(key: K | string | number): ObservableChild<T>;
}
export type ObservableFns<T> = ObservablePrimitiveFns<T> | ObservableObjectFns<T>;
export interface ObservableComputedFns<T> {
    get(track?: boolean | Symbol): T;
    onChange(cb: ListenerFn<T>, track?: boolean | Symbol): ObservableListenerDispose;
}
type ArrayOverrideFnNames = 'every' | 'some' | 'filter' | 'reduce' | 'reduceRight' | 'forEach' | 'map';
export interface ObservableArrayOverride<T> extends Omit<Array<T>, 'forEach' | 'map'> {
    /**
     * Performs the specified action for each element in an array.
     * @param callbackfn  A function that accepts up to three arguments. forEach calls the callbackfn function one time for each element in the array.
     * @param thisArg  An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
     */
    forEach(callbackfn: (value: T, index: number, array: T[]) => void, thisArg?: any): void;
    /**
     * Calls a defined callback function on each element of an array, and returns an array that contains the results.
     * @param callbackfn A function that accepts up to three arguments. The map method calls the callbackfn function one time for each element in the array.
     * @param thisArg An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
     */
    map<U>(callbackfn: (value: T, index: number, array: T[]) => U, thisArg?: any): U[];
}

export type ListenerFn<T = any> = (
    value?: T,
    getPrevious?: () => T,
    path?: (string | number)[],
    valueAtPath?: any,
    prevAtPath?: any,
    node?: NodeValue
) => void;

type PrimitiveKeys<T> = Pick<T, { [K in keyof T]-?: T[K] extends Primitive ? K : never }[keyof T]>;
type NonPrimitiveKeys<T> = Pick<T, { [K in keyof T]-?: T[K] extends Primitive ? never : K }[keyof T]>;

type Recurse<T, K extends keyof T, TRecurse> = T[K] extends
    | Function
    | Map<any, any>
    | WeakMap<any, any>
    | Set<any>
    | WeakSet<any>
    | Promise<any>
    ? T[K]
    : T[K] extends Primitive
    ? T[K] & ObservablePrimitiveFns<T[K]>
    : T[K] extends Array<any>
    ? Omit<T[K], ArrayOverrideFnNames> &
          ObservableObjectFns<T[K]> &
          ObservableArrayOverride<ObservableObject<T[K][number]>>
    : T extends object
    ? TRecurse
    : T[K];

type ObservableFnsRecursive<T> = {
    [K in keyof T]: Recurse<T, K, ObservableObject<T[K]>>;
};
type ObservableComputedFnsRecursive<T> = {
    [K in keyof T]: Recurse<T, K, ObservableComputedFns<T[K]>>;
};
type ObservableFnsRecursiveSafe<T> = {
    readonly [K in keyof T]: Recurse<T, K, ObservableObjectSafe<T[K]>>;
};
type ObservableFnsRecursiveDefaultObject<T> = {
    readonly [K in keyof T]: Recurse<T, K, ObservableObjectDefault<T[K]>>;
};
type ObservableFnsRecursiveDefault<T> = ObservableFnsRecursiveDefaultObject<NonPrimitiveKeys<T>> &
    ObservableFnsRecursive<PrimitiveKeys<T>>;

export interface ObservableEvent {
    dispatch(): void;
    on(cb?: () => void): ObservableListenerDispose;
    on(eventType: 'change', cb?: () => void): ObservableListenerDispose;
    get(): void;
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
    save<T>(
        options: PersistOptions<T>,
        value: T,
        getPrevious: () => T,
        path: (string | number)[],
        valueAtPath: any,
        prevAtPath: any
    ): Promise<T>;
    listen<T>(
        obs: ObservableReadable<T>,
        options: PersistOptions<T>,
        onLoad: () => void,
        onChange: (obs: ObservableReadable<T>, value: any) => void
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
    dispose: ObservableListenerDispose;
}

export type ClassConstructor<I, Args extends any[] = any[]> = new (...args: Args) => I;
export type ObservableListenerDispose = () => void;

export interface ObservableWrapper {
    _: any;
    safeMode: 0 | 1 | 2;
    locked?: boolean;
}

export type Primitive = boolean | string | number | Date;
export type NotPrimitive<T> = T extends Primitive ? never : T;

export type ObservableArray<T extends any[]> = Omit<T, ArrayOverrideFnNames> &
    ObservableObjectFns<T> &
    ObservableArrayOverride<ObservableObject<T[number]>>;
export type ObservableArraySafe<T extends any[]> = Omit<T, ArrayOverrideFnNames> &
    ObservableObjectFns<T> &
    ObservableArrayOverride<ObservableObjectSafe<T[number]>>;
export type ObservableArrayDefault<T extends any[]> = Omit<T, ArrayOverrideFnNames> &
    ObservableObjectFns<T> &
    ObservableArrayOverride<ObservableObjectDefault<T[number]>>;
export type ObservableObject<T = any> = ObservableFnsRecursive<T> & ObservableObjectFns<T>;
export type ObservableObjectSafe<T = any> = ObservableFnsRecursiveSafe<T> & ObservableObjectFns<T>;
export type ObservableObjectDefault<T = any> = ObservableFnsRecursiveDefault<T> & ObservableObjectFns<T>;
export type ObservableChild<T = any> = [T] extends [Primitive] ? T & ObservablePrimitiveFns<T> : ObservableObject<T>;
export type ObservableRef<T = any> = [T] extends [Primitive] ? ObservablePrimitiveFns<T> : ObservableObject<T>;
export type ObservablePrimitiveChild<T = any> = { value: T } & ObservablePrimitiveFns<T>;

export type ObservableObjectOrArray<T> = T extends any[] ? ObservableArray<T> : ObservableObject<T>;
export type ObservableObjectOrArraySafe<T> = T extends any[] ? ObservableArraySafe<T> : ObservableObjectSafe<T>;
export type ObservableObjectOrArrayDefault<T> = T extends any[]
    ? ObservableArrayDefault<T>
    : ObservableObjectDefault<T>;

export type ObservableComputed<T = any> = ObservableComputedFns<T> &
    ObservableComputedFnsRecursive<T> &
    ([T] extends [Primitive] ? { readonly value: T } : T);
export declare type Observable<T = any> = [T] extends [object]
    ? ObservableObject<T>
    : T extends boolean
    ? ObservablePrimitive<boolean>
    : T extends number
    ? ObservablePrimitive<number>
    : T extends string
    ? ObservablePrimitive<string>
    : ObservablePrimitive<T>;

export type ObservableReadable<T = any> =
    | ObservableObject<T>
    | ObservableComputed<T>
    | ObservablePrimitiveChild<T>
    | ObservableRef<T>;

export interface ListenerInfo {
    track: boolean | Symbol;
    noArgs?: boolean;
    listener: ListenerFn;
}

export interface NodeValue {
    id: number;
    parent?: NodeValue;
    children?: Map<string | number, NodeValue>;
    proxy?: object;
    key?: string | number;
    root: ObservableWrapper;
    listeners?: Set<ListenerInfo>;
}

/** @internal */
export interface TrackingNode {
    node: NodeValue;
    track?: boolean | Symbol;
    num?: number;
}
