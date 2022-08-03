import { ListenerFn, ObservableListenerInfo } from './observableInterfaces';

interface BatchItem {
    cb: ListenerFn<any>;
    value: any;
    getPrevious: () => any;
    path: (string | number)[];
    valueAtPath: any;
    prevAtPath: any;
}
let timeout;
let numInBatch = 0;
let _batch: BatchItem[] = [];
// Use a WeakMap of callbacks for fast lookups to update the BatchItem
let _batchMap = new WeakMap<ListenerFn, BatchItem>();

function onActionTimeout() {
    if (_batch.length > 0) {
        if (process.env.NODE_ENV === 'development') {
            console.error(
                'Forcibly completing observableBatcher because end() was never called. This may be due to an uncaught error between begin() and end().'
            );
        }
        observableBatcher.end(/*force*/ true);
    }
}

export function observableBatcherNotify(
    cb: ListenerFn,
    value: any,
    getPrevious: () => any,
    path: (string | number)[],
    valueAtPath: any,
    prevAtPath: any
) {
    if (numInBatch > 0) {
        const existing = _batchMap.get(cb);
        // If this callback already exists, make sure it has the latest value but do not add it
        if (existing) {
            existing.value = value;
            existing.getPrevious = getPrevious;
            existing.path = path;
            existing.valueAtPath = valueAtPath;
            existing.prevAtPath = prevAtPath;
        } else {
            const batchItem = { cb, value, getPrevious, path, valueAtPath, prevAtPath };
            _batch.push(batchItem);
            _batchMap.set(cb, batchItem);
        }
    } else {
        cb(value, getPrevious, path, valueAtPath, prevAtPath);
    }
}

export namespace observableBatcher {
    export function batch(fn: () => void) {
        begin();
        fn();
        end();
    }
    export function begin() {
        numInBatch++;
        // Set a timeout to call end() in case end() is never called or there's an uncaught error
        timeout = setTimeout(onActionTimeout, 0);
    }
    export function end(force?: boolean) {
        numInBatch--;
        if (numInBatch <= 0 || force) {
            clearTimeout(timeout);
            numInBatch = 0;
            // Save batch locally and reset _batch first because a new batch could begin while looping over callbacks.
            // This can happen with observableComputed for example.
            const batch = _batch;
            _batch = [];
            _batchMap = new WeakMap();
            for (let i = 0; i < batch.length; i++) {
                const { cb, value, getPrevious: prev, path, valueAtPath, prevAtPath } = batch[i];
                cb(value, prev, path, valueAtPath, prevAtPath);
            }
        }
    }
}
