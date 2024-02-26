import type { GetOptions, ListenerFn, RecordValue, TrackingType } from './observableInterfaces';

type Primitive = string | number | boolean | symbol | bigint | undefined | null | Date;
type ArrayOverrideFnNames =
    | 'find'
    | 'every'
    | 'some'
    | 'filter'
    | 'reduce'
    | 'reduceRight'
    | 'forEach'
    | 'map'
    | 'sort';

type RemoveIndex<T> = {
    [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K];
};

type BuiltIns = String | Boolean | Number | Date | Error | RegExp | Array<any> | Function | Promise<any>;

type IsUserDefinedObject<T> =
    // Only objects that are not function or arrays or instances of BuiltIns.
    T extends Function | BuiltIns | any[] ? false : T extends object ? true : false;

export type RemoveObservables<T> = T extends ImmutableObservableBase<infer t>
    ? t
    : IsUserDefinedObject<T> extends true
    ? {
          [K in keyof T]: RemoveObservables<T[K]>;
      }
    : T;

interface ObservableArray<T, U>
    extends ObservablePrimitive<T>,
        Pick<Array<Observable<U>>, ArrayOverrideFnNames>,
        Omit<RemoveIndex<Array<U>>, ArrayOverrideFnNames> {}

interface ObservableObjectFns<T> {
    assign(value: Partial<T>): Observable<T>;
}

interface ObservableObjectFunctions<T = Record<string, any>> extends ObservablePrimitive<T>, ObservableObjectFns<T> {}

type ObservableMap<T extends Map<any, any> | WeakMap<any, any>> = Omit<T, 'get' | 'size'> &
    Omit<ObservablePrimitive<T>, 'get' | 'size'> & {
        get(key: Parameters<T['get']>[0]): Observable<Parameters<T['set']>[1]>;
        get(): T;
        size: ImmutableObservableBase<number>;
    };

type ObservableSet<T extends Set<any> | WeakSet<any>> = Omit<T, 'size'> &
    Omit<ObservablePrimitive<T>, 'size'> & { size: ImmutableObservableBase<number> };

interface ObservableBoolean extends ObservablePrimitive<boolean> {
    toggle(): boolean;
}

interface ObservablePrimitive<T> extends ImmutableObservableBase<T>, MutableObservableBase<T> {}
type ObservableAny = Partial<ObservableObjectFns<any>> & ObservablePrimitive<any> & Record<string, any>;

interface ImmutableObservableBase<T> {
    peek(): RemoveObservables<T>;
    get(trackingType?: TrackingType | GetOptions): RemoveObservables<T>;
    onChange(
        cb: ListenerFn<T>,
        options?: { trackingType?: TrackingType; initial?: boolean; immediate?: boolean; noArgs?: boolean },
    ): () => void;
}

interface MutableObservableBase<T> {
    set(value: (prev: RemoveObservables<T>) => RemoveObservables<T>): Observable<T>;
    set(value: RecursiveValueOrFunction<T>): Observable<T>;
    set(value: Promise<RemoveObservables<T>>): Observable<T>;
    set(value: RemoveObservables<T>): Observable<T>;
    set(value: Observable<RemoveObservables<T>>): Observable<T>;
    delete(): void;
}

type UndefinedIf<T, U> = U extends true ? T | undefined : T;

type IsNullable<T> = undefined extends T ? true : null extends T ? true : false;

type NonObservable = Function | Observable;
type NonObservableKeys<T> = {
    [K in keyof T]-?: IsStrictAny<T[K]> extends true
        ? never
        : T[K] extends undefined | null
        ? never
        : NonNullable<T[K]> extends NonObservable
        ? K
        : never;
}[keyof T];
type ObservableProps<T> = RestoreNullability<T, Omit<NonNullable<T>, NonObservableKeys<NonNullable<T>>>>;

type NonObservableProps<T> = RestoreNullability<
    T,
    NullablePropsIf<Pick<NonNullable<T>, NonObservableKeys<NonNullable<T>>>, IsNullable<T>>
>;
type NullablePropsIf<T, U> = {
    [K in keyof T]: UndefinedIf<T[K], U>;
};

type RestoreNullability<Source, Target> = IsNullable<Source> extends true
    ? Target | Extract<Source, null | undefined>
    : Target;

type ObservableChildren<T, Nullable = IsNullable<T>> = {
    [K in keyof T]-?: Observable<UndefinedIf<T[K], Nullable>>;
};
type ObservableFunctionChildren<T> = {
    [K in keyof T]-?: T[K] extends Observable
        ? T[K]
        : T[K] extends (key: infer Key extends string) => Promise<infer t> | infer t
        ? HasOneParam<T[K]> extends true
            ? Observable<Record<Key, t>>
            : t extends void
            ? T[K]
            : t extends Observable
            ? t
            : Observable<t> & (() => t)
        : T[K];
};

type IsStrictAny<T> = 0 extends 1 & T ? true : false;

export interface ObservableState {
    isLoaded: boolean;
    error?: Error;
}

type ObservableObject<T> = ObservableObjectFunctions<ObservableProps<T> & NonObservableProps<T>> &
    ObservableChildren<ObservableProps<T>> &
    ObservableFunctionChildren<NonObservableProps<T>>;

type ObservableFunction<T> = T extends () => infer t ? t | (() => t) : T;

// Check if the function type T has one lookup parameter
type HasOneParam<T> = T extends (...args: infer P) => any ? (P extends { length: 1 } ? true : false) : false;

// : [T] extends [(key: infer K extends string) => infer t]
// ? // ?  HasParams<T> extends true ? Observable<Record<K, t>>
type ObservableNode<T, NT = NonNullable<T>> = [NT] extends [never] // means that T is ONLY undefined or null
    ? ObservablePrimitive<T>
    : IsStrictAny<T> extends true
    ? ObservableAny
    : [T] extends [Promise<infer t>]
    ? ObservableNode<t>
    : [T] extends [(key: infer K extends string) => infer t]
    ? [t] extends [ImmutableObservableBase<any>]
        ? t
        : HasOneParam<T> extends true
        ? Observable<Record<K, t>>
        : Observable<ObservableFunction<t>>
    : [NT] extends [ImmutableObservableBase<any>]
    ? NT
    : [NT] extends [Primitive]
    ? [NT] extends [boolean]
        ? ObservableBoolean
        : ObservablePrimitive<T>
    : NT extends Map<any, any> | WeakMap<any, any>
    ? ObservableMap<NT>
    : NT extends Set<infer U>
    ? ObservableSet<Set<UndefinedIf<U, IsNullable<T>>>>
    : NT extends WeakSet<any>
    ? ObservableSet<NT> // TODO what to do here with nullable? WeakKey is type object | symbol
    : NT extends Array<infer U>
    ? ObservableArray<T, U> & ObservableChildren<T>
    : ObservableObject<T> & {};

// Note: The {} makes intellisense display observables as Observable instead of all the subtypes
type Observable<T = any> = ObservableNode<T> & {};

type ObservableReadable<T = any> = ImmutableObservableBase<T>;
type ObservableWriteable<T = any> = ObservableReadable<T> & MutableObservableBase<T>;

// Allow input types to have functions in them
type ValueOrFunction<T> = T extends Function ? T : T | Promise<T> | (() => T | Promise<T>);
type ValueOrFunctionKeys<T> = {
    [K in keyof T]: RecursiveValueOrFunction<T[K]>;
};

type RecursiveValueOrFunction<T> = T extends Function
    ? T
    : T extends object
    ?
          | ((key: string) => RecordValue<RecursiveValueOrFunction<T>>)
          | Promise<ValueOrFunctionKeys<T>>
          | ValueOrFunctionKeys<T>
          | ImmutableObservableBase<T>
          | (() => T | Promise<T> | ValueOrFunctionKeys<T> | Promise<ValueOrFunctionKeys<T>> | Observable<T>)
    : ValueOrFunction<T>;

export type {
    Observable,
    ObservableBoolean,
    ObservableObject,
    ObservablePrimitive,
    ObservableReadable,
    ObservableWriteable,
    // TODO: how to make these internal somehow?
    ImmutableObservableBase,
    RecursiveValueOrFunction,
};
