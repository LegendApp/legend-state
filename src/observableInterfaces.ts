import type { symbolGetNode, symbolOpaque } from './globals';

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
export interface ObservableBaseFns<T> {
    peek(): T;
    get(trackingType?: TrackingType): T;
    onChange(
        cb: ListenerFn<T>,
        options?: { trackingType?: TrackingType; initial?: boolean; immediate?: boolean; noArgs?: boolean },
    ): ObservableListenerDispose;
}
export interface ObservablePrimitiveBaseFns<T> extends ObservableBaseFns<T> {
    delete(): ObservablePrimitiveBaseFns<T>;
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
    delete(): ObservablePrimitiveChild<T>;
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

type PrimitiveKeys<T> = Pick<T, { [K in keyof T]-?: T[K] extends Primitive ? K : never }[keyof T]>;
type NonPrimitiveKeys<T> = Pick<T, { [K in keyof T]-?: T[K] extends Primitive ? never : K }[keyof T]>;

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

type ObservableFnsRecursiveUnsafe<T> = {
    [K in keyof T]-?: Recurse<T, K, ObservableObject<NonNullable<T[K]>>>;
};
type ObservableFnsRecursiveSafe<T> = {
    readonly [K in keyof T]-?: Recurse<T, K, ObservableObject<NonNullable<T[K]>>>;
};
type ObservableFnsRecursive<T> = ObservableFnsRecursiveSafe<NonPrimitiveKeys<T>> &
    ObservableFnsRecursiveUnsafe<PrimitiveKeys<T>>;

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
      };

export type TypeAtPath = 'object' | 'array';

export interface Change {
    path: string[];
    pathTypes: TypeAtPath[];
    valueAtPath: any;
    prevAtPath: any;
}

export interface PersistOptionsLocal<T = any> {
    name: string;
    adjustData?: {
        load?: (value: T) => T | Promise<T>;
        save?: (value: T) => T | Promise<T>;
    };
    fieldTransforms?: FieldTransforms<T>;
    readonly?: boolean;
    mmkv?: MMKVConfiguration;
    indexedDB?: {
        prefixID?: string;
        itemID?: string;
    };
    options?: any;
}
export interface PersistOptionsRemote<T = any> {
    readonly?: boolean;
    once?: boolean;
    requireAuth?: boolean;
    saveTimeout?: number;
    waitForLoad?: Promise<any> | ObservableReadable<any>;
    waitForSave?: Promise<any> | ObservableReadable<any> | ((value: any, path: string[]) => Promise<any>);
    manual?: boolean;
    fieldTransforms?: FieldTransforms<T>;
    allowSaveIfError?: boolean;
    onLoadError?: (error: Error) => void;
    onSaveError?: (error: Error) => void;
    adjustData?: {
        load?: (value: T) => T | Promise<T>;
        save?: (value: T) => T | Promise<T>;
    };
    firebase?: {
        syncPath: (uid: string) => `/${string}/`;
        queryByModified?: QueryByModified<T>;
        ignoreKeys?: string[];
        dateModifiedKey?: string;
    };
    onBeforeSaveRemote?: () => void;
    onSaveRemote?: () => void;
}
export interface PersistOptions<T = any> {
    local?: string | PersistOptionsLocal<T>;
    remote?: PersistOptionsRemote<T>;
    persistLocal?: ClassConstructor<ObservablePersistLocal>;
    persistRemote?: ClassConstructor<ObservablePersistRemote>;
}

export interface PersistMetadata {
    id?: '__legend_metadata';
    modified?: number;
    pending?: any;
}

export interface ObservablePersistLocal {
    initialize?(config: ObservablePersistenceConfig['persistLocalOptions']): void | Promise<void>;
    getTable<T = any>(table: string, config: PersistOptionsLocal): T;
    getTableTransformed?<T = any>(table: string, config: PersistOptionsLocal): T;
    getMetadata(table: string, config: PersistOptionsLocal): PersistMetadata;
    set(table: string, changes: Change[], config: PersistOptionsLocal): Promise<any> | void;
    updateMetadata(table: string, metadata: PersistMetadata, config: PersistOptionsLocal): Promise<any> | void;
    deleteTable(table: string, config: PersistOptionsLocal): Promise<any> | void;
    deleteMetadata(table: string, config: PersistOptionsLocal): Promise<any> | void;
    loadTable?(table: string, config: PersistOptionsLocal): Promise<any> | void;
}
export interface ObservablePersistRemoteSaveParams<T, T2> {
    state: Observable<ObservablePersistState>;
    obs: Observable<T>;
    options: PersistOptions<T>;
    path: string[];
    pathTypes: TypeAtPath[];
    valueAtPath: T2;
    prevAtPath: any;
}
export interface ObservablePersistRemoteListenParams<T> {
    state: Observable<ObservablePersistState>;
    obs: ObservableReadable<T>;
    options: PersistOptions<T>;
    dateModified?: number;
    onLoad: () => void;
    onChange: (params: {
        value: T;
        path: string[];
        pathTypes: TypeAtPath[];
        mode: 'assign' | 'set' | 'dateModified';
        dateModified: number | undefined;
    }) => void | Promise<void>;
}
export interface ObservablePersistRemote {
    save<T, T2>(params: ObservablePersistRemoteSaveParams<T, T2>): Promise<{ changes?: object; dateModified?: number }>;
    listen<T>(params: ObservablePersistRemoteListenParams<T>): void;
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

// This converts the state object's shape to the field transformer's shape
// TODO: FieldTransformer and this shape can likely be refactored to be simpler
declare type ObjectKeys<T> = Pick<
    T,
    {
        [K in keyof T]-?: K extends string
            ? T[K] extends Record<string, any>
                ? T[K] extends any[]
                    ? never
                    : K
                : never
            : never;
    }[keyof T]
>;
declare type DictKeys<T> = Pick<
    T,
    {
        [K in keyof T]-?: K extends string ? (T[K] extends Record<string, Record<string, any>> ? K : never) : never;
    }[keyof T]
>;
declare type ArrayKeys<T> = Pick<
    T,
    {
        [K in keyof T]-?: K extends string | number ? (T[K] extends any[] ? K : never) : never;
    }[keyof T]
>;
export declare type FieldTransforms<T> =
    | (T extends Record<string, Record<string, any>> ? { _dict: FieldTransformsInner<RecordValue<T>> } : never)
    | FieldTransformsInner<T>;
export declare type FieldTransformsInner<T> = {
    [K in keyof T]: string;
} & (
    | {
          [K in keyof ObjectKeys<T> as `${K}_obj`]?: FieldTransforms<T[K]>;
      }
    | {
          [K in keyof DictKeys<T> as `${K}_dict`]?: FieldTransforms<RecordValue<T[K]>>;
      }
) & {
        [K in keyof ArrayKeys<T> as `${K}_arr`]?: FieldTransforms<ArrayValue<T[K]>>;
    } & {
        [K in keyof ArrayKeys<T> as `${K}_val`]?: FieldTransforms<ArrayValue<T[K]>>;
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

export type Primitive = boolean | string | number | Date;
export type NotPrimitive<T> = T extends Primitive ? never : T;

export type ObservableMap<T extends Map<any, any> | WeakMap<any, any>> = Omit<T, 'get' | 'size'> &
    Omit<ObservablePrimitiveBaseFns<T>, 'get' | 'size'> &
    MapGet<T>;
export type ObservableSet<T extends Set<any> | WeakSet<any>> = Omit<T, 'size'> &
    Omit<ObservablePrimitiveBaseFns<T>, 'size'> & { size: ObservablePrimitiveChild<number> };
export type ObservableMapIfMap<T> = T extends Map<any, any> | WeakMap<any, any> ? ObservableMap<T> : never;
export type ObservableArray<T extends any[]> = ObservableObjectFns<T> & ObservableArrayOverride<T[number]>;
export type ObservableObject<T = any> = ObservableFnsRecursive<T> & ObservableObjectFns<T>;
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
    : ObservableObject<T>;

export type ObservableComputed<T = any> = ObservableBaseFns<T> & ObservableComputedFnsRecursive<T>;
export type ObservableComputedTwoWay<T = any, T2 = T> = ObservableComputed<T> & ObservablePrimitiveBaseFns<T2>;
type Equals<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
export type Observable<T = any> = Equals<T, any> extends true
    ? ObservableObject<any>
    : [T] extends [object]
    ? ObservableObjectOrArray<T>
    : ObservablePrimitive<T>;

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
    computedChildOfNode?: NodeValue;
    functions?: Map<string, Function | ObservableComputed<any>>;
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
export interface ObservablePersistenceConfigLocalOptions {
    onLoadError?: (error: Error) => void;
    onSaveError?: (error: Error) => void;
    indexedDB?: {
        databaseName: string;
        version: number;
        tableNames: string[];
    };
}
export interface ObservablePersistenceConfig {
    persistLocal?: ClassConstructor<ObservablePersistLocal>;
    persistRemote?: ClassConstructor<ObservablePersistRemote>;
    persistLocalOptions?: ObservablePersistenceConfigLocalOptions;
    saveTimeout?: number;
    dateModifiedKey?: string;
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
