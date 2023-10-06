import { symbolGetNode } from './globals';
import { NodeValue } from './nodeValueTypes';

/* type utilities */
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;
type PopUnion<U> = UnionToIntersection<U extends any ? (f: U) => void : never> extends (a: infer A) => void ? A : never;
type IsUnion<T> = [T] extends [UnionToIntersection<T>] ? false : true;
type UnionToArray<T, A extends unknown[] = []> = IsUnion<T> extends true
    ? UnionToArray<Exclude<T, PopUnion<T>>, [PopUnion<T>, ...A]>
    : [T, ...A];

/* merge utilities, makes it possible to traverse union types with nice DX */
type Merge<
    T extends object,
    U extends object,
    CommonKeys = Extract<keyof T, keyof U> & Extract<keyof U, keyof T>,
> = Omit<T, CommonKeys & keyof T> & { [K in CommonKeys & string]: T[K & keyof T] | U[K & keyof U] } & Omit<
        U,
        CommonKeys & keyof U
    >;

/* Note: the dummy type is required, not sure why, but it looks like a typescript bug */
type MergeObjects<T extends readonly [...any], Dummy extends boolean = true> = T extends [infer L, ...infer R]
    ? Dummy extends true
        ? Merge<L & object, MergeObjects<R, Dummy> & object>
        : never
    : unknown;
/* end */

/* branded types */
export declare const __brand: unique symbol;
export declare const __type: unique symbol;

export type Brand<K, T> = { [__brand]: T; __type: K };
type Opaque<T> = Brand<T, 'Opaque'>;
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

/* observable types */
type ComputedObservable<T, T2> = T2 extends None
    ? ImmutableObservableBase<T>
    : ImmutableObservableBase<T> & MutableObservableBase<T2>;

type ObservableArray<T extends any[]> = ObservableObject<T> &
    Pick<Array<Observable<T[number]>>, ArrayOverrideFnNames> & { [n: number]: Observable<T[number]> };

interface ObservableObject<T> extends ObservablePrimitive<T> {
    assign(value: Partial<T>): void;
}

type ObservableMap<T extends Map<any, any> | WeakMap<any, any>> = Omit<T, 'get' | 'size'> &
    Omit<ObservablePrimitive<T>, 'get' | 'size'> & {
        get(key: Parameters<T['get']>[0]): ObservableNode<Parameters<T['set']>[1]>;
        get(): T;
        size: ImmutableObservableBase<number>;
    };

type ObservableSet<T extends Set<any> | WeakSet<any>> = Omit<T, 'size'> &
    Omit<ObservablePrimitive<T>, 'size'> & { size: ImmutableObservableBase<number> };

interface ObservableBoolean extends ObservablePrimitive<boolean> {
    toggle(): boolean;
}

/* observable base type */
type TrackingType = undefined | true | symbol; // true === shallow
interface ObservablePrimitive<T> extends ImmutableObservableBase<T>, MutableObservableBase<T> {}

interface ImmutableObservableBase<T> {
    peek(): T;
    get(trackingType?: TrackingType): T;
    onChange(
        cb: ListenerFn<T>,
        options?: { trackingType?: TrackingType; initial?: boolean; immediate?: boolean; noArgs?: boolean },
    ): () => void;

    [symbolGetNode]: NodeValue;
}

interface MutableObservableBase<T> {
    set(value: T): void;
    delete(): void;
}

/* recursive observable root type */
type NonTraversable =
    | Function
    | Map<any, any>
    | WeakMap<any, any>
    | Set<any>
    | WeakSet<any>
    | Primitive
    | Opaque<unknown>
    | Computed<unknown>; // TODO double check if this is traversable or not

type UndefinedIf<T, U> = U extends true ? T | undefined : T;
// interface ObsableObject<T> {}

type Recurse<T, M, IsParentNullable, IsSelfNullable = [T] extends [undefined | null] ? true : IsParentNullable> = [
    T,
] extends [NonTraversable]
    ? ObservableNode<UndefinedIf<T, IsParentNullable>>
    : ObservableNode<UndefinedIf<T, IsParentNullable>> & {
          [K in keyof Omit<M, NonObservableKeys<M>>]-?: Recurse<
              K extends keyof T ? T[K] : M[K & keyof M],
              MergeIf<M[K & keyof M]>,
              IsSelfNullable
          >;
      } & Pick<M, NonObservableKeys<M>>;

type NonObservableKeys<T> = {
    [K in keyof T]-?: T[K] extends undefined | null
        ? never
        : NonNullable<T[K]> extends Function | ObservableNode<any>
        ? K
        : never;
}[keyof T];

type ObservableNode<T> = [T] extends [Computed<infer U, infer U2>]
    ? ComputedObservable<U, U2>
    : [T] extends [object]
    ? T extends Map<any, any> | WeakMap<any, any>
        ? ObservableMap<T>
        : T extends Set<any> | WeakSet<any>
        ? ObservableSet<T>
        : T extends any[]
        ? ObservableArray<T>
        : ObservableObject<T>
    : NonNullable<T> extends Function
    ? T
    : [T] extends [boolean]
    ? ObservableBoolean
    : ObservablePrimitive<T>;

type T = Observable<{ a?: () => void; b?: { c: string } }>;
const t: T = {} as any;
t.a?.();
t.b.c.get();

type MergeUnion<T> = MergeObjects<UnionToArray<T>>;
type MergeIf<T> = MergeUnion<Exclude<T, NonTraversable>>;

type Equals<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Observable<T> = Equals<T, any> extends true ? ObservableObject<any> : Recurse<T, MergeIf<T>, false>;

export type {
    Observable,
    Opaque,
    Computed,
    TrackingType,
    ListenerFn,
    ObservablePrimitive,
    ObservableBoolean,
    ObservableObject,
};

/* tests */
type ComplexState = Observable<{ foo: number | { a: number } | { b: string; a: string } }>;
const complex: ComplexState = {} as any;

complex.foo.set(12);
complex.foo.set({ a: 12 });
complex.foo.set({ b: 'test', a: 'test' });
complex.foo.a.set(12);
complex.foo.a.set('text');
complex.foo.b.set('test');

// @ts-expect-error should not be able to set 'b' to a number
complex.foo.b.set(12);

// @ts-expect-error should not be able to set foo to undefined
complex.foo.set(undefined);

const foo: number | { a: number } | { b: string } = complex.foo.get();
const b: string | undefined = complex.foo.b.get();
const a: number | string | undefined = complex.foo.a.get(); // number | undefined

type BooleanState = Observable<boolean>;
const bool: BooleanState = {} as any;
bool.toggle();

type TestComputed = Observable<{ a: Computed<number, string> }>;
const computed: TestComputed = {} as any;
computed.a.set('test');
computed['a'].get();

type TestKeys = NonObservableKeys<{ a: undefined | string; b: string; c?: () => void }>;
type Undefnide = Observable<{ foo: undefined | number }>;
const t2 = {} as Undefnide;
t2.foo.set(undefined);

// export type Simplify<T> =
// type Test<T> = ObservableObject<T> & Record<string, T | undefined>;
// interface Test3<T> extends Partial<Record<string, Observable<T[keyof T]> | undefined>>, ObservableObject<T> {}
// type Test2 = Test3<{ a: number }>;
