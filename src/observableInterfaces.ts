export type TrackingType = boolean | 'optimize'; // true === shallow

export interface ObservableBaseFns<T> {
    peek?(): T;
    get?(track?: TrackingType): T;
    onChange?(cb: ListenerFn<T>, track?: TrackingType): ObservableListenerDispose;
}
export interface ObservablePrimitiveFns<T> extends ObservableBaseFns<T> {
    set?(value: T | ((prev: T) => T)): ObservableChild<T>;
}
export interface ObservablePrimitiveChildFns<T> extends ObservablePrimitiveFns<T> {
    delete?(): ObservableChild<T>;
}
export interface ObservableObjectFns<T> extends ObservablePrimitiveFns<T> {
    set?(value: T | ((prev: T) => T)): ObservableChild<T>;
    assign?(value: T | Partial<T>): ObservableChild<T>;
    delete?(): ObservableChild<T>;
}
export type ObservableFns<T> = ObservablePrimitiveFns<T> | ObservableObjectFns<T>;

export interface ObservablePrimitive<T> extends Required<ObservablePrimitiveFns<T>> {
    value: T;
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
    value: T,
    getPrevious: () => T,
    path: (string | number)[],
    valueAtPath: any,
    prevAtPath: any,
    node: NodeValue
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
    ? ObservablePrimitiveChild<T[K]>
    : T[K] extends Array<any>
    ? Omit<T[K], ArrayOverrideFnNames> &
          ObservableObjectFns<T[K]> &
          ObservableArrayOverride<ObservableObject<T[K][number]>>
    : T extends object
    ? TRecurse
    : T[K];

type ObservableFnsRecursiveUnsafe<T> = {
    [K in keyof T]: Recurse<T, K, ObservableObject<T[K]>>;
};
type ObservableFnsRecursiveSafe<T> = {
    readonly [K in keyof T]: Recurse<T, K, ObservableObject<T[K]>>;
};
type ObservableFnsRecursive<T> = ObservableFnsRecursiveSafe<NonPrimitiveKeys<T>> &
    ObservableFnsRecursiveUnsafe<PrimitiveKeys<T>>;

type ObservableComputedFnsRecursive<T> = {
    readonly [K in keyof T]: Recurse<T, K, ObservableBaseFns<T[K]>>;
};

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
    manual?: boolean;
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
    sync: () => Promise<boolean>;
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

export type Selector<T> = ObservableReadable<T> | (() => T);

export type ClassConstructor<I, Args extends any[] = any[]> = new (...args: Args) => I;
export type ObservableListenerDispose = () => void;

export interface ObservableWrapper {
    _: any;
    locked?: boolean;
    activate?: () => void;
}

export type Primitive = boolean | string | number | Date;
export type NotPrimitive<T> = T extends Primitive ? never : T;

export type ObservableArray<T extends any[]> = Omit<T, ArrayOverrideFnNames> &
    ObservableObjectFns<T> &
    ObservableArrayOverride<ObservableObject<T[number]>>;
export type ObservableObject<T = any> = ObservableFnsRecursive<T> & ObservableObjectFns<T>;
export type ObservableChild<T = any> = [T] extends [Primitive] ? ObservablePrimitiveChildFns<T> : ObservableObject<T>;
export type ObservableRef<T = any> = [T] extends [Primitive] ? ObservablePrimitiveFns<T> : ObservableObject<T>;
export type ObservablePrimitiveChild<T = any> = ObservablePrimitive<T> & ObservablePrimitiveChildFns<T>;

export type ObservableObjectOrArray<T> = T extends any[] ? ObservableArray<T> : ObservableObject<T>;

export type ObservableComputed<T = any> = ObservableBaseFns<T> &
    ObservableComputedFnsRecursive<T> &
    ([T] extends [Primitive] ? { readonly value: T } : T);
export declare type Observable<T = any> = [T] extends [object] ? ObservableObjectOrArray<T> : ObservablePrimitive<T>;

export type ObservableReadable<T = any> =
    | ObservableObject<T>
    | ObservableComputed<T>
    | ObservablePrimitiveChild<T>
    | ObservableRef<T>;
export type ObservableWriteable<T = any> = ObservableObject<T> | ObservablePrimitiveChild<T> | ObservableRef<T>;

export interface NodeValue {
    id: number;
    parent?: NodeValue;
    children?: Map<string | number, NodeValue>;
    proxy?: object;
    key?: string | number;
    isActivatedPrimitive?: boolean;
    root: ObservableWrapper;
    listeners?: Set<{ track: TrackingType; noArgs?: boolean; listener: ListenerFn }>;
}

/** @internal */
export interface TrackingNode {
    node: NodeValue;
    track?: TrackingType;
    num?: number;
}
