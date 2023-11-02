import type { symbolGetNode, symbolOpaque } from './globals';
import type {
    Observable,
    ObservableComputed,
    ObservableComputed as ObservableComputedNew,
    ObservableComputedTwoWay,
    Observable as ObservableNew,
    ObservableReadable,
    ObservableReadable as ObservableReadableNew,
} from './observableTypes';
import type { ObservablePersistState } from './persistTypes';

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
