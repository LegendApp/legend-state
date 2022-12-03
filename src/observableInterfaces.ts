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

export type TrackingType = undefined | true; // true === shallow

/** @internal */
export type TrackingTypeInternal = undefined | true | 'optimize'; // true === shallow

export interface ObservableBaseFns<T> {
    peek(): T;
    get(trackingType?: TrackingType): T;
    onChange(cb: ListenerFn<T>, trackingType?: TrackingType): ObservableListenerDispose;
}
interface ObservablePrimitiveFnsBase<T> extends ObservableBaseFns<T> {
    set(value: T | ((prev: T) => T)): ObservablePrimitiveChild<T>;
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
    set(value: T | ((prev: T) => T)): ObservableChild<T>;
    assign(value: T | Partial<T>): ObservableChild<T>;
    delete(): ObservableChild<T>;
}
export type ObservableFns<T> = ObservablePrimitiveFns<T> | ObservableObjectFns<T>;

export type ObservablePrimitive<T> = ObservablePrimitiveFns<T>;

export type OpaqueObject<T> = T & { [symbolOpaque]: true };

type ArrayOverrideFnNames = 'every' | 'some' | 'filter' | 'reduce' | 'reduceRight' | 'forEach' | 'map';
export interface ObservableArrayOverride<T> extends Omit<Array<T>, 'forEach' | 'map'> {
    /**
     * Performs the specified action for each element in an array.
     * @param callbackfn  A function that accepts up to three arguments. forEach calls the callbackfn function one time for each element in the array.
     * @param thisArg  An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
     */
    forEach(callbackfn: (value: T, index: number, array: T[]) => void, thisArg?: any): void;
    /**
     * Calls a defined callback function on each element of an array, and returns an array that contains the results.
     * @param callbackfn A function that accepts up to three arguments. The map method calls the callbackfn function one time for each element in the array.
     * @param thisArg An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
     */
    map<U>(callbackfn: (value: T, index: number, array: T[]) => U, thisArg?: any): U[];
}

export type ListenerFn<T = any> = (
    value: T,
    getPrevious: () => T,
    changes: {
        path: (string | number)[];
        valueAtPath: any;
        prevAtPath: any;
    }[],
    node: NodeValue
) => void;

type PrimitiveKeys<T> = Pick<T, { [K in keyof T]-?: T[K] extends Primitive ? K : never }[keyof T]>;
type NonPrimitiveKeys<T> = Pick<T, { [K in keyof T]-?: T[K] extends Primitive ? never : K }[keyof T]>;

type Recurse<T, K extends keyof T, TRecurse> = T[K] extends
    | Function
    | Map<any, any>
    | WeakMap<any, any>
    | Set<any>
    | WeakSet<any>
    | Promise<any>
    ? T[K]
    : T[K] extends OpaqueObject<T[K]>
    ? T[K] & ObservablePrimitiveChild<T[K]>
    : T[K] extends Primitive
    ? ObservablePrimitiveChild<T[K]>
    : T[K] extends Array<any>
    ? Omit<T[K], ArrayOverrideFnNames> &
          ObservableObjectFns<T[K]> &
          ObservableArrayOverride<ObservableObject<T[K][number]>>
    : T extends object
    ? TRecurse
    : T[K];

type ObservableFnsRecursiveUnsafe<T> = {
    [K in keyof T]: Recurse<T, K, ObservableObject<T[K]>>;
};
type ObservableFnsRecursiveSafe<T> = {
    readonly [K in keyof T]: Recurse<T, K, ObservableObject<T[K]>>;
};
type ObservableFnsRecursive<T> = ObservableFnsRecursiveSafe<NonPrimitiveKeys<T>> &
    ObservableFnsRecursiveUnsafe<PrimitiveKeys<T>>;

type ObservableComputedFnsRecursive<T> = {
    readonly [K in keyof T]: Recurse<T, K, ObservableBaseFns<T[K]>>;
};

export interface ObservableEvent {
    fire(): void;
    on(cb?: () => void): ObservableListenerDispose;
    on(eventType: 'change', cb?: () => void): ObservableListenerDispose;
    get(): void;
}

export type QueryByModified<T> =
    | boolean
    | {
          [K in keyof T]?: QueryByModified<T[K]>;
      };

export interface Change {
    path: (string | number)[];
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
    mmkv?: MMKVConfiguration;
    indexedDB?: {
        prefixID?: string;
        itemID?: string;
    };
}
export interface PersistOptionsRemote<T = any> {
    readonly?: boolean;
    once?: boolean;
    requireAuth?: boolean;
    saveTimeout?: number;
    manual?: boolean;
    adjustData?: {
        load?: (value: T, basePath: string) => T | Promise<T>;
        save?: (value: T, basePath: string, path: string[]) => T | Promise<T>;
    };
    firebase?: {
        syncPath: (uid: string) => `/${string}/`;
        fieldTransforms?: FieldTransforms<T>;
        queryByModified?: QueryByModified<T>;
        ignoreKeys?: string[];
    };
}
export interface PersistOptions<T = any> {
    local?: string | PersistOptionsLocal<T>;
    remote?: PersistOptionsRemote<T>;
    persistLocal?: ClassConstructor<ObservablePersistLocal>;
    persistRemote?: ClassConstructor<ObservablePersistRemote>;
    dateModifiedKey?: string;
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
    set(table: string, value: any, changes: Change[], config: PersistOptionsLocal): Promise<void>;
    updateMetadata(table: string, metadata: PersistMetadata, config: PersistOptionsLocal): Promise<void>;
    deleteTable(table: string, config: PersistOptionsLocal): Promise<void>;
    loadTable?(table: string, config: PersistOptionsLocal): void | Promise<void>;
}
export interface ObservablePersistLocalAsync extends ObservablePersistLocal {
    preload(path: string): Promise<void>;
}
export interface ObservablePersistRemote {
    save<T>(
        options: PersistOptions<T>,
        value: T,
        path: (string | number)[],
        valueAtPath: any,
        prevAtPath: any
    ): Promise<T>;
    listen<T>(
        obs: ObservableReadable<T>,
        options: PersistOptions<T>,
        onLoad: () => void,
        onChange: (cb: () => void) => void
    ): void;
}

export interface ObservablePersistState {
    isLoadedLocal: boolean;
    isLoadedRemote: boolean;
    isEnabledLocal: boolean;
    isEnabledRemote: boolean;
    clearLocal: () => Promise<void>;
    sync: () => Promise<void>;
}
export type RecordValue<T> = T extends Record<string, infer t> ? t : never;
export type ArrayValue<T> = T extends Array<infer t> ? t : never;

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
    };

export type Selector<T> = ObservableReadable<T> | (() => T) | T;

export type ClassConstructor<I, Args extends any[] = any[]> = new (...args: Args) => I;
export type ObservableListenerDispose = () => void;

export interface ObservableWrapper {
    _: any;
    locked?: boolean;
    activate?: () => void;
}

export type Primitive = boolean | string | number | Date;
export type NotPrimitive<T> = T extends Primitive ? never : T;

export type ObservableArray<T extends any[]> = Omit<T, ArrayOverrideFnNames> &
    ObservableObjectFns<T> &
    ObservableArrayOverride<ObservableObject<T[number]>>;
export type ObservableObject<T = any> = ObservableFnsRecursive<T> & ObservableObjectFns<T>;
export type ObservableChild<T = any> = [T] extends [Primitive] ? ObservablePrimitiveChild<T> : ObservableObject<T>;
export type ObservablePrimitiveChild<T = any> = [T] extends [boolean]
    ? ObservablePrimitiveChildFns<T> & ObservablePrimitiveFnsBoolean<T>
    : ObservablePrimitiveChildFns<T>;

// ObservablePrimitiveChildFns<T>;

export type ObservableObjectOrArray<T> = T extends any[] ? ObservableArray<T> : ObservableObject<T>;

export type ObservableComputed<T = any> = ObservableBaseFns<T> & ObservableComputedFnsRecursive<T>;
export type Observable<T = any> = [T] extends [object] ? ObservableObjectOrArray<T> : ObservablePrimitive<T>;

export type ObservableReadable<T = any> =
    | ObservableBaseFns<T>
    | ObservablePrimitiveFnsBase<T>
    | ObservablePrimitiveChildFns<T>
    | ObservableObjectFns<T>;
export type ObservableWriteable<T = any> =
    | ObservablePrimitiveFnsBase<T>
    | ObservablePrimitiveChildFns<T>
    | ObservableObjectFns<T>;

interface NodeValueListener {
    track: TrackingType;
    noArgs?: boolean;
    listener: ListenerFn;
}

interface BaseNodeValue {
    id: number;
    children?: Map<string | number, ChildNodeValue>;
    proxy?: object;
    isActivatedPrimitive?: boolean;
    root: ObservableWrapper;
    listeners?: Set<NodeValueListener>;
}

export interface RootNodeValue extends BaseNodeValue {
    parent?: undefined;
    key?: undefined;
}

export interface ChildNodeValue extends BaseNodeValue {
    parent: NodeValue;
    key: string | number;
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
export interface ObservablePersistenceConfig {
    persistLocal?: ClassConstructor<ObservablePersistLocal>;
    persistRemote?: ClassConstructor<ObservablePersistRemote>;
    persistLocalOptions?: {
        indexedDB?: {
            databaseName: string;
            version: number;
            tableNames: string[];
        };
    };
    saveTimeout?: number;
    dateModifiedKey?: string;
}
