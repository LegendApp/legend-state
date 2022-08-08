import { symbolShallow } from './globals';

export type ObservableEventType = 'change' | 'changeShallow' | 'equals' | 'hasValue' | 'true';

export interface ObservableBaseFns<T> {
    get(): T;
    onChange(cb: ListenerFn<T>): ObservableListenerDispose;
    onChangeShallow(cb: ListenerFn<T>): ObservableListenerDispose;
    onEquals(value: T, cb?: (value?: T) => void): OnReturnValue<T>;
    onTrue(cb?: (value?: T) => void): OnReturnValue<T>;
    onHasValue(cb?: (value?: T) => void): OnReturnValue<T>;
}
export interface ObservablePrimitiveFns<T> extends ObservableBaseFns<T> {
    set(value: T): Observable<T>;
}
export interface ObservableFns<T> extends ObservablePrimitiveFns<T> {
    prop<K extends keyof T>(prop: K): Observable<T[K]>;
    set(value: T): Observable<T>;
    set<K extends keyof T>(key: K, value: T[K]): Observable<T[K]>;
    set<V>(key: string | number, value: V): Observable<V>;
    assign(value: T | Partial<T>): Observable<T>;
    delete(): Observable<T>;
    delete<K extends keyof T>(key: K | string | number): Observable<T>;
}
export interface ObservableComputedFns<T> {
    get(): T;
    onChange(cb: ListenerFn<T>): ObservableListenerDispose;
    onEquals(value: T, cb?: (value?: T) => void): OnReturnValue<T>;
    onTrue(cb?: (value?: T) => void): OnReturnValue<T>;
    onHasValue(cb?: (value?: T) => void): OnReturnValue<T>;
}
type ArrayOverrideFnNames = 'every' | 'some' | 'filter' | 'reduce' | 'reduceRight' | 'forEach' | 'map';
export interface ObservableArrayOverride<T> extends Omit<Array<T>, ArrayOverrideFnNames> {
    /**
     * Determines whether all the members of an array satisfy the specified test.
     * @param predicate A function that accepts up to three arguments. The every method calls
     * the predicate function for each element in the array until the predicate returns a value
     * which is coercible to the Boolean value false, or until the end of the array.
     * @param thisArg An object to which the this keyword can refer in the predicate function.
     * If thisArg is omitted, undefined is used as the this value.
     */
    every<S extends T>(predicate: (value: T, index: number, array: T[]) => value is S, thisArg?: any): this is S[];
    /**
     * Determines whether all the members of an array satisfy the specified test.
     * @param predicate A function that accepts up to three arguments. The every method calls
     * the predicate function for each element in the array until the predicate returns a value
     * which is coercible to the Boolean value false, or until the end of the array.
     * @param thisArg An object to which the this keyword can refer in the predicate function.
     * If thisArg is omitted, undefined is used as the this value.
     */
    every(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: any): boolean;
    /**
     * Determines whether the specified callback function returns true for any element of an array.
     * @param predicate A function that accepts up to three arguments. The some method calls
     * the predicate function for each element in the array until the predicate returns a value
     * which is coercible to the Boolean value true, or until the end of the array.
     * @param thisArg An object to which the this keyword can refer in the predicate function.
     * If thisArg is omitted, undefined is used as the this value.
     */
    some(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: any): boolean;
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
    /**
     * Returns the elements of an array that meet the condition specified in a callback function.
     * @param predicate A function that accepts up to three arguments. The filter method calls the predicate function one time for each element in the array.
     * @param thisArg An object to which the this keyword can refer in the predicate function. If thisArg is omitted, undefined is used as the this value.
     */
    filter<S extends T>(predicate: (value: T, index: number, array: T[]) => value is S, thisArg?: any): S[];
    /**
     * Returns the elements of an array that meet the condition specified in a callback function.
     * @param predicate A function that accepts up to three arguments. The filter method calls the predicate function one time for each element in the array.
     * @param thisArg An object to which the this keyword can refer in the predicate function. If thisArg is omitted, undefined is used as the this value.
     */
    filter(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: any): T[];
    /**
     * Calls the specified callback function for all the elements in an array. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the callbackfn function one time for each element in the array.
     * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.
     */
    reduce(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T): T;
    reduce(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T, initialValue: T): T;
    /**
     * Calls the specified callback function for all the elements in an array. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the callbackfn function one time for each element in the array.
     * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.
     */
    reduce<U>(
        callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: T[]) => U,
        initialValue: U
    ): U;
    /**
     * Calls the specified callback function for all the elements in an array, in descending order. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls the callbackfn function one time for each element in the array.
     * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.
     */
    reduceRight(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T): T;
    reduceRight(
        callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T,
        initialValue: T
    ): T;
    /**
     * Calls the specified callback function for all the elements in an array, in descending order. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls the callbackfn function one time for each element in the array.
     * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.
     */
    reduceRight<U>(
        callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: T[]) => U,
        initialValue: U
    ): U;
}

export interface ObservableListenerInfo {
    value: any;
    prevValue: any;
    path: string[];
}

export type ListenerFn<T = any> = (
    value: T,
    prev: T,
    path: (string | number)[],
    valueAtPath: any,
    prevAtPath: any
) => void;
export type ListenerFnSaved<T = any> = { shallow?: boolean } & ListenerFn<T>;

type Recurse<T, K extends keyof T, TRecurse> = T[K] extends
    | Function
    | Map<any, any>
    | WeakMap<any, any>
    | Set<any>
    | WeakSet<any>
    | Promise<any>
    ? T[K]
    : T[K] extends number | boolean | string
    ? T[K] & ObservablePrimitiveFns<T[K]>
    : T[K] extends Array<any>
    ? Omit<T[K], ArrayOverrideFnNames> & ObservableFns<T[K]> & ObservableArrayOverride<Observable<T[K][number]>>
    : // ? ObservableFns<T[K]> & ObservableArrayOverride<T[K]>
    T extends object
    ? TRecurse
    : T[K];

type ObservableFnsRecursive<T> = {
    readonly [K in keyof T]: Recurse<T, K, Observable<T[K]>>;
};

export type Observable<T = any> = ObservableFnsRecursive<T> & ObservableFns<T>;

export interface ObservableEvent {
    dispatch(): void;
    on(cb?: () => void): ObservableListenerDispose;
    on(eventType: 'change', cb?: () => void): ObservableListenerDispose;
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
    dispose: ObservableListenerDispose;
}

export type ClassConstructor<I, Args extends any[] = any[]> = new (...args: Args) => I;
export type Shallow<T = any> = { [symbolShallow]: Observable<T> };
export type ObservableComputeFunction<T> = () => T;
export type ObservableListenerDispose = () => void;

export interface ObservableWrapper {
    _: Observable;
    isPrimitive: boolean;
    proxies: Map<string, object>;
    proxyValues: Map<string, ProxyValue>;
}

export type ObservablePrimitiveChild<T = any> = ObservablePrimitiveFns<T>;
export type ObservablePrimitive<T = any> = { readonly current: T } & ObservablePrimitiveFns<T>;
export type ObservableComputed<T = any> = { readonly current: T } & ObservableComputedFns<T>;
export type ObservableOrPrimitive<T> = T extends boolean | string | number ? ObservablePrimitive<T> : Observable<T>;
export type ObservableChecker<T = any> =
    | Observable<T>
    | ObservableComputed<T>
    | ObservablePrimitive<T>
    | ObservablePrimitiveChild<T>;
export type ObservableCheckerRender<T = any> =
    | Shallow<T>
    | ObservableComputeFunction<T>
    | Observable<T>
    | ObservableComputed<T>
    | ObservablePrimitiveChild<T>
    | ObservablePrimitive<T>;
export interface ProxyValue {
    parent: ProxyValue;
    children?: Map<string | number, ProxyValue>;
    proxy?: object;
    key: string | number;
    root: ObservableWrapper;
    listeners?: Set<ListenerFnSaved>;
}

export type ObservableValue<T> = T extends Shallow<infer t>
    ? t
    : T extends ObservableComputeFunction<infer t>
    ? t
    : T extends Observable<infer t>
    ? t
    : T extends ObservableComputed<infer t>
    ? t
    : T extends ObservablePrimitive<infer t>
    ? t
    : T;

export type MappedObservableValue<
    T extends ObservableCheckerRender | ObservableCheckerRender[] | Record<string, ObservableCheckerRender>
> = T extends ObservableCheckerRender
    ? ObservableValue<T>
    : T extends object | Array<any>
    ? {
          [K in keyof T]: ObservableValue<T[K]>;
      }
    : ObservableValue<T>;

/** @internal */
export interface TrackingNode {
    node: ProxyValue;
    shallow?: boolean;
    value: any;
}
