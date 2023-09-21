import type { AsyncStorageStatic } from '@react-native-async-storage/async-storage';
import type { symbolGetNode, symbolOpaque } from './globals';
import { DatabaseReference, Query, get } from 'firebase/database';
import { peek, set } from './ObservableObject';
import { onChange } from './onChange';

// Copied from import { MMKVConfiguration } from 'react-native-mmkv';
// so we don't have to import it
interface MMKVConfiguration {
    /**
     * The MMKV instance's ID. If you want to use multiple instances, make sure to use different IDs!
     *
     * @example
     * ```ts
     * const userStorage = new MMKV({ id: `user-${userId}-storage` })
     * const globalStorage = new MMKV({ id: 'global-app-storage' })
     * ```
     *
     * @default 'mmkv.default'
     */
    id: string;
    /**
     * The MMKV instance's root path. By default, MMKV stores file inside `$(Documents)/mmkv/`. You can customize MMKV's root directory on MMKV initialization:
     *
     * @example
     * ```ts
     * const temporaryStorage = new MMKV({ path: '/tmp/' })
     * ```
     */
    path?: string;
    /**
     * The MMKV instance's encryption/decryption key. By default, MMKV stores all key-values in plain text on file, relying on iOS's sandbox to make sure the file is encrypted. Should you worry about information leaking, you can choose to encrypt MMKV.
     *
     * Encryption keys can have a maximum length of 16 bytes.
     *
     * @example
     * ```ts
     * const secureStorage = new MMKV({ encryptionKey: 'my-encryption-key!' })
     * ```
     */
    encryptionKey?: string;
}

type Nullable<T> = T | null | undefined;
export type TrackingType = undefined | true | symbol; // true === shallow

export interface MapGet<T extends Map<any, any> | WeakMap<any, any>> {
    get(key: Parameters<T['get']>[0]): ObservableChild<Parameters<T['set']>[1]>;
    get(): T;
    size: ObservableChild<number>;
}

export type StripFirstArg<T extends Function> = T extends (arg: NodeValue, ...args: infer U) => infer R
    ? (...args: U) => R
    : T;

export interface ObservableBaseFns<T> {
    peek(): T;
    get(trackingType?: TrackingType): T;
    onChange(
        cb: ListenerFn<T>,
        options?: { trackingType?: TrackingType; initial?: boolean; immediate?: boolean; noArgs?: boolean },
    ): ObservableListenerDispose;
}

export interface ObservablePrimitiveBaseFns<T> extends ObservableBaseFns<T> {
    delete(): this;
    set(value: Nullable<T> | CallbackSetter<T> | Promise<T>): ObservablePrimitiveChild<T>;
}

export interface ObservablePrimitiveBooleanFns<T> {
    toggle(): T;
}

export interface ObservableObjectFns<T> extends ObservableBaseFns<T> {
    set(value: Nullable<T> | CallbackSetter<T> | Promise<T>): ObservableChild<T>;
    assign(value: T | Partial<T>): ObservableChild<T>;
    delete(): ObservableChild<T>;
}

export type ObservablePrimitive<T> = [T] extends [boolean]
    ? ObservablePrimitiveBaseFns<T> & ObservablePrimitiveBooleanFns<T>
    : ObservablePrimitiveBaseFns<T>;

export interface ObservablePrimitiveChildFns<T> extends ObservablePrimitiveBaseFns<T> {
    delete(): this;
}

type CallbackSetter<T> = {
    bivarianceHack(prev: T): T;
}['bivarianceHack'];

export type OpaqueObject<T> = T & { [symbolOpaque]: true };

type ArrayOverrideFnNames = 'find' | 'every' | 'some' | 'filter' | 'reduce' | 'reduceRight' | 'forEach' | 'map';
type RemoveIndex<T> = {
    [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K];
};
export type ObservableArrayOverride<T> = Omit<RemoveIndex<Array<T>>, ArrayOverrideFnNames> &
    Pick<Array<Observable<T>>, ArrayOverrideFnNames> & { [n: number]: Observable<T> };
export interface ListenerParams<T = any> {
    value: T;
    getPrevious: () => T;
    changes: Change[];
}
export type ListenerFn<T = any> = (params: ListenerParams<T>) => void;

type PrimitiveProps<T> = Pick<T, PrimitiveKeys<T>>;
type NonPrimitiveProps<T> = Omit<T, PrimitiveKeys<T>>;

type Recurse<T, K extends keyof T, TRecurse> = T[K] extends ObservableReadable
    ? T[K]
    : T[K] extends Promise<infer t>
    ? Observable<t & PromiseInfo>
    : T[K] extends Function
    ? T[K]
    : T[K] extends ObservableProxyTwoWay<infer t, infer t2>
    ? ObservableProxyTwoWay<t, t2>
    : T[K] extends ObservableProxy<infer t>
    ? ObservableProxy<t>
    : T[K] extends ObservableProxyLink<infer t>
    ? ObservableProxyLink<t>
    : T[K] extends Map<any, any> | WeakMap<any, any>
    ? ObservableMap<T[K]>
    : T[K] extends Set<any> | WeakSet<any>
    ? ObservableSet<T[K]>
    : T[K] extends Set<any> | WeakSet<any>
    ? T[K] & ObservablePrimitiveBaseFns<T[K]>
    : T[K] extends OpaqueObject<T[K]>
    ? T[K] & ObservablePrimitiveChildFns<T[K]>
    : T[K] extends Primitive
    ? ObservablePrimitiveChild<T[K]>
    : T[K] extends Array<any>
    ? ObservableObjectFns<T[K]> & ObservableArrayOverride<T[K][number]>
    : T extends object
    ? TRecurse
    : T[K];

type ObservableFnsRecursiveUnsafe<T, NullableMarker> = {
    [K in keyof T]-?: Recurse<T, K, ObservableObject<T[K], NullableMarker>>;
};

type ObservableFnsRecursiveSafe<T, NullableMarker> = Readonly<ObservableFnsRecursiveUnsafe<T, NullableMarker>>;

type MakeNullable<T, NullableMarker> = {
    [K in keyof T]: T[K] | (NullableMarker extends never ? never : undefined);
};

type ObservableFnsRecursive<T, NullableMarker> = ObservableFnsRecursiveSafe<NonPrimitiveProps<T>, NullableMarker> &
    ObservableFnsRecursiveUnsafe<MakeNullable<PrimitiveProps<T>, NullableMarker>, NullableMarker>;

type ObservableComputedFnsRecursive<T> = {
    readonly [K in keyof T]-?: Recurse<T, K, ObservableBaseFns<NonNullable<T[K]>>>;
};

export interface ObservableEvent {
    fire(): void;
    on(cb?: () => void): ObservableListenerDispose;
    get(): void;
}

export type QueryByModified<T> =
    | boolean
    | {
          [K in keyof T]?: QueryByModified<T[K]>;
      }
    | {
          '*'?: boolean;
      };

export type TypeAtPath = 'object' | 'array';

export interface Change {
    path: string[];
    pathTypes: TypeAtPath[];
    valueAtPath: any;
    prevAtPath: any;
}

export interface PersistTransform<T = any> {
    in?: (value: T) => T | Promise<T>;
    out?: (value: T) => T | Promise<T>;
}

export interface PersistOptionsLocal<T = any> {
    name: string;
    transform?: PersistTransform<T>;
    fieldTransforms?: FieldTransforms<T>;
    readonly?: boolean;
    mmkv?: MMKVConfiguration;
    indexedDB?: {
        prefixID?: string;
        itemID?: string;
    };
    options?: any;
}
export type PersistOptionsRemote<T = any> = ObservablePersistenceConfigRemoteGlobalOptions & {
    readonly?: boolean;
    waitForGet?: Promise<any> | ObservableReadable<any>;
    waitForSet?: Promise<any> | ObservableReadable<any>;
    manual?: boolean;
    fieldTransforms?: FieldTransforms<T>;
    allowSetIfError?: boolean;
    transform?: PersistTransform<T>;
    firebase?: {
        refPath: (uid: string | undefined) => string;
        query?: (ref: DatabaseReference) => DatabaseReference | Query;
        queryByModified?: QueryByModified<T>;
        ignoreKeys?: string[];
        requireAuth?: boolean;
        mode?: 'once' | 'realtime';
    };
    offlineBehavior?: false | 'retry';
    changeTimeout?: number;
    onGetError?: (error: Error) => void;
    onSetError?: (error: Error) => void;
    log?: (message?: any, ...optionalParams: any[]) => void;
    onBeforeSet?: () => void;
    onSet?: () => void;
};
export interface ObservablePersistenceConfigLocalGlobalOptions {
    onGetError?: (error: Error) => void;
    onSetError?: (error: Error) => void;
    indexedDB?: {
        databaseName: string;
        version: number;
        tableNames: string[];
    };
    asyncStorage?: {
        AsyncStorage: AsyncStorageStatic;
        preload?: boolean | string[];
    };
}
export interface ObservablePersistenceConfigRemoteGlobalOptions {
    saveTimeout?: number;
    dateModifiedKey?: string;
    offlineBehavior?: false | 'retry';
    onGetError?: (error: Error) => void;
    onSetError?: (error: Error) => void;
    log?: (logLevel: 'verbose' | 'warning' | 'error', message: any, ...optionalParams: any[]) => void;
    onBeforeSet?: () => void;
    onSet?: () => void;
}
export interface ObservablePersistenceConfig {
    pluginLocal?: ClassConstructor<ObservablePersistLocal>;
    pluginRemote?: ClassConstructor<ObservablePersistRemoteClass> | ObservablePersistRemoteFunctions;
    localOptions?: ObservablePersistenceConfigLocalGlobalOptions;
    remoteOptions?: ObservablePersistenceConfigRemoteGlobalOptions;
}
export interface PersistOptions<T = any, TState = {}> {
    local?: string | PersistOptionsLocal<T>;
    remote?: PersistOptionsRemote<T>;
    pluginLocal?: ClassConstructor<ObservablePersistLocal>;
    pluginRemote?: ClassConstructor<ObservablePersistRemoteClass> | ObservablePersistRemoteFunctions<T, TState>;
}

export interface PersistMetadata {
    id?: '__legend_metadata';
    modified?: number;
    pending?: any;
}

export interface ObservablePersistLocal {
    initialize?(config: ObservablePersistenceConfigLocalGlobalOptions): void | Promise<void>;
    loadTable?(table: string, config: PersistOptionsLocal): Promise<any> | void;
    getTable<T = any>(table: string, config: PersistOptionsLocal): T;
    set(table: string, changes: Change[], config: PersistOptionsLocal): Promise<any> | void;
    deleteTable(table: string, config: PersistOptionsLocal): Promise<any> | void;
    getMetadata(table: string, config: PersistOptionsLocal): PersistMetadata;
    setMetadata(table: string, metadata: PersistMetadata, config: PersistOptionsLocal): Promise<any> | void;
    deleteMetadata(table: string, config: PersistOptionsLocal): Promise<any> | void;
}
export interface ObservablePersistRemoteSetParams<T> {
    syncState: Observable<ObservablePersistState>;
    obs: Observable<T>;
    options: PersistOptions<T>;
    changes: Change[];
    value: T;
}
export interface ObservablePersistRemoteGetParams<T, TState = {}> {
    state: Observable<ObservablePersistState & TState>;
    obs: ObservableReadable<T>;
    options: PersistOptions<T, TState>;
    dateModified?: number;
    onGet: () => void;
    onChange: (params: {
        value: unknown;
        path?: string[];
        pathTypes?: TypeAtPath[];
        mode?: 'assign' | 'set' | 'dateModified';
        dateModified?: number | undefined;
    }) => void | Promise<void>;
}
export interface ObservablePersistRemoteClass<TState = {}> {
    get<T>(params: ObservablePersistRemoteGetParams<T, TState>): void;
    set?<T>(
        params: ObservablePersistRemoteSetParams<T>,
    ): Promise<void | { changes?: object; dateModified?: number; pathStrs?: string[] }>;
}

export interface ObservablePersistRemoteFunctions<T = any, TState = {}> {
    get(params: ObservablePersistRemoteGetParams<T, TState>): T | Promise<T>;
    set?(
        params: ObservablePersistRemoteSetParams<T>,
    ): Promise<void | { changes?: object | undefined; dateModified?: number }>;
}

export interface ObservablePersistState {
    isLoadedLocal: boolean;
    isLoadedRemote: boolean;
    isEnabledLocal: boolean;
    isEnabledRemote: boolean;
    remoteError?: Error;
    dateModified?: number;
    clearLocal: () => Promise<void>;
    sync: () => Promise<void>;
    getPendingChanges: () =>
        | Record<
              string,
              {
                  p: any;
                  v?: any;
              }
          >
        | undefined;
}
export type RecordValue<T> = T extends Record<string, infer t> ? t : never;
export type ArrayValue<T> = T extends Array<infer t> ? t : never;
export type ObservableValue<T> = T extends Observable<infer t> ? t : never;

type FilterKeysByValue<T, U> = {
    [K in keyof T]: T[K] extends U ? K & (string | number) : never;
}[keyof T];

type ObjectKeys<T> = Exclude<FilterKeysByValue<T, Record<string, any>>, FilterKeysByValue<T, any[]>>;
type DictKeys<T> = FilterKeysByValue<T, Record<string, Record<string, any>>>;
type ArrayKeys<T> = FilterKeysByValue<T, any[]>;
type PrimitiveKeys<T> = FilterKeysByValue<T, Primitive>;

export type FieldTransforms<T> =
    | (T extends Record<string, Record<string, any>> ? { _dict: FieldTransformsInner<RecordValue<T>> } : never)
    | FieldTransformsInner<T>;

export type FieldTransformsInner<T> = {
    [K in keyof T]: string;
} & (
    | {
          [K in ObjectKeys<T> as `${K}_obj`]?: FieldTransforms<T[K]>;
      }
    | {
          [K in DictKeys<T> as `${K}_dict`]?: FieldTransforms<RecordValue<T[K]>>;
      }
) & {
        [K in ArrayKeys<T> as `${K}_arr`]?: FieldTransforms<ArrayValue<T[K]>>;
    } & {
        [K in ArrayKeys<T> as `${K}_val`]?: FieldTransforms<ArrayValue<T[K]>>;
    };

export type Selector<T> = ObservableReadable<T> | ObservableEvent | (() => T) | T;

export type ClassConstructor<I, Args extends any[] = any[]> = new (...args: Args) => I;
export type ObservableListenerDispose = () => void;

export interface ObservableRoot {
    _: any;
    locked?: boolean;
    toActivate?: NodeValue[];
    set?: (value: any) => void;
    activate?: () => void;
}

export type Primitive = boolean | string | number | Date | undefined | null | symbol | bigint;
export type ObservableMap<T extends Map<any, any> | WeakMap<any, any>> = Omit<T, 'get' | 'size'> &
    Omit<ObservablePrimitiveBaseFns<T>, 'get' | 'size'> &
    MapGet<T>;
export type ObservableSet<T extends Set<any> | WeakSet<any>> = Omit<T, 'size'> &
    Omit<ObservablePrimitiveBaseFns<T>, 'size'> & { size: ObservablePrimitiveChild<number> };
export type ObservableMapIfMap<T> = T extends Map<any, any> | WeakMap<any, any> ? ObservableMap<T> : never;
export type ObservableArray<T extends any[]> = ObservableObjectFns<T> & ObservableArrayOverride<T[number]>;
export type ObservableObject<T = any, NullableMarker = never> = ObservableFnsRecursive<
    NonNullable<T>,
    Extract<T | NullableMarker, null | undefined>
> &
    ObservableObjectFns<T | (NullableMarker extends never ? never : undefined)>;

export type ObservableChild<T = any> = [T] extends [Primitive] ? ObservablePrimitiveChild<T> : ObservableObject<T>;
export type ObservablePrimitiveChild<T = any> = [T] extends [boolean]
    ? ObservablePrimitiveChildFns<T> & ObservablePrimitiveBooleanFns<T>
    : ObservablePrimitiveChildFns<T>;

export type ObservableObjectOrArray<T> = T extends Map<any, any> | WeakMap<any, any>
    ? ObservableMap<T>
    : T extends Set<any> | WeakSet<any>
    ? ObservableSet<T>
    : T extends any[]
    ? ObservableArray<T>
    : ObservableObject<T, Extract<T, undefined>>;

export type ObservableComputed<T = any> = ObservableBaseFns<T> & ObservableComputedFnsRecursive<T>;
export type ObservableComputedTwoWay<T = any, T2 = T> = ObservableComputed<T> & ObservablePrimitiveBaseFns<T2>;
type Equals<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
export type Observable<T = any> = Equals<T, any> extends true
    ? ObservableObject<any>
    : T extends object
    ? ObservableObjectOrArray<T>
    : ObservablePrimitive<T>;

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

type Test = UnionToIntersection<Observable<{ foo: string } | string>>;

// type Get = ReturnType<Test['get']>;
// type Get = ReturnType<Test['foo']['get']>;

export type ObservableReadable<T = any> =
    | ObservableBaseFns<T>
    | ObservablePrimitiveBaseFns<T>
    | ObservablePrimitiveChildFns<T>
    | ObservableObjectFns<T>
    | ObservableMapIfMap<T>;

export type ObservableWriteable<T = any> = ObservableReadable<T> & {
    set(value: Nullable<T> | CallbackSetter<T> | Promise<T>): any;
    delete?: () => any;
};

export interface NodeValueListener {
    track: TrackingType;
    noArgs?: boolean;
    listener: ListenerFn;
}

interface BaseNodeValue {
    children?: Map<string, ChildNodeValue>;
    proxy?: object;
    root: ObservableRoot;
    listeners?: Set<NodeValueListener>;
    listenersImmediate?: Set<NodeValueListener>;
    isComputed?: boolean;
    proxyFn?: (key: string) => ObservableReadable;
    isEvent?: boolean;
    linkedToNode?: NodeValue;
    linkedFromNodes?: Set<NodeValue>;
    isSetting?: number;
    isAssigning?: number;
    parentOther?: NodeValue;
    functions?: Map<string, Function | ObservableComputed<any>>;
    lazy?: boolean;
}

export interface RootNodeValue extends BaseNodeValue {
    parent?: undefined;
    key?: undefined;
}

export interface ChildNodeValue extends BaseNodeValue {
    parent: NodeValue;
    key: string;
}

export type NodeValue = RootNodeValue | ChildNodeValue;

/** @internal */
export interface TrackingNode {
    node: NodeValue;
    track: TrackingType;
    num: number;
}
export interface ObserveEvent<T> {
    num: number;
    previous?: T | undefined;
    cancel?: boolean;
    onCleanup?: () => void;
}
export interface ObserveEventCallback<T> {
    num: number;
    previous?: T | undefined;
    value?: T;
    cancel?: boolean;
    onCleanup?: () => void;
    onCleanupReaction?: () => void;
}
export type ObservableProxy<T extends Record<string, any>> = {
    [K in keyof T]: ObservableComputed<T[K]>;
} & ObservableBaseFns<T> & {
        [symbolGetNode]: NodeValue;
    };
export type ObservableProxyLink<T extends Record<string, any>> = {
    [K in keyof T]: Observable<T[K]>;
} & ObservableBaseFns<T> & {
        [symbolGetNode]: NodeValue;
    };
export type ObservableProxyTwoWay<T extends Record<string, any>, T2> = {
    [K in keyof T]: ObservableComputedTwoWay<T[K], T2>;
} & ObservableBaseFns<T> & {
        [symbolGetNode]: NodeValue;
    };
export type PromiseInfo = {
    error?: any;
    status?: 'pending' | 'rejected';
};
