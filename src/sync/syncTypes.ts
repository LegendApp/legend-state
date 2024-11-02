/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore
import type { MMKVConfiguration } from 'react-native-mmkv';
// @ts-ignore
import type { AsyncStorageStatic } from '@react-native-async-storage/async-storage';

import type {
    Change,
    ClassConstructor,
    GetMode,
    LinkedOptions,
    NodeInfo,
    Observable,
    ObservableParam,
    ObservableSyncState,
    RetryOptions,
    SetParams,
    TypeAtPath,
    UpdateFn,
    UpdateSetFn,
} from '@legendapp/state';

export interface PersistOptions<T = any> {
    name?: string;
    plugin?: ClassConstructor<ObservablePersistPlugin, T[]> | ObservablePersistPlugin;
    retrySync?: boolean;
    transform?: SyncTransform<T>;
    readonly?: boolean;
    mmkv?: MMKVConfiguration;
    indexedDB?: {
        prefixID?: string;
        itemID?: string;
    };
    options?: any;
}

export interface SyncedGetSetSubscribeBaseParams<T = any> {
    node: NodeInfo;
    value$: ObservableParam<T>;
    refresh: () => void;
}

export interface SyncedGetSetBaseParams<T = any> extends SyncedGetSetSubscribeBaseParams<T>, OnErrorRetryParams {}

export interface OnErrorRetryParams {
    retryNum: number;
    cancelRetry: boolean;
}

export interface SyncedGetParams<T> extends SyncedGetSetBaseParams<T> {
    value: any;
    lastSync: number | undefined;
    updateLastSync: (lastSync: number) => void;
    mode: GetMode;
    onError: (error: Error, params: SyncedErrorParams) => void;
    options: SyncedOptions;
}

export interface SyncedSetParams<T> extends Pick<SetParams<T>, 'changes' | 'value'>, SyncedGetSetBaseParams<T> {
    update: UpdateSetFn<T>;
    onError: (error: Error, params: SyncedErrorParams) => void;
}

export interface SyncedSubscribeParams<T = any> extends SyncedGetSetSubscribeBaseParams<T> {
    lastSync: number | undefined;
    update: UpdateFn<T>;
    onError: (error: Error) => void;
}

export interface SyncedErrorParams {
    source: 'get' | 'set' | 'subscribe';
    type: 'get' | 'set';
    retry: OnErrorRetryParams;
    getParams?: SyncedGetParams<any>;
    setParams?: SyncedSetParams<any>;
    subscribeParams?: SyncedSubscribeParams<any>;
    input?: any;
    revert?: () => void;
}

export interface SyncedOptions<TRemote = any, TLocal = TRemote> extends Omit<LinkedOptions<TRemote>, 'get' | 'set'> {
    get?: (params: SyncedGetParams<TRemote>) => Promise<TRemote> | TRemote;
    set?: (params: SyncedSetParams<TRemote>) => void | Promise<any>;
    subscribe?: (params: SyncedSubscribeParams<TRemote>) => (() => void) | void;
    retry?: RetryOptions;
    persist?: PersistOptions<any>;
    debounceSet?: number;
    syncMode?: 'auto' | 'manual';
    mode?: GetMode;
    transform?: SyncTransform<TLocal, TRemote>;
    onBeforeGet?: (params: {
        value: TRemote;
        lastSync: number | undefined;
        pendingChanges: PendingChanges | undefined;
        cancel: boolean;
        clearPendingChanges: () => Promise<void>;
        resetCache: () => Promise<void>;
    }) => void;
    onBeforeSet?: (params: { cancel: boolean }) => void;
    onAfterSet?: () => void;
    onError?: (error: Error, params: SyncedErrorParams) => void;

    // Not implemented yet
    // log?: (message?: any, ...optionalParams: any[]) => void;
}

export interface SyncedOptionsGlobal<T = any>
    extends Omit<
        SyncedOptions<T>,
        'get' | 'set' | 'persist' | 'initial' | 'waitForSet' | 'waitFor' | 'transform' | 'subscribe'
    > {
    persist?: ObservablePersistPluginOptions & Omit<PersistOptions, 'name' | 'transform' | 'options'>;
}

export interface ObservablePersistIndexedDBPluginOptions {
    databaseName: string;
    version: number;
    tableNames: string[];
    deleteTableNames?: string[];
    onUpgradeNeeded?: (event: IDBVersionChangeEvent) => void;
}
export interface ObservablePersistAsyncStoragePluginOptions {
    AsyncStorage: AsyncStorageStatic;
    preload?: boolean | string[];
}

export interface ObservablePersistPluginOptions {
    onGetError?: (error: Error) => void;
    onSetError?: (error: Error) => void;
    indexedDB?: ObservablePersistIndexedDBPluginOptions;
    asyncStorage?: ObservablePersistAsyncStoragePluginOptions;
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
export type SyncTransformMethod = 'get' | 'set';
export interface SyncTransform<TLocal = any, TSaved = TLocal> {
    load?: (value: TSaved, method: SyncTransformMethod) => TLocal | Promise<TLocal>;
    save?: (value: TLocal) => TSaved | Promise<TSaved>;
}

export interface ObservableSyncSetParams<T> {
    syncState: Observable<ObservableSyncState>;
    value$: ObservableParam<T>;
    options: SyncedOptions<T>;
    changes: Change[];
    value: T;
}

export interface ObservableSyncFunctions<T = any> {
    get?(params: SyncedGetParams<T>): T | Promise<T>;
    set?(
        params: ObservableSyncSetParams<T>,
    ): void | Promise<void | { changes?: object | undefined; dateModified?: number; lastSync?: number }>;
}

export interface SubscribeOptions {
    node: NodeInfo;
    update: UpdateFn;
    refresh: () => void;
}

export type Synced<T> = T;
export type PendingChanges = Record<string, { p: any; v?: any; t: TypeAtPath[] }>;
