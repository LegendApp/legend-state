/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore
import type { MMKVConfiguration } from 'react-native-mmkv';
// @ts-ignore
import type { AsyncStorageStatic } from '@react-native-async-storage/async-storage';
// @ts-ignore
import type { DatabaseReference, Query } from 'firebase/database';

import type { GetMode } from './syncTypes';
import type {
    ArrayValue,
    Change,
    ClassConstructor,
    LinkedParams,
    RecordValue,
    RetryOptions,
    Selector,
    TypeAtPath,
} from './observableInterfaces';
import type { Observable, ObservableParam, ObservableState } from './observableTypes';

export interface PersistTransform<TOrig = any, TSaved = TOrig> {
    load?: (value: TSaved) => TOrig | Promise<TOrig>;
    save?: (value: TOrig) => TSaved | Promise<TSaved>;
}

export interface LegacyPersistOptionsLocal<T = any> {
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
export type LegacyPersistOptionsRemote<T = any> = ObservablePersistenceConfigRemoteGlobalOptions & {
    readonly?: boolean;
    waitForGet?: Selector<any>;
    waitForSet?: LinkedParams['waitForSet'];
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
    debounceSet?: number;
    dateModifiedKey?: string;
    offlineBehavior?: false | 'retry';
    retry?: RetryOptions;
    onGetError?: (error: Error) => void;
    onSetError?: (error: Error) => void;
    log?: (logLevel: 'verbose' | 'warning' | 'error', message: any, ...optionalParams: any[]) => void;
    onBeforeSet?: () => void;
    onAfterSet?: () => void;
}
export interface ObservablePersistenceConfig {
    pluginLocal?: ClassConstructor<ObservablePersistLocal>;
    pluginRemote?: ClassConstructor<ObservablePersistRemoteClass> | ObservablePersistRemoteFunctions;
    localOptions?: ObservablePersistenceConfigLocalGlobalOptions;
    remoteOptions?: ObservablePersistenceConfigRemoteGlobalOptions;
}
export interface LegacyPersistOptions<T = any> {
    local?: string | LegacyPersistOptionsLocal<T>;
    remote?: LegacyPersistOptionsRemote<T>;
    pluginLocal?: ClassConstructor<ObservablePersistLocal>;
    pluginRemote?: ClassConstructor<ObservablePersistRemoteClass> | ObservablePersistRemoteFunctions<T>;
}

export interface PersistMetadata {
    id?: '__legend_metadata';
    // modified ?: number;
    lastSync?: number;
    pending?: any;
}

export interface ObservablePersistLocal {
    initialize?(config: ObservablePersistenceConfigLocalGlobalOptions): void | Promise<void>;
    loadTable?(table: string, config: LegacyPersistOptionsLocal): Promise<any> | void;
    getTable<T = any>(table: string, config: LegacyPersistOptionsLocal): T;
    set(table: string, changes: Change[], config: LegacyPersistOptionsLocal): Promise<any> | void;
    deleteTable(table: string, config: LegacyPersistOptionsLocal): Promise<any> | void;
    getMetadata(table: string, config: LegacyPersistOptionsLocal): PersistMetadata;
    setMetadata(table: string, metadata: PersistMetadata, config: LegacyPersistOptionsLocal): Promise<any> | void;
    deleteMetadata(table: string, config: LegacyPersistOptionsLocal): Promise<any> | void;
}
export interface ObservableOnChangeParams {
    value: unknown;
    path?: string[]; // TODOv4 remove
    pathTypes?: TypeAtPath[]; // TODOv4 remove
    mode?: GetMode;
    dateModified?: number | undefined; // TODOv4 remove
    lastSync?: number | undefined;
}
export interface ObservablePersistRemoteSetParams<T> {
    syncState: Observable<ObservablePersistState>;
    obs: ObservableParam<T>;
    options: LegacyPersistOptions<T>;
    changes: Change[];
    value: T;
}
export interface ObservablePersistRemoteGetParams<T> {
    state: Observable<ObservablePersistState>;
    obs: ObservableParam<T>;
    options: LegacyPersistOptions<T>;
    dateModified?: number;
    lastSync?: number;
    mode?: GetMode;
    onGet: () => void;
    onError: (error: Error) => void;
    onChange: (params: ObservableOnChangeParams) => void | Promise<void>;
}
export type ObservablePersistRemoteGetFnParams<T> = Omit<ObservablePersistRemoteGetParams<T>, 'onGet'>;

export interface ObservablePersistRemoteClass {
    get?<T>(params: ObservablePersistRemoteGetParams<T>): void;
    set?<T>(
        params: ObservablePersistRemoteSetParams<T>,
    ): void | Promise<void | { changes?: object; dateModified?: number; lastSync?: number; pathStrs?: string[] }>;
}

export interface ObservablePersistRemoteFunctions<T = any> {
    get?(params: ObservablePersistRemoteGetFnParams<T>): T | Promise<T>;
    set?(
        params: ObservablePersistRemoteSetParams<T>,
    ): void | Promise<void | { changes?: object | undefined; dateModified?: number; lastSync?: number }>;
}

export interface ObservablePersistStateBase {
    isLoadedLocal: boolean;
    isEnabledLocal: boolean;
    isEnabledRemote: boolean;
    dateModified?: number;
    lastSync?: number;
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

export type QueryByModified<T> =
    | boolean
    | {
          [K in keyof T]?: QueryByModified<T[K]>;
      }
    | {
          '*'?: boolean;
      };
