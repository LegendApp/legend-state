import type { AsyncStorageStatic } from '@react-native-async-storage/async-storage';
import { DatabaseReference, Query, get } from 'firebase/database';
import { Change, Observable, TypeAtPath } from 'src/observableTypes';

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

export type ClassConstructor<I, Args extends any[] = any[]> = new (...args: Args) => I;

export type QueryByModified<T> =
    | boolean
    | {
          [K in keyof T]?: QueryByModified<T[K]>;
      }
    | {
          '*'?: boolean;
      };

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
    waitForGet?: Promise<any> | Observable<any>;
    waitForSet?: Promise<any> | Observable<any>;
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
    obs: Observable<T>;
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
