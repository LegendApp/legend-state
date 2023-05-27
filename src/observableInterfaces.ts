import type { symbolOpaque } from './globals';

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

export type TrackingType = undefined | true | 'shallow' | 'optimize' | symbol; // true === shallow

export interface MapGet<T extends Map<any, any> | WeakMap<any, any>> {
    get(key: Parameters<T['get']>[0]): ObservableChild<Parameters<T['set']>[1]>;
    get(): T;
}
export interface ObservableBaseFns<T> {
    peek(): T;
    get(trackingType?: TrackingType): T;
    onChange(
        cb: ListenerFn<T>,
        options?: { trackingType?: TrackingType; initial?: boolean; immediate?: boolean; noArgs?: boolean }
    ): ObservableListenerDispose;
}
interface ObservablePrimitiveFnsBase<T> extends ObservableBaseFns<T> {
    delete(): ObservablePrimitiveFnsBase<T>;
    set(value: T | CallbackSetter<T>): ObservablePrimitiveChild<T>;
}

interface ObservablePrimitiveFnsBoolean<T> {
    toggle(): T;
}

export type ObservablePrimitiveFns<T> = [T] extends [boolean]
    ? ObservablePrimitiveFnsBase<T> & ObservablePrimitiveFnsBoolean<T>
    : ObservablePrimitiveFnsBase<T>;

export interface ObservablePrimitiveChildFns<T> extends ObservablePrimitiveFnsBase<T> {
    delete(): ObservablePrimitiveChild<T>;
}

export interface ObservableObjectFns<T> extends ObservableBaseFns<T> {
    set(value: T | CallbackSetter<T>): ObservableChild<T>;
    assign(value: T | Partial<T>): ObservableChild<T>;
    delete(): ObservableChild<T>;
}

type CallbackSetter<T> = {
    bivarianceHack(prev: T): T;
}['bivarianceHack'];

export type ObservableFns<T> = ObservablePrimitiveFns<T> | ObservableObjectFns<T>;

export type ObservablePrimitive<T> = ObservablePrimitiveFns<T>;

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

// eslint-disable-next-line @typescript-eslint/ban-types
type Recurse<T, K extends keyof T, TRecurse> = T[K] extends Function | Promise<any>
    ? T[K]
    : T[K] extends Map<any, any> | WeakMap<any, any>
    ? Omit<T[K], 'get'> & Omit<ObservablePrimitiveFnsBase<T[K]>, 'get'> & MapGet<T[K]>
    : T[K] extends Set<any> | WeakSet<any>
    ? T[K] & ObservablePrimitiveFnsBase<T[K]>
    : T[K] extends OpaqueObject<T[K]>
    ? T[K] & ObservablePrimitiveChildFns<T[K]>
    : T[K] extends Primitive
    ? ObservablePrimitiveChild<T[K]>
    : T[K] extends Array<any>
    ? ObservableObjectFns<T[K]> & ObservableArrayOverride<T[K][number]>
    : T extends object
    ? TRecurse
    : T[K];

type ObservableFnsRecursivePrimitiveKeysSafe<T> = {
    [K in keyof T]: Recurse<T, K, ObservableObject<T[K]>>;
};
type ObservableFnsRecursivePrimitiveKeys<T> = {
    [K in keyof T]: Recurse<T, K, ObservableObject<T[K]>>;
} & {
    [K in keyof StringKeys<T> as `_${K}`]: T[K];
};
type ObservableFnsRecursiveNonPrimitiveKeysSafe<T> = {
    readonly [K in keyof T]: Recurse<T, K, ObservableObject<T[K]>>;
};
type ObservableFnsRecursiveNonPrimitiveKeys<T> = {
    readonly [K in keyof T]: Recurse<T, K, ObservableObject<T[K]>>;
} & {
    [K in keyof StringKeys<T> as `_${K}`]: T[K];
};
type ObservableFnsRecursive<T> = ObservableFnsRecursiveNonPrimitiveKeys<NonPrimitiveKeys<T>> &
    ObservableFnsRecursivePrimitiveKeys<PrimitiveKeys<T>>;
type ObservableFnsRecursiveSafe<T> = ObservableFnsRecursiveNonPrimitiveKeysSafe<NonPrimitiveKeys<T>> &
    ObservableFnsRecursivePrimitiveKeysSafe<PrimitiveKeys<T>>;

type ObservableComputedFnsRecursive<T> = {
    readonly [K in keyof T]: Recurse<T, K, ObservableBaseFns<T[K]>>;
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
    initialize?(config: ObservablePersistenceConfig['persistLocalOptions']): Promise<void>;
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
export type ObservableValue<T> = T extends Observable<infer t> | ObservableSafe<infer t> ? t : never;

// This converts the state object's shape to the field transformer's shape
// TODO: FieldTransformer and this shape can likely be refactored to be simpler
declare type StringKeys<T> = Pick<
    T,
    {
        [K in keyof T]-?: K extends string ? K : never;
    }[keyof T]
>;
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

export type Selector<T> = ObservableReadable<T> | (() => T) | T;

export type ClassConstructor<I, Args extends any[] = any[]> = new (...args: Args) => I;
export type ObservableListenerDispose = () => void;

export interface ObservableWrapper {
    _: any;
    locked?: boolean;
    set?: (value: any) => void;
    activate?: () => void;
}

export type Primitive = boolean | string | number | Date;
export type NotPrimitive<T> = T extends Primitive ? never : T;

export type ObservableArray<T extends any[]> = ObservableObjectFns<T> & ObservableArrayOverride<T[number]>;
export type ObservableObject<T = any> = ObservableFnsRecursive<T> & ObservableObjectFns<T>;
export type ObservableObjectSafe<T = any> = ObservableFnsRecursiveSafe<T> & ObservableObjectFns<T>;
export type ObservableChild<T = any> = [T] extends [Primitive] ? ObservablePrimitiveChild<T> : ObservableObject<T>;
export type ObservablePrimitiveChild<T = any> = [T] extends [boolean]
    ? ObservablePrimitiveChildFns<T> & ObservablePrimitiveFnsBoolean<T>
    : ObservablePrimitiveChildFns<T>;

export type ObservableObjectOrArray<T> = T extends any[] ? ObservableArray<T> : ObservableObject<T>;
export type ObservableObjectOrArraySafe<T> = T extends any[] ? ObservableArray<T> : ObservableObjectSafe<T>;

export type ObservableComputed<T = any> = ObservableBaseFns<T> & ObservableComputedFnsRecursive<T>;
export type ObservableComputedTwoWay<T = any, T2 = T> = ObservableComputed<T> & ObservablePrimitiveFnsBase<T2>;
type Equals<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
export type Observable<T = any> = Equals<T, any> extends true
    ? ObservableObject<any>
    : [T] extends [object]
    ? ObservableObjectOrArray<T>
    : ObservablePrimitive<T>;
export type ObservableSafe<T = any> = Equals<T, any> extends true
    ? ObservableObject<any>
    : [T] extends [object]
    ? ObservableObjectOrArraySafe<T>
    : ObservablePrimitive<T>;

export type ObservableReadable<T = any> =
    | ObservableBaseFns<T>
    | ObservablePrimitiveFnsBase<T>
    | ObservablePrimitiveChildFns<T>
    | ObservableObjectFns<T>;

export type ObservableWriteable<T = any> = ObservableReadable<T> & {
    set: (value: T | ((prev: T) => T)) => void;
    delete?: () => void;
};

export interface NodeValueListener {
    track: TrackingType;
    noArgs?: boolean;
    listener: ListenerFn;
}

interface BaseNodeValue {
    children?: Map<string, ChildNodeValue>;
    proxy?: object;
    isActivatedPrimitive?: boolean;
    root: ObservableWrapper;
    listeners?: Set<NodeValueListener>;
    listenersImmediate?: Set<NodeValueListener>;
    descendantHasListener?: boolean;
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
