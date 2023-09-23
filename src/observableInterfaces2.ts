import { Diff } from 'utility-types';
import { Change } from './observableInterfaces';

/* type utilities */
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;
type PopUnion<U> = UnionToIntersection<U extends any ? (f: U) => void : never> extends (a: infer A) => void ? A : never;
type IsUnion<T> = [T] extends [UnionToIntersection<T>] ? false : true;
type UnionToArray<T, A extends unknown[] = []> = IsUnion<T> extends true
    ? UnionToArray<Exclude<T, PopUnion<T>>, [PopUnion<T>, ...A]>
    : [T, ...A];

type RemoveDistribution<T> = ([T] extends [ObservableSetter<infer U>] ? ObservableSetter<U> : never) & Omit<T, 'set'>;

/* merge utilities, makes it possible to traverse union types with nice DX */
type MergeResult<T extends readonly [...any]> = Exclude<MergeObjects<T>, Merge<never, object>> & {};

type Merge<
    T extends object,
    U extends object,
    CommonKeys = Extract<keyof T, keyof U> & Extract<keyof U, keyof T>,
> = Diff<T, U> & (Pick<T, CommonKeys & keyof T> | Pick<U, CommonKeys & keyof U>) & Diff<U, T>;

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

export interface ListenerParams<T = any> {
    value: T;
    getPrevious: () => T;
    changes: Change[];
}

type ListenerFn<T = any> = (params: ListenerParams<T>) => void;

type Primitive = string | number | boolean | symbol | bigint | undefined | null | Date;
type ArrayOverrideFnNames = 'find' | 'every' | 'some' | 'filter' | 'reduce' | 'reduceRight' | 'forEach' | 'map';

/* observable types */
type ComputedObservable<T, T2> = [T2] extends [None]
    ? Pick<ObservableBase<T>, 'peek' | 'get' | 'onChange'>
    : Pick<ObservableBase<T>, 'peek' | 'get' | 'onChange'> & ObservableSetter<T2>;

type ObservableArray<T extends any[]> = ObservableObject<T> &
    Pick<Array<Observable<T[number]>>, ArrayOverrideFnNames> & { [n: number]: Observable<T[number]> };

type ObservableObject<T> = ObservableBase<T> & {
    assign(value: T | Partial<T>): Observable<T>;
};

type ObservableMap<T extends Map<any, any> | WeakMap<any, any>> = Omit<T, 'get' | 'size'> &
    Omit<ObservableBase<T>, 'get' | 'size'> & {
        get(key: Parameters<T['get']>[0]): Observable<Parameters<T['set']>[1]>;
        get(): T;
        size: Observable<number>;
    };

type ObservableSet<T extends Set<any> | WeakSet<any>> = Omit<T, 'size'> &
    Omit<ObservableBase<T>, 'size'> & { size: Observable<number> };

type ObservablePrimitive<T> = T extends boolean ? { toggle(): T } & ObservableBase<T> : ObservableBase<T>;

/* observable base type */
type TrackingType = undefined | true | symbol; // true === shallow
type ObservableBase<T> = {
    peek(): T;
    get(trackingType?: TrackingType): T;
    onChange(
        cb: ListenerFn<T>,
        options?: { trackingType?: TrackingType; initial?: boolean; immediate?: boolean; noArgs?: boolean },
    ): () => void;
    delete(): ObservableBase<T>;
} & ObservableSetter<T>;

export interface ObservableSetter<T> {
    set(value: T): void;
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

type Traverse<
    T,
    IsReadonly,
    IsParentNullable,
    IsSelfNullable = T extends undefined | null ? true : IsParentNullable,
> = NonNullable<T> extends NonTraversable
    ? {}
    : {
          [K in keyof T]-?: Observable<
              T[K] | (IsSelfNullable extends true ? undefined : never),
              IsReadonly,
              IsSelfNullable
          >;
      } & Record<keyof T | string, Observable<T[keyof T] | undefined, IsReadonly, true>>;

type Observable<T, IsReadonly = false, IsParentNullable = false> = MakeReadonly<
    IsReadonly,
    Exclude<T, never> extends Computed<infer U, infer U2>
        ? ComputedObservable<U, U2>
        : RemoveDistribution<
              T extends object
                  ? T extends Map<any, any> | WeakMap<any, any>
                      ? ObservableMap<T>
                      : T extends Set<any> | WeakSet<any>
                      ? ObservableSet<T>
                      : T extends any[]
                      ? ObservableArray<T>
                      : ObservableObject<T>
                  : ObservablePrimitive<T>
          >
> &
    Traverse<T, IsReadonly, IsParentNullable>;

type MakeReadonly<IsReadonly, T> = IsReadonly extends true ? Omit<T, 'set' | 'delete'> : T;

// type RootObservable<T, IsParentNullable = false> = IsUnion<T> extends true
//     ? Observable<UnionToIntersection<NonNullable<Exclude<T, Primitive>>> | Extract<T, Primitive>, true>
//     : Observable<T, IsParentNullable>;

type RootObservable<T, IsReadonly = false, IsParentNullable = false> = IsUnion<Extract<T, object>> extends true
    ? Observable<
          MergeResult<UnionToArray<NonNullable<Extract<T, object>>>> | Exclude<Exclude<T, object>, never>,
          IsReadonly,
          true
      >
    : Observable<T, IsReadonly, IsParentNullable>;

type ReadonlyObservable<T> = RootObservable<T, true>;

export type { RootObservable as Observable, Opaque, Computed, TrackingType, ListenerFn, ReadonlyObservable };

/* tests */
type Test = RootObservable<{ a: Date | string } | { b: string } | { b: number }>;
const test: Test = {} as any;
test.b.set(12);

type TestComputed = RootObservable<{ a: Computed<number | undefined, number | undefined> }>;
const computed: TestComputed = {} as any;
computed.a.set(12);
