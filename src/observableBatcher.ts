import { ListenerFn, NodeValue } from './observableInterfaces';

interface BatchItem {
    cb: ListenerFn<any>;
    value: any;
    getPrevious: () => any;
    path: (string | number)[];
    valueAtPath: any;
    prevAtPath: any;
    node: NodeValue;
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
        endBatch(/*force*/ true);
    }
}

export function observableBatcherNotify(b: BatchItem) {
    if (numInBatch > 0) {
        const existing = _batchMap.get(b.cb);
        // If this callback already exists, make sure it has the latest value but do not add it
        if (existing) {
            _batchMap.set(b.cb, b);
        } else {
            _batch.push(b);
            _batchMap.set(b.cb, b);
        }
    } else {
        b.cb(b.value, b.getPrevious, b.path, b.valueAtPath, b.prevAtPath, b.node);
    }
}

export function batch(fn: () => void) {
    beginBatch();
    fn();
    endBatch();
}
export function beginBatch() {
    numInBatch++;
    // Set a timeout to call end() in case end() is never called or there's an uncaught error
    timeout = setTimeout(onActionTimeout, 0);
}
export function endBatch(force?: boolean) {
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
            const { cb, value, getPrevious: prev, path, valueAtPath, prevAtPath, node } = batch[i];
            cb(value, prev, path, valueAtPath, prevAtPath, node);
        }
    }
}
