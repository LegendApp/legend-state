import type { symbolOpaque } from './globals';
import type { Observable, ObservableParam } from './observableTypes';
import type { ObservableSyncState, SyncedOptions } from './sync/syncTypes';

export type TrackingType = undefined | true | symbol; // true === shallow

export interface GetOptions {
    shallow: boolean;
}

export type OpaqueObject<T> = T & { [symbolOpaque]: true };

export interface ListenerParams<T = any> {
    value: T;
    getPrevious: () => T;
    changes: Change[];
    remote: boolean;
    /** @internal */
    loading: boolean;
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
export interface TrackingState {
    nodes?: Map<NodeValue, TrackingNode>;
    traceListeners?: (nodes: Map<NodeValue, TrackingNode>) => void;
    traceUpdates?: (fn: Function) => Function;
}

interface BaseNodeValue {
    children?: Map<string, ChildNodeValue>;
    proxy?: object;
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
    numListenersRecursive: number;
    state?: Observable<ObservableSyncState>;
    activated?: boolean;
    activationState?: SyncedOptions & { onError?: () => void; persistedRetry?: boolean };
    dirtyFn?: () => void;
    dirtyChildren?: Set<NodeValue>;
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

export interface LinkedOptions<T = any> {
    get?: () => Promise<T> | T;
    set?: (params: SetParams<T>) => void | Promise<any>;
    waitFor?: Selector<any>;
    waitForSet?: ((params: WaitForSetFnParams<T>) => any) | Promise<any> | ObservableParam<any> | ObservableEvent;
    initial?: (() => T) | T;
    activate?: 'auto' | 'lazy';
}

export interface WaitForSetFnParams<T = any> {
    value: T;
    changes: Change[];
}

export type GetMode = 'set' | 'assign' | 'merge' | 'append' | 'prepend';
export interface UpdateFnParams {
    value: unknown;
    mode?: GetMode;
    lastSync?: number | undefined;
}
export type UpdateFn = (params: UpdateFnParams) => void;
export type Linked<T> = T;
