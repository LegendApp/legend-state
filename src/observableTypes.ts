import type { GetOptions, ListenerFn, TrackingType } from './observableInterfaces';

type Primitive = string | number | boolean | symbol | bigint | undefined | null | Date;
type ArrayOverrideFnNames =
    | 'find'
    | 'findIndex'
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

export type RemoveObservables<T> =
    T extends ImmutableObservableBase<infer t>
        ? t
        : T extends ImmutableObservableBase<infer t>[]
          ? t[]
          : IsUserDefinedObject<T> extends true
            ? {
                  [K in keyof T]: RemoveObservables<T[K]>;
              }
            : T extends ImmutableObservableBase<infer TObs>
              ? TObs
              : T extends () => infer TRet
                ? RemoveObservables<TRet> & T
                : T extends (key: infer TKey extends string | number) => infer TRet
                  ? Record<TKey, RemoveObservables<TRet>> & T
                  : T;

interface ObservableArray<T, U>
    extends ObservablePrimitive<T>,
        Pick<Array<Observable<U>>, ArrayOverrideFnNames>,
        Omit<RemoveIndex<Array<U>>, ArrayOverrideFnNames> {}

export interface ObservableObjectFns<T> {
    assign(value: Partial<T>): Observable<T>;
}

interface ObservableObjectFunctions<T = Record<string, any>> extends ObservablePrimitive<T>, ObservableObjectFns<T> {}

type MapKey<T extends Map<any, any> | WeakMap<any, any>> = Parameters<T['has']>[0];
type MapValue<T extends Map<any, any> | WeakMap<any, any>> = ReturnType<T['get']>;
export type ObservableMap<T extends Map<any, any> | WeakMap<any, any>> = Omit<T, 'get' | 'size' | 'set'> &
    Omit<ObservablePrimitive<T>, 'get' | 'size'> &
    Record<MapKey<T>, Observable<MapValue<T>>> & {
        get(key: Parameters<T['get']>[0]): Observable<Parameters<T['set']>[1]>;
        get(): T;
        size: number;
        set(key: MapKey<T>, value: MapValue<T>): Observable<T>;
        assign(
            value: Record<MapKey<T>, MapValue<T>> | Map<MapKey<T>, MapValue<T>> | WeakMap<MapKey<T>, MapValue<T>>,
        ): Observable<T>;
    };

type SetValue<T extends Set<any> | WeakSet<any>> = Parameters<T['has']>[0];

type ObservableSet<T extends Set<any> | WeakSet<any>> = Omit<T, 'size' | 'add'> &
    Omit<ObservablePrimitive<T>, 'size'> & { size: number; add: (value: SetValue<T>) => Observable<T> };

export interface ObservableBoolean extends ObservablePrimitive<boolean> {
    toggle(): void;
}

export interface ObservablePrimitive<T> extends ImmutableObservableBase<T>, MutableObservableBase<T> {}
type ObservableAny = Partial<ObservableObjectFns<any>> & ObservablePrimitive<any> & Record<string, any>;

interface ImmutableObservableSimple<T> {
    peek(): T;
    get(trackingType?: any): any;
    onChange(cb: ListenerFn<T>, options?: any): () => void;
}
export interface ImmutableObservableBase<T> extends ImmutableObservableSimple<T> {
    peek(): RemoveObservables<T>;
    peek(): T; // This is just to match the Simple base type
    get(trackingType?: TrackingType | GetOptions): RemoveObservables<T>;
    onChange(
        cb: ListenerFn<T>,
        options?: { trackingType?: TrackingType; initial?: boolean; immediate?: boolean; noArgs?: boolean },
    ): () => void;
}

interface MutableObservableSimple {
    set(value: any): void;
    delete(): void;
}
interface MutableObservableBase<T> extends MutableObservableSimple {
    set(value: (prev: RemoveObservables<T>) => RemoveObservables<T>): void;
    set(value: Observable<RemoveObservables<T>>): void;
    set(value: RecursiveValueOrFunction<T>): void;
    set(value: Promise<RemoveObservables<T>>): void;
    set(value: RemoveObservables<T>): void;
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
type ObservableProps<T> =
    NonObservableKeys<NonNullable<T>> extends never
        ? T
        : RestoreNullability<T, Omit<NonNullable<T>, NonObservableKeys<NonNullable<T>>>>;

type NonObservableProps<T> = RestoreNullability<
    T,
    NullablePropsIf<Pick<NonNullable<T>, NonObservableKeys<NonNullable<T>>>, IsNullable<T>>
>;
type NullablePropsIf<T, U> = {
    [K in keyof T]: UndefinedIf<T[K], U>;
};

type RestoreNullability<Source, Target> =
    IsNullable<Source> extends true ? Target | Extract<Source, null | undefined> : Target;

type ObservableChildren<T, Nullable = IsNullable<T>> = {
    [K in keyof T]-?: Observable<UndefinedIf<T[K], Nullable>>;
};
type ObservableFunctionChildren<T> = {
    [K in keyof T]-?: T[K] extends Observable
        ? T[K]
        : T[K] extends (key: infer Key extends string | number) => Promise<infer t> | infer t
          ? IsLookupFunction<T[K]> extends true
              ? Observable<Record<Key, t>> & T[K]
              : t extends void
                ? T[K]
                : t extends Observable
                  ? t
                  : Observable<t> & (() => t)
          : T[K] & Observable<T[K]>;
};

type IsStrictAny<T> = 0 extends 1 & T ? true : false;

export type ObservableObject<T> = ObservableObjectFunctions<ObservableProps<T> & NonObservableProps<T>> &
    ObservableChildren<ObservableProps<T>> &
    ObservableFunctionChildren<NonObservableProps<T>>;

type ObservableFunction<T> = T extends () => infer t ? t | (() => t) : T;

// Check if the function type T has one lookup parameter
type IsLookupFunction<T> = T extends (...args: infer P) => any
    ? P extends { length: 1 }
        ? P[0] extends string | ObservablePrimitive<string> | number | ObservablePrimitive<number>
            ? true
            : false
        : false
    : false;

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
              ? IsLookupFunction<T> extends true
                  ? Observable<Record<K, t>>
                  : t
              : IsLookupFunction<T> extends true
                ? Observable<Record<K, t>> & T
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
export type Observable<T = any> = ObservableNode<T> & {};

export type ObservableParam<T = any> = ImmutableObservableSimple<T> & MutableObservableSimple;

type FixExpanded<T> = [T] extends [boolean] ? boolean : T;

// Allow input types to have functions in them
type ValueOrFunction<T> = [T] extends [Function]
    ? T
    :
          | T
          | ImmutableObservableBase<FixExpanded<T> | T>
          | Promise<FixExpanded<T> | T>
          | (() => FixExpanded<T> | T | Promise<FixExpanded<T> | T> | ImmutableObservableBase<FixExpanded<T> | T>);

type ValueOrFunctionKeys<T> = {
    [K in keyof T]: RecursiveValueOrFunction<T[K]>;
};

export type RecursiveValueOrFunction<T> = T extends Function
    ? T
    : T extends object
      ?
            | ((key: string) => any)
            | Promise<ValueOrFunctionKeys<T>>
            | ValueOrFunctionKeys<T>
            | ImmutableObservableBase<T>
            | (() => T | Promise<T> | ValueOrFunctionKeys<T> | Promise<ValueOrFunctionKeys<T>> | Observable<T>)
      : ValueOrFunction<T>;
