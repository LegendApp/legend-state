import type { symbolOpaque } from './globals';
import type { Observable, Observable as ObservableNew, ObservableReadable } from './observableTypes';
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

export type TypeAtPath = 'object' | 'array';

export interface Change {
    path: string[];
    pathTypes: TypeAtPath[];
    valueAtPath: any;
    prevAtPath: any;
}

export type RecordValue<T> = T extends Record<string, infer t> ? t : never;
export type ArrayValue<T> = T extends Array<infer t> ? t : never;
export type ObservableValue<T> = T extends Observable<infer t> ? t : never;

export type Selector<T> = ObservableReadable<T> | ObservableEvent | (() => T) | T;

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
    isActivatedPrimitive?: boolean;
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
    state?: ObservableNew<ObservablePersistState>;
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

export type OnSetParams<T> = ListenerParams<T extends Promise<infer t> ? t : T>;
export type SyncedOnSetParams<T> = OnSetParams<T> & {
    node: NodeValue;
    update: UpdateFn;
    refresh: () => void;
    cancelRetry: () => void;
    retryNum: number;
    fromSubscribe: boolean | undefined;
};

export interface ActivatedParams<T = any> {
    get?: () => T;
    onSet?: (params: OnSetParams<T>) => void | Promise<any>;
    waitFor?: Selector<any>;
    waitForSet?:
        | ((params: { value: T; changes: Change[] }) => any)
        | Promise<any>
        | ObservableReadable<any>
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
export interface SyncedParams<T = any> extends Omit<ActivatedParams<T>, 'get' | 'onSet'> {
    get?: (params: SyncedGetParams) => T;
    onSet?: (params: SyncedOnSetParams<T>) => void | Promise<any>;
    subscribe?: (params: { node: NodeValue; update: UpdateFn; refresh: () => void }) => void;
    retry?: RetryOptions;
    offlineBehavior?: false | 'retry';
    cache?: CacheOptions<any>;
}

export type Activated<T> = T;
export type Synced<T> = T;

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
