import type { symbolOpaque } from './globals';
import type { Observable, ObservableParam } from './observableTypes';
import type { CacheOptions, ObservablePersistState } from './persistTypes';

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

export type TypeAtPath = 'object' | 'array' | 'map' | 'set';

export interface Change {
    path: string[];
    pathTypes: TypeAtPath[];
    valueAtPath: any;
    prevAtPath: any;
}

export type RecordValue<T> = T extends Record<string, infer t> ? t : never;
export type ArrayValue<T> = T extends Array<infer t> ? t : never;
export type ObservableValue<T> = T extends Observable<infer t> ? t : never;

export type Selector<T> = ObservableParam<T> | ObservableEvent | (() => T) | T;

export type ClassConstructor<I, Args extends any[] = any[]> = new (...args: Args) => I;
export type ObservableListenerDispose = () => void;

export interface ObservableRoot {
    _: any;
    set?: (value: any) => void;
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
    root: ObservableRoot;
    listeners?: Set<NodeValueListener>;
    listenersImmediate?: Set<NodeValueListener>;
    isEvent?: boolean;
    linkedToNode?: NodeValue;
    linkedToNodeDispose?: () => void;
    activatedObserveDispose?: () => void;
    linkedFromNodes?: Set<NodeValue>;
    isSetting?: number;
    isAssigning?: number;
    isComputing?: boolean;
    parentOther?: NodeValue;
    functions?: Map<string, Function | Observable<any>>;
    lazy?: boolean;
    lazyFn?: Function;
    needsExtract?: boolean;
    state?: Observable<ObservablePersistState>;
    activated?: boolean;
    activationState?: SyncedParams & { onError?: () => void; persistedRetry?: boolean };
    dirtyFn?: () => void;
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
    cancel: boolean;
    nodes: Map<NodeValue, TrackingNode> | undefined;
    refresh: () => void;
    onCleanup?: () => void;
    onCleanupReaction?: () => void;
}

export type SetParams<T> = ListenerParams<T extends Promise<infer t> ? t : T>;
export type SyncedSetParams<T> = SetParams<T> & {
    node: NodeValue;
    update: UpdateFn;
    refresh: () => void;
    cancelRetry: () => void;
    retryNum: number;
    fromSubscribe: boolean | undefined;
};

export interface ComputedParams<T = any> {
    get?: () => T;
    set?: (params: SetParams<T>) => void | Promise<any>;
    waitFor?: Selector<any>;
    waitForSet?:
        | ((params: { value: T; changes: Change[] }) => any)
        | Promise<any>
        | ObservableParam<any>
        | ObservableEvent;
    initial?: T extends Promise<infer t> ? t : T;
}

export interface SyncedGetParams {
    value: any;
    lastSync: number | undefined;
    updateLastSync: (lastSync: number) => void;
    setMode: (mode: 'assign' | 'set') => void;
    refresh: () => void;
}
export interface SyncedParams<T = any> extends Omit<ComputedParams<T>, 'get' | 'set'> {
    get?: (params: SyncedGetParams) => T;
    set?: (params: SyncedSetParams<T>) => void | Promise<any>;
    subscribe?: (params: { node: NodeValue; update: UpdateFn; refresh: () => void }) => void;
    retry?: RetryOptions;
    offlineBehavior?: false | 'retry';
    cache?: CacheOptions<any>;
    debounceSet?: number;
}

export type UpdateFn = (params: {
    value: unknown;
    mode?: 'assign' | 'set' | 'lastSync' | 'dateModified' | 'merge';
    dateModified?: number | undefined;
    lastSync?: number | undefined;
}) => void;
export interface RetryOptions {
    infinite?: boolean;
    times?: number;
    delay?: number;
    backoff?: 'constant' | 'exponential';
    maxDelay?: number;
}

export interface SubscribeOptions {
    node: NodeValue;
    update: UpdateFn;
    refresh: () => void;
}
export interface CacheReturnValue {
    lastSync: number;
    value: any;
}
