import type { AsyncStorageStatic } from '@react-native-async-storage/async-storage';
import { DatabaseReference, Query } from 'firebase/database';
import type { symbolActivator, symbolGetNode, symbolOpaque } from './globals';
import type {
    Observable as ObservableNew,
    Observable,
    ObservableReadable as ObservableReadableNew,
    ObservableReadable,
    ObservableComputed as ObservableComputedNew,
    ObservableState,
    WithState,
    ObservableComputed,
    ObservableComputedTwoWay,
} from './observableTypes';

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

export type TrackingType = undefined | true | symbol; // true === shallow

export interface GetOptions {
    shallow: boolean;
}

export type OpaqueObject<T> = T & { [symbolOpaque]: true };

export interface ListenerParams<T = any> {
    value: T;
    getPrevious: () => T;
    changes: Change[];
}

export type ListenerFn<T = any> = (params: ListenerParams<T>) => void;

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
    metadataTimeout?: number;
    retry?: RetryOptions;
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
export interface PersistOptions<T = any> {
    local?: string | PersistOptionsLocal<T>;
    remote?: PersistOptionsRemote<T>;
    pluginLocal?: ClassConstructor<ObservablePersistLocal>;
    pluginRemote?: ClassConstructor<ObservablePersistRemoteClass> | ObservablePersistRemoteFunctions<T>;
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
export interface ObservableOnChangeParams {
    value: unknown;
    path?: string[];
    pathTypes?: TypeAtPath[];
    mode?: 'assign' | 'set' | 'dateModified';
    dateModified?: number | undefined;
}
export interface ObservablePersistRemoteSetParams<T> {
    syncState: Observable<ObservablePersistState>;
    obs: Observable<T>;
    options: PersistOptions<T>;
    changes: Change[];
    value: T;
}
export interface ObservablePersistRemoteGetParams<T> {
    state: Observable<ObservablePersistState>;
    obs: ObservableReadable<T>;
    options: PersistOptions<T>;
    dateModified?: number;
    mode?: 'assign' | 'set' | 'dateModified';
    onGet: () => void;
    onError: (error: Error) => void;
    onChange: (params: ObservableOnChangeParams) => void | Promise<void>;
}
export type ObservablePersistRemoteGetFnParams<T> = Omit<ObservablePersistRemoteGetParams<T>, 'onGet'>;

export interface ObservablePersistRemoteClass {
    get?<T>(params: ObservablePersistRemoteGetParams<T>): void;
    set?<T>(
        params: ObservablePersistRemoteSetParams<T>,
    ): void | Promise<void | { changes?: object; dateModified?: number; pathStrs?: string[] }>;
}

export interface ObservablePersistRemoteFunctions<T = any> {
    get?(params: ObservablePersistRemoteGetFnParams<T>): T | Promise<T>;
    set?(
        params: ObservablePersistRemoteSetParams<T>,
    ): void | Promise<void | { changes?: object | undefined; dateModified?: number }>;
}

export interface ObservablePersistStateBase {
    isLoadedLocal: boolean;
    isEnabledLocal: boolean;
    isEnabledRemote: boolean;
    dateModified?: number;
    syncCount?: number;
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
export type ObservablePersistState = ObservableState & ObservablePersistStateBase;
export type ObservablePersistStateInternal = ObservablePersistState & {
    refreshNum: number;
};
export interface WithPersistState {
    state?: ObservablePersistState; // TODOV3: remove this
    _state?: ObservablePersistState;
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

export type Selector<T> = ObservableReadableNew<T> | ObservableEvent | (() => T) | T;

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

export interface NodeValueListener {
    track: TrackingType;
    noArgs?: boolean;
    listener: ListenerFn;
}

interface BaseNodeValue {
    children?: Map<string, ChildNodeValue>;
    proxy?: object;
    // TODOV3 Remove this
    isActivatedPrimitive?: boolean;
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
    functions?: Map<string, Function | ObservableComputedNew<any>>;
    lazy?: boolean | Function;
    state?: ObservableNew<ObservablePersistState>;
    activated?: boolean;
    activationState2?: ActivateParams2 & { onError?: () => void; persistedRetry?: boolean };
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
} & Observable<T> & {
        [symbolGetNode]: NodeValue;
    };
export type ObservableProxyLink<T extends Record<string, any>> = {
    [K in keyof T]: Observable<T[K]>;
} & Observable<T> & {
        [symbolGetNode]: NodeValue;
    };
export type ObservableProxyTwoWay<T extends Record<string, any>, T2> = {
    [K in keyof T]: ObservableComputedTwoWay<T[K], T2>;
} & Observable<T> & {
        [symbolGetNode]: NodeValue;
    };
export interface CacheOptions<T = any> {
    local: string | PersistOptionsLocal<T>;
    pluginLocal?: ClassConstructor<ObservablePersistLocal, T[]>;
}
export interface ActivateParams<T = any> {
    obs$: Observable<T>;
    onSet: (fn: (params: ListenerParams<T>, extra: OnSetExtra) => void | Promise<any>) => void;
    subscribe: (fn: (params: { update: UpdateFn; refresh: () => void }) => void) => void;
}
export interface ActivateProxyParams<T = any> extends ActivateParams {
    proxy: (fn: (key: string, params: ActivateParams<T>) => T | Promise<T>) => void;
}
export interface ActivateGetParams {
    updateLastSync: (lastSync: number) => void;
    setMode: (mode: 'assign' | 'set') => void;
}
export interface ActivateParams2<T = any> {
    // TODO Merge params and extra
    onSet?: (params: ListenerParams<T extends Promise<infer t> ? t : T>, extra: OnSetExtra) => void | Promise<any>;
    subscribe?: (params: { node: NodeValue; update: UpdateFn; refresh: () => void }) => void;
    waitFor?: Selector<any>;
    initial?: T extends Promise<infer t> ? t : T;
    get?: (params: ActivateGetParams) => T;
    retry?: RetryOptions;
    mode?: 'assign' | 'set' | 'dateModified';
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface ActivateParams2WithLookup<T extends Record<string, any> = Record<string, any>>
    extends ActivateParams2<RecordValue<T>> {
    lookup: (key: string) => RecordValue<T> | Promise<RecordValue<T>>;
}

export type UpdateFn = (params: {
    value: unknown;
    mode?: 'assign' | 'set' | 'dateModified';
    dateModified?: number | undefined;
}) => void;
export interface RetryOptions {
    infinite?: boolean;
    times?: number;
    delay?: number;
    backoff?: 'constant' | 'exponential';
    maxDelay?: number;
}
export interface OnSetExtra {
    node: NodeValue;
    update: UpdateFn;
    refresh: () => void;
    fromSubscribe: boolean | undefined;
}
export interface SubscribeOptions {
    node: NodeValue;
    update: UpdateFn;
    refresh: () => void;
}
export interface CacheReturnValue {
    dateModified: number;
    value: any;
}
