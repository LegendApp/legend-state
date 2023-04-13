import { isFunction } from './is';
import type { Change, ListenerFn, ListenerParams } from './observableInterfaces';

export interface BatchItem {
    cb: ListenerFn<any>;
    params: ListenerParams<any>;
}
export type ListenerParamsWithoutGetPrevious = Omit<ListenerParams<any>, 'getPrevious'> &
    Partial<Pick<ListenerParams<any>, 'getPrevious'>>;
export interface BatchItemWithoutGetPrevious {
    cb: ListenerFn<any>;
    params: ListenerParamsWithoutGetPrevious;
}
let timeout: ReturnType<typeof setTimeout> | undefined;
let numInBatch = 0;
let isRunningBatch = false;
let didDelayEndBatch = false;
let _batch: (BatchItemWithoutGetPrevious | (() => void))[] = [];
let _afterBatch: (() => void)[] = [];
// Use a Map of callbacks for fast lookups to update the BatchItem
let _batchMap = new Map<ListenerFn, BatchItemWithoutGetPrevious | true>();

function onActionTimeout() {
    if (_batch.length > 0) {
        if (process.env.NODE_ENV === 'development') {
            console.error(
                'Forcibly completing observableBatcher because end() was never called. This may be due to an uncaught error between begin() and end().'
            );
        }
        endBatch(/*force*/ true);
    }
}

function createPreviousHandler(value: any, changes: Change[]) {
    // Create a function that clones the current state and injects the previous data at the changed path
    return function () {
        let clone = value ? JSON.parse(JSON.stringify(value)) : {};
        for (let i = 0; i < changes.length; i++) {
            const { path, prevAtPath } = changes[i];
            let o = clone;
            if (path.length > 0) {
                let i: number;
                for (i = 0; i < path.length - 1; i++) {
                    o = o[path[i]];
                }
                o[path[i]] = prevAtPath;
            } else {
                clone = prevAtPath;
            }
        }
        return clone;
    };
}

export function batchNotify(b: BatchItemWithoutGetPrevious | (() => void), immediate: boolean) {
    const isFunc = isFunction(b);
    const cb = isFunc ? b : b.cb;
    if (!immediate && numInBatch > 0) {
        // Set a timeout to call end() in case end() is never called or there's an uncaught error
        if (!timeout) {
            timeout = setTimeout(onActionTimeout, 0);
        }

        const existing = _batchMap.get(cb);
        // If this callback already exists, make sure it has the latest value but do not add it
        if (existing) {
            if (!isFunc) {
                const params = (existing as BatchItem).params;
                params.value = b.params.value;
                params.changes.push(...b.params.changes);
                params.getPrevious = createPreviousHandler(params.value, params.changes);
            }
        } else {
            if (!isFunc) {
                b.params.getPrevious = createPreviousHandler(b.params.value, b.params.changes);
            }
            _batch.push(b);
            _batchMap.set(cb, isFunc ? true : b);
        }
    } else {
        // If not batched callback immediately
        if (isFunc) {
            b();
        } else {
            b.params.getPrevious = createPreviousHandler(b.params.value, b.params.changes);
            b.cb(b.params as ListenerParams);
        }

        if (numInBatch === 0) {
            // Run afterBatch callbacks if this is not batched
            const after = _afterBatch;
            _afterBatch = [];
            for (let i = 0; i < after.length; i++) {
                after[i]();
            }
        }
    }
}

export function batch(fn: () => void, onComplete?: () => void) {
    if (onComplete) {
        _afterBatch.push(onComplete);
    }
    beginBatch();
    try {
        fn();
    } finally {
        endBatch();
    }
}
export function beginBatch() {
    numInBatch++;
}
export function endBatch(force?: boolean) {
    numInBatch--;

    if (numInBatch <= 0 || force) {
        if (isRunningBatch) {
            // Don't want to run multiple endBatches recursively, so just note that an endBatch
            // was delayed so that the top level endBatch will run endBatch again after it's done.
            didDelayEndBatch = true;
        } else {
            if (timeout) {
                clearTimeout(timeout);
                timeout = undefined;
            }
            numInBatch = 0;
            // Save batch locally and reset _batch first because a new batch could begin while looping over callbacks.
            // This can happen with observableComputed for example.
            const batch = _batch;
            const after = _afterBatch;
            _batch = [];
            _batchMap = new Map();
            _afterBatch = [];
            isRunningBatch = true;

            for (let i = 0; i < batch.length; i++) {
                const b = batch[i];
                if (isFunction(b)) {
                    b();
                } else {
                    const { cb } = b;
                    cb(b.params as ListenerParams);
                }
            }
            for (let i = 0; i < after.length; i++) {
                after[i]();
            }

            isRunningBatch = false;

            if (didDelayEndBatch) {
                didDelayEndBatch = false;
                endBatch(true);
            }
        }
    }
}
export function afterBatch(fn: () => void) {
    if (numInBatch > 0) {
        _afterBatch.push(fn);
    } else {
        fn();
    }
}
