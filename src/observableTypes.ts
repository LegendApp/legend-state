import { expectTypeOf } from 'expect-type';

/* branded types */
export declare const __brand: unique symbol;
export declare const __type: unique symbol;

export type Brand<K, T> = { [__brand]: T; __type: K };
type None = Brand<never, 'None'>;
type Computed<T, T2 = None> = Brand<T | T2, 'Computed'>;

export type TypeAtPath = 'object' | 'array';

export interface Change {
    path: string[];
    pathTypes: TypeAtPath[];
    valueAtPath: any;
    prevAtPath: any;
}

export interface ListenerParams<T = any> {
    value: T;
    getPrevious: () => T;
    changes: Change[];
}

type ListenerFn<T = any> = (params: ListenerParams<T>) => void;

type Primitive = string | number | boolean | symbol | bigint | undefined | null | Date;
type ArrayOverrideFnNames = 'find' | 'every' | 'some' | 'filter' | 'reduce' | 'reduceRight' | 'forEach' | 'map';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ComputedObservable<T> extends ImmutableObservableBase<T> {}
interface TwoWayComputedObservable<T, T2> extends ImmutableObservableBase<T>, MutableObservableBase<T2, T2> {}

type RemoveIndex<T> = {
    [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K];
};

interface ObservableArray<T, U>
    extends ObservablePrimitive<T>,
        Pick<Array<Observable<U>>, ArrayOverrideFnNames>,
        Omit<RemoveIndex<Array<U>>, ArrayOverrideFnNames> {}

interface ObservableObjectFns<T, T2 = T> {
    assign(value: Partial<T & T2>): Observable<T>;
}
interface ObservableObject<T, T2 = T> extends ObservablePrimitive<T, T2>, ObservableObjectFns<T, T2> {}

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

type TrackingType = undefined | true | symbol; // true === shallow
interface ObservablePrimitive<T, T2 = T> extends ImmutableObservableBase<T>, MutableObservableBase<T, T2> {}
type ObservableAny = Partial<ObservableObjectFns<any>> & ObservablePrimitive<any>;

export interface ImmutableObservableBase<T> {
    peek(): T;
    get(trackingType?: TrackingType): T;
    onChange(
        cb: ListenerFn<T>,
        options?: { trackingType?: TrackingType; initial?: boolean; immediate?: boolean; noArgs?: boolean },
    ): () => void;

    // [symbolGetNode]: NodeValue;
}

interface MutableObservableBase<T, T2> {
    set(value: (T & T2) | Promise<T & T2> | ((prev: T & T2) => T & T2) | Observable<T & T2>): Observable<T>;
    delete(): void;
}

type UndefinedIf<T, U> = U extends true ? T | undefined : T;

type IsNullable<T> = undefined extends T ? true : null extends T ? true : false;

type NonObservable = Function;
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
    [K in keyof T]-?: T[K] extends () => Promise<infer t> | infer t
        ? t extends void
            ? T[K]
            : Observable<t> & T[K]
        : T[K];
};

type IsStrictAny<T> = 0 extends 1 & T ? true : false;

export interface ObservableState {
    isLoaded: boolean;
    error?: Error;
}
interface WithState {
    state: ObservableState; // TODOV3: remove this
    _state: ObservableState;
}

type ObservableNode<T, NT = NonNullable<T>> = [NT] extends [never] // means that T is ONLY undefined or null
    ? ObservablePrimitive<T>
    : IsStrictAny<T> extends true
    ? ObservableAny
    : [T] extends [Promise<infer t>]
    ? Observable<t> & Observable<WithState>
    : [NT] extends [Primitive]
    ? [NT] extends [boolean]
        ? ObservableBoolean
        : ObservablePrimitive<T>
    : [NT] extends [Computed<infer U, infer U2>]
    ? U2 extends None
        ? ComputedObservable<U>
        : TwoWayComputedObservable<U, U2>
    : NT extends Map<any, any> | WeakMap<any, any>
    ? ObservableMap<NT>
    : NT extends Set<infer U>
    ? ObservableSet<Set<UndefinedIf<U, IsNullable<T>>>>
    : NT extends WeakSet<any>
    ? ObservableSet<NT> // TODO what to do here with nullable? WeakKey is type object | symbol
    : NT extends Array<infer U>
    ? ObservableArray<T, U> & ObservableChildren<T>
    : ObservableObject<ObservableProps<T>, NonObservableProps<T>> &
          ObservableChildren<ObservableProps<T>> &
          ObservableFunctionChildren<NonObservableProps<T>>;

type Simplify<T> = { [K in keyof T]: T[K] } & {};
type Observable<T = any> = ObservableNode<T>; // & {};

export type {
    Computed,
    ListenerFn,
    Observable,
    ObservableBoolean,
    ObservableObject,
    ObservablePrimitive,
    TrackingType,
};

/* some temporary tests */
it('boolean toggle', () => {
    type BooleanState = Observable<boolean>;
    expectTypeOf<BooleanState>().toEqualTypeOf<ObservableBoolean>();
    expectTypeOf<BooleanState['toggle']>().toEqualTypeOf<() => boolean>();
});

it('union root with primitives', () => {
    expectTypeOf<Observable<boolean | string>>().toEqualTypeOf<ObservablePrimitive<boolean | string>>();
});

it('computed', () => {
    expectTypeOf<Observable<Computed<boolean | string>>>().toEqualTypeOf<ComputedObservable<boolean | string>>();
    expectTypeOf<Observable<Computed<boolean> | Computed<string>>>().toEqualTypeOf<
        ComputedObservable<boolean | string>
    >();
    expectTypeOf<Observable<Computed<string, number>>>().toEqualTypeOf<TwoWayComputedObservable<string, number>>();
});

it('undefined', () => {
    expectTypeOf<Observable<boolean | string | undefined>>().toEqualTypeOf<
        ObservablePrimitive<boolean | string | undefined>
    >();
});

it('undefined', () => {
    type T = Observable<boolean | string | undefined>;
    expectTypeOf<T>().toEqualTypeOf<ObservablePrimitive<boolean | string | undefined>>();
});

it('array', () => {
    type Array = Observable<{ foo: string }[]>;
    expectTypeOf<Array[0]>().toEqualTypeOf<ObservableObject<{ foo: string }>>;
    expectTypeOf<Array[0]['get']>().returns.toEqualTypeOf<{ foo: string }>();
    const arr = {} as Array;
    arr[0].foo.get();
});

it('nullable object', () => {
    type NullableObject = Observable<{ a: number } | undefined>;
    expectTypeOf<NullableObject['get']>().returns.toEqualTypeOf<{ a: number } | undefined>();
    expectTypeOf<NullableObject['a']>().toEqualTypeOf<ObservablePrimitive<number | undefined>>();
    const test = {} as NullableObject;
    test.a.get();
});

it('nested nullable object', () => {
    type NullableObject = Observable<{ foo: { a: number } | undefined }>;
    expectTypeOf<NullableObject['foo']['a']>().toEqualTypeOf<ObservablePrimitive<number | undefined>>();
});

it('nested nullable array', () => {
    type NullableArray = Observable<{ foo: { a: number }[] | undefined }>;
    expectTypeOf<NullableArray['foo'][number]['a']>().toEqualTypeOf<ObservablePrimitive<number | undefined>>();
    const arr = {} as NullableArray;
    arr.foo[0].get();
});
