/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore
import type { MMKVConfiguration } from 'react-native-mmkv';
// @ts-ignore
import type { AsyncStorageStatic } from '@react-native-async-storage/async-storage';

import {
    Change,
    ClassConstructor,
    LinkedOptions,
    NodeValue,
    RetryOptions,
    SetParams,
    UpdateFn,
    UpdateFnParams,
} from './observableInterfaces';
import { Observable, ObservableParam, ObservableState } from './observableTypes';

export interface PersistOptions<T = any> {
    name: string;
    plugin?: ClassConstructor<ObservablePersistPlugin, T[]>;
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
    setMode: (mode: GetMode) => void;
    refresh: () => void;
}

export type SyncedSetParams<T> = SetParams<T> & {
    node: NodeValue;
    valuePrevious: T;
    update: UpdateFn;
    refresh: () => void;
    cancelRetry: () => void;
    retryNum: number;
    fromSubscribe: boolean | undefined;
};

export type GetMode = 'set' | 'assign' | 'merge' | 'append' | 'prepend';

export interface SyncedOptions<T = any> extends Omit<LinkedOptions<T>, 'get' | 'set'> {
    get?: (params: SyncedGetParams) => Promise<T> | T;
    set?: (params: SyncedSetParams<T>) => void | Promise<any>;
    subscribe?: (params: { node: NodeValue; update: UpdateFn; refresh: () => void }) => void;
    retry?: RetryOptions;
    offlineBehavior?: false | 'retry';
    persist?: PersistOptions<any>;
    debounceSet?: number;
    syncMode?: 'auto' | 'manual';
    mode?: GetMode;
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

export interface SyncedOptionsGlobal<T = any> extends Omit<SyncedOptions<T>, 'get' | 'set' | 'persist'> {
    persist?: ObservablePersistPluginOptions & { plugin?: ClassConstructor<ObservablePersistPlugin, T[]> };
}

export interface ObservablePersistPluginOptions {
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
export interface ObservablePersistPlugin {
    initialize?(config: ObservablePersistPluginOptions): void | Promise<void>;
    loadTable?(table: string, config: PersistOptions): Promise<any> | void;
    getTable<T = any>(table: string, init: object, config: PersistOptions): T;
    set(table: string, changes: Change[], config: PersistOptions): Promise<any> | void;
    deleteTable(table: string, config: PersistOptions): Promise<any> | void;
    getMetadata(table: string, config: PersistOptions): PersistMetadata;
    setMetadata(table: string, metadata: PersistMetadata, config: PersistOptions): Promise<any> | void;
    deleteMetadata(table: string, config: PersistOptions): Promise<any> | void;
}
export interface PersistMetadata {
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
    options: SyncedOptions<T>;
    changes: Change[];
    value: T;
    valuePrevious: T;
}
export interface ObservableSyncGetParams<T> {
    state: Observable<ObservableSyncState>;
    obs: ObservableParam<T>;
    options: SyncedOptions<T>;
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
