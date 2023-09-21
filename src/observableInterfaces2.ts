import { Change, ObservableListenerDispose } from './observableInterfaces';

type Simplify<T> = { [K in keyof T]: T[K] } & {};

/* union type utilities */
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;
type PopUnion<U> = UnionToIntersection<U extends any ? (f: U) => void : never> extends (a: infer A) => void ? A : never;
type IsUnion<T> = [T] extends [UnionToIntersection<T>] ? false : true;
type UnionToArray<T, A extends unknown[] = []> = IsUnion<T> extends true
    ? UnionToArray<Exclude<T, PopUnion<T>>, [PopUnion<T>, ...A]>
    : [T, ...A];

export interface ListenerParams<T = any> {
    value: T;
    getPrevious: () => T;
    changes: Change[];
}

type ListenerFn<T = any> = (params: ListenerParams<T>) => void;

type Primitive = string | number | boolean | symbol | bigint | undefined | null | Date;
type ArrayOverrideFnNames = 'find' | 'every' | 'some' | 'filter' | 'reduce' | 'reduceRight' | 'forEach' | 'map';

/* observable types */
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

type ObservablePrimitive<T> = [T] extends [boolean] ? { toggle(): T } & ObservableBase<T> : ObservableBase<T>;

/* observable base type */
type TrackingType = undefined | true | symbol; // true === shallow
type ObservableBase<T> = {
    peek(): T;
    get(trackingType?: TrackingType): T;
    onChange(
        cb: ListenerFn<T>,
        options?: { trackingType?: TrackingType; initial?: boolean; immediate?: boolean; noArgs?: boolean },
    ): ObservableListenerDispose;
    delete(): Observable<T>;
    set(value: T | ((prev: T) => T) | Promise<T>): Observable<T>;
};

/* recursive observable root type */
type NonTraversable = Function | Map<any, any> | WeakMap<any, any> | Set<any> | WeakSet<any> | Primitive;

type Traverse<
    T,
    IsParentNullable,
    IsSelfNullable = T extends undefined | null ? true : IsParentNullable,
> = NonNullable<T> extends NonTraversable
    ? {}
    : {
          [K in keyof T]-?: Observable<T[K] | (IsSelfNullable extends true ? undefined : never), IsSelfNullable>;
      };

export type Observable<T, IsParentNullable = false> = (T extends object
    ? T extends Map<any, any> | WeakMap<any, any>
        ? ObservableMap<T>
        : T extends Set<any> | WeakSet<any>
        ? ObservableSet<T>
        : T extends any[]
        ? ObservableArray<T>
        : ObservableObject<T>
    : ObservablePrimitive<T>) &
    Traverse<T, IsParentNullable>;

type Test = Observable<{ a: { b: { c: number[] } } | boolean } | undefined>;
const test: Test = {} as any;

test.a.get();
