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
    NodeValue,
    Observable,
    ObservableParam,
    ObservableSyncState,
    RetryOptions,
    SetParams,
    UpdateFn,
} from '@legendapp/state';

export interface PersistOptions<T = any> {
    name: string;
    plugin?: ClassConstructor<ObservablePersistPlugin, T[]>;
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

export interface SyncedGetParams {
    value: any;
    lastSync: number | undefined;
    updateLastSync: (lastSync: number) => void;
    mode: GetMode;
    refresh: () => void;
    retryNum: number;
    cancelRetry: () => void;
    onError: (error: Error) => void;
    options: SyncedOptions;
}

export interface SyncedSetParams<T> extends Pick<SetParams<T>, 'changes' | 'value'> {
    node: NodeValue;
    valuePrevious: T;
    update: UpdateFn<T>;
    refresh: () => void;
    cancelRetry: () => void;
    retryNum: number;
    onError: (error: Error) => void;
}

export interface SyncedSubscribeParams<T = any> {
    node: NodeValue;
    value$: ObservableParam<T>;
    lastSync: number | undefined;
    update: UpdateFn<T>;
    refresh: () => void;
    onError: (error: Error) => void;
}

export interface SyncedOptions<TRemote = any, TLocal = TRemote> extends Omit<LinkedOptions<TRemote>, 'get' | 'set'> {
    get?: (params: SyncedGetParams) => Promise<TRemote> | TRemote;
    set?: (params: SyncedSetParams<TRemote>) => void | Promise<any>;
    subscribe?: (params: SyncedSubscribeParams<TRemote>) => (() => void) | void;
    retry?: RetryOptions;
    persist?: PersistOptions<any>;
    debounceSet?: number;
    syncMode?: 'auto' | 'manual';
    mode?: GetMode;
    transform?: SyncTransform<TLocal, TRemote>;
    onGetError?: (error: Error, getParams: SyncedGetParams | undefined, source: 'get' | 'subscribe') => void;
    onSetError?: (error: Error, setParams: SyncedSetParams<TRemote>) => void;
    onBeforeSet?: () => void;
    onAfterSet?: () => void;
    // Not implemented yet
    log?: (message?: any, ...optionalParams: any[]) => void;
}

export interface SyncedOptionsGlobal<T = any>
    extends Omit<
        SyncedOptions<T>,
        'get' | 'set' | 'persist' | 'initial' | 'waitForSet' | 'waitFor' | 'transform' | 'subscribe'
    > {
    persist?: ObservablePersistPluginOptions & Omit<PersistOptions, 'name' | 'transform' | 'options'>;
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
    valuePrevious: T;
}

export interface ObservableSyncFunctions<T = any> {
    get?(params: SyncedGetParams): T | Promise<T>;
    set?(
        params: ObservableSyncSetParams<T>,
    ): void | Promise<void | { changes?: object | undefined; dateModified?: number; lastSync?: number }>;
}

export interface SubscribeOptions {
    node: NodeValue;
    update: UpdateFn;
    refresh: () => void;
}

export type Synced<T> = T;
