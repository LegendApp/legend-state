import type { GetOptions, ListenerFn, TrackingType } from './observableInterfaces';

type Primitive = string | number | boolean | symbol | bigint | undefined | null | Date;
type ArrayOverrideFnNames = 'find' | 'every' | 'some' | 'filter' | 'reduce' | 'reduceRight' | 'forEach' | 'map';

type ObservableComputed<T = any> = Readonly<Observable<T>>;
type ObservableComputedTwoWay<T, T2> = Observable<T> & MutableObservableBase<T2, T2>;

type MakeReadonlyInner<T> = Omit<T, keyof MutableObservableBase<any, any>>;
type Readonly<T> = MakeReadonlyInner<T> & {
    [K in keyof MakeReadonlyInner<T>]: T extends Observable ? T[K] : Readonly<T[K]>;
};

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

interface ObservableObjectFns<T, T2 = T> {
    assign(value: Partial<T & T2>): Observable<T>;
}
// TODO asdf Might not need T2
interface ObservableObjectFunctions<T = Record<string, any>, T2 = T>
    extends ObservablePrimitive<T, T2>,
        ObservableObjectFns<T, T2> {}

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

interface ObservablePrimitive<T, T2 = T> extends ImmutableObservableBase<T>, MutableObservableBase<T, T2> {}
type ObservableAny = Partial<ObservableObjectFns<any>> & ObservablePrimitive<any>;

interface ImmutableObservableBase<T> {
    peek(): RemoveObservables<T>;
    get(trackingType?: TrackingType | GetOptions): RemoveObservables<T>;
    onChange(
        cb: ListenerFn<T>,
        options?: { trackingType?: TrackingType; initial?: boolean; immediate?: boolean; noArgs?: boolean },
    ): () => void;
}

interface MutableObservableBase<T, T2> {
    set(
        value:
            | RemoveObservables<T & T2>
            | Promise<RemoveObservables<T & T2>>
            | ((prev: RemoveObservables<T & T2>) => RemoveObservables<T & T2>)
            | Observable<RemoveObservables<T & T2>>,
    ): Observable<T>;
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
type ObservableProps<T> = RestoreNullability<T, Simplify<Omit<NonNullable<T>, NonObservableKeys<NonNullable<T>>>>>;

type NonObservableProps<T> = RestoreNullability<
    T,
    Simplify<NullablePropsIf<Pick<NonNullable<T>, NonObservableKeys<NonNullable<T>>>, IsNullable<T>>>
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
        : T[K] extends () => Promise<infer t> | infer t
        ? t extends void
            ? T[K]
            : ObservableComputed<t> & T[K]
        : T[K];
};

type IsStrictAny<T> = 0 extends 1 & T ? true : false;

export interface ObservableState {
    isLoaded: boolean;
    error?: Error;
}
export interface WithState {
    state: ObservableState; // TODOV3: remove this
    _state: ObservableState;
}
export interface WithStateObs {
    state: Observable<ObservableState>; // TODOV3: remove this
    _state: Observable<ObservableState>;
}

type ObservableObject<T> = ObservableObjectFunctions<ObservableProps<T> & NonObservableProps<T>> &
    ObservableChildren<ObservableProps<T>> &
    ObservableFunctionChildren<NonObservableProps<T>>;

type ObservableNode<T, NT = NonNullable<T>> = [NT] extends [never] // means that T is ONLY undefined or null
    ? ObservablePrimitive<T>
    : IsStrictAny<T> extends true
    ? ObservableAny
    : [NT] extends [Promise<infer t>]
    ? Observable<t> & WithStateObs
    : [T] extends [() => infer t]
    ? t extends Observable
        ? t
        : ObservableComputed<t>
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
    : ObservableObject<T>;

type Simplify<T> = { [K in keyof T]: T[K] } & {};
type Observable<T = any> = ObservableNode<T>; // & {};

type ObservableReadable<T = any> = ImmutableObservableBase<T>;
type ObservableWriteable<T = any> = ObservableReadable<T> & MutableObservableBase<T, T>;

export type {
    ObservableComputed,
    ObservableComputedTwoWay,
    Observable,
    ObservableBoolean,
    ObservableObject,
    ObservablePrimitive,
    ObservableReadable,
    ObservableWriteable,
    // TODO: how to make these internal somehow?
    ImmutableObservableBase,
};
