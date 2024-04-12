/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore
import type { MMKVConfiguration } from 'react-native-mmkv';
// @ts-ignore
import type { AsyncStorageStatic } from '@react-native-async-storage/async-storage';

import {
    Change,
    ClassConstructor,
    LinkedParams,
    NodeValue,
    RetryOptions,
    SetParams,
    UpdateFn,
    UpdateFnParams,
} from './observableInterfaces';
import { Observable, ObservableParam, ObservableState } from './observableTypes';

export interface CacheOptions<T = any> {
    name: string;
    plugin?: ClassConstructor<ObservableCachePlugin, T[]>;
    transform?: SyncTransform<T>;
    readonly?: boolean;
    mmkv?: MMKVConfiguration;
    indexedDB?: {
        prefixID?: string;
        itemID?: string;
    };
    options?: any;
}

export interface SyncedGetParams {
    value: any;
    lastSync: number | undefined;
    updateLastSync: (lastSync: number) => void;
    setMode: (mode: 'assign' | 'set') => void;
    refresh: () => void;
}

export type SyncedSetParams<T> = SetParams<T> & {
    node: NodeValue;
    update: UpdateFn;
    refresh: () => void;
    cancelRetry: () => void;
    retryNum: number;
    fromSubscribe: boolean | undefined;
};

export type GetMode = 'set' | 'assign' | 'merge' | 'append' | 'prepend';

export interface SyncedParams<T = any> extends Omit<LinkedParams<T>, 'get' | 'set'> {
    get?: (params: SyncedGetParams) => Promise<T> | T;
    set?: (params: SyncedSetParams<T>) => void | Promise<any>;
    subscribe?: (params: { node: NodeValue; update: UpdateFn; refresh: () => void }) => void;
    retry?: RetryOptions;
    offlineBehavior?: false | 'retry';
    cache?: CacheOptions<any>;
    debounceSet?: number;
    syncMode?: 'auto' | 'manual';
    getMode?: GetMode;
    transform?: SyncTransform<T>;
    // Not implemented yet
    enableSync?: boolean;
    onGetError?: (error: Error) => void;
    onSetError?: (error: Error) => void;
    log?: (message?: any, ...optionalParams: any[]) => void;
    onBeforeSet?: () => void;
    onAfterSet?: () => void;
    allowSetIfGetError?: boolean;
}

export interface SyncedParamsGlobal<T = any> extends Omit<SyncedParams<T>, 'get' | 'set' | 'cache'> {
    cache?: ObservableCachePluginOptions & { plugin?: ClassConstructor<ObservableCachePlugin, T[]> };
}

export interface ObservableCachePluginOptions {
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
export interface ObservableCachePlugin {
    initialize?(config: ObservableCachePluginOptions): void | Promise<void>;
    loadTable?(table: string, config: CacheOptions): Promise<any> | void;
    getTable<T = any>(table: string, config: CacheOptions): T;
    set(table: string, changes: Change[], config: CacheOptions): Promise<any> | void;
    deleteTable(table: string, config: CacheOptions): Promise<any> | void;
    getMetadata(table: string, config: CacheOptions): CacheMetadata;
    setMetadata(table: string, metadata: CacheMetadata, config: CacheOptions): Promise<any> | void;
    deleteMetadata(table: string, config: CacheOptions): Promise<any> | void;
}
export interface CacheMetadata {
    id?: '__legend_metadata';
    // modified ?: number;
    lastSync?: number;
    pending?: any;
}
export interface SyncTransform<TOrig = any, TSaved = TOrig> {
    load?: (value: TSaved) => TOrig | Promise<TOrig>;
    save?: (value: TOrig) => TSaved | Promise<TSaved>;
}
export interface ObservableSyncStateBase {
    isLoadedLocal: boolean;
    isEnabledLocal: boolean;
    isEnabledRemote: boolean;
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
export type ObservableSyncState = ObservableState & ObservableSyncStateBase;

export interface ObservableSyncSetParams<T> {
    syncState: Observable<ObservableSyncState>;
    obs: ObservableParam<T>;
    options: SyncedParams<T>;
    changes: Change[];
    value: T;
}
export interface ObservableSyncGetParams<T> {
    state: Observable<ObservableSyncState>;
    obs: ObservableParam<T>;
    options: SyncedParams<T>;
    dateModified?: number;
    lastSync?: number;
    mode?: GetMode;
    onGet: () => void;
    onError: (error: Error) => void;
    onChange: (params: UpdateFnParams) => void | Promise<void>;
}
export type ObservableSyncRemoteGetFnParams<T> = Omit<ObservableSyncGetParams<T>, 'onGet'>;

export interface ObservableSyncClass {
    get?<T>(params: ObservableSyncGetParams<T>): void;
    set?<T>(
        params: ObservableSyncSetParams<T>,
    ): void | Promise<void | { changes?: object; dateModified?: number; lastSync?: number; pathStrs?: string[] }>;
}

export interface ObservableSyncFunctions<T = any> {
    get?(params: ObservableSyncRemoteGetFnParams<T>): T | Promise<T>;
    set?(
        params: ObservableSyncSetParams<T>,
    ): void | Promise<void | { changes?: object | undefined; dateModified?: number; lastSync?: number }>;
}
