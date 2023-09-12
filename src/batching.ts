import { getChildNode, getNodeValue, optimized } from './globals';
import { isArray, isNumber } from './is';
import type { Change, ListenerFn, ListenerParams, NodeValue, TypeAtPath } from './observableInterfaces';

interface BatchItem {
    value: any;
    prev: any;
    level: number;
    whenOptimizedOnlyIf?: boolean;
}
interface ChangeInBatch {
    value: any;
    level: number;
    whenOptimizedOnlyIf?: boolean;
    changes: Change[];
}
let timeout: ReturnType<typeof setTimeout> | undefined;
let numInBatch = 0;
let isRunningBatch = false;
let didDelayEndBatch = false;
let _afterBatch: (() => void)[] = [];
let _queuedBatches: [() => void, () => void][] = [];
let _batchMap = new Map<NodeValue, BatchItem>();

function onActionTimeout() {
    if (_batchMap.size > 0) {
        if (process.env.NODE_ENV === 'development') {
            console.error(
                'Forcibly completing observableBatcher because end() was never called. This may be due to an uncaught error between begin() and end().',
            );
        }
        endBatch(/*force*/ true);
    }
}

function isArraySubset<T>(mainArr: T[], subsetArr: T[]) {
    for (let i = 0; i < mainArr.length; i++) {
        if (mainArr[i] !== subsetArr[i]) {
            return false;
        }
    }

    return true;
}

function createPreviousHandlerInner(value: any, changes: Change[]) {
    // Clones the current state and inject the previous data at the changed path
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
}

function createPreviousHandler(value: any, changes: Change[]) {
    // Create a function that generates the previous state
    // We don't want to always do this because cloning is expensive
    // so it's better to run on demand.
    return function () {
        return createPreviousHandlerInner(value, changes);
    };
}

export function notify(node: NodeValue, value: any, prev: any, level: number, whenOptimizedOnlyIf?: boolean) {
    // Run immediate listeners if there are any
    const changesInBatch = new Map<NodeValue, ChangeInBatch>();
    computeChangesRecursive(
        changesInBatch,
        node,
        value,
        [],
        [],
        value,
        prev,
        /*immediate*/ true,
        level,
        whenOptimizedOnlyIf,
    );
    batchNotifyChanges(changesInBatch, /*immediate*/ true);

    // Update the current batch
    const existing = _batchMap.get(node);
    if (existing) {
        existing.value = value;
        // TODO: level, whenOptimizedOnlyIf
    } else {
        _batchMap.set(node, { value, prev, level, whenOptimizedOnlyIf });
    }

    // If not in a batch run it immediately
    if (numInBatch <= 0) {
        runBatch();
    }
}

function computeChangesAtNode(
    changesInBatch: Map<NodeValue, ChangeInBatch>,
    node: NodeValue,
    value: any,
    path: string[],
    pathTypes: ('object' | 'array')[],
    valueAtPath: any,
    prevAtPath: any,
    immediate: boolean,
    level: number,
    whenOptimizedOnlyIf?: boolean,
) {
    // If there are listeners at this node compute the changes that need to be run
    if (immediate ? node.listenersImmediate : node.listeners) {
        const change: Change = {
            path,
            pathTypes,
            valueAtPath,
            prevAtPath,
        };

        const changeInBatch = changesInBatch.get(node);
        // If the node itself has been changed then we can ignore all the child changes
        if (changeInBatch && path.length > 0) {
            const { changes } = changeInBatch;
            if (!isArraySubset(changes[0].path, change.path)) {
                changes.push(change);
            }
        } else {
            changesInBatch.set(node, {
                level,
                value,
                whenOptimizedOnlyIf,
                changes: [change],
            });
        }
    }
}

function computeChangesRecursive(
    changesInBatch: Map<NodeValue, ChangeInBatch>,
    node: NodeValue,
    value: any,
    path: string[],
    pathTypes: TypeAtPath[],
    valueAtPath: any,
    prevAtPath: any,
    immediate: boolean,
    level: number,
    whenOptimizedOnlyIf?: boolean,
) {
    // Do the compute at this node
    computeChangesAtNode(
        changesInBatch,
        node,
        value,
        path,
        pathTypes,
        valueAtPath,
        prevAtPath,
        immediate,
        level,
        whenOptimizedOnlyIf,
    );
    if (node.linkedFromNodes) {
        for (const linkedFromNode of node.linkedFromNodes) {
            computeChangesAtNode(
                changesInBatch,
                linkedFromNode,
                value,
                path,
                pathTypes,
                valueAtPath,
                prevAtPath,
                immediate,
                level,
                whenOptimizedOnlyIf,
            );
        }
    }
    // If not root notify up through parents
    if (node.parent) {
        const parent = node.parent;
        if (parent) {
            const parentValue = getNodeValue(parent);
            computeChangesRecursive(
                changesInBatch,
                parent,
                parentValue,
                [node.key].concat(path),
                [(isArray(value) ? 'array' : 'object') as TypeAtPath].concat(pathTypes),
                valueAtPath,
                prevAtPath,
                immediate,
                level + 1,
                whenOptimizedOnlyIf,
            );

            if (parent.arrayIDsByIndex) {
                const id = parent.arrayIDsByIndex.get(node.key);
                if (id !== undefined) {
                    const idNode = parent.children?.get(id);
                    if (idNode) {
                        let idNodeAtPath = idNode;
                        for (let i = 0; i < path.length; i++) {
                            idNodeAtPath = getChildNode(idNodeAtPath, path[i]);
                        }
                        const parentValueByID = getNodeValue(idNodeAtPath.parent);

                        computeChangesRecursive(
                            changesInBatch,
                            idNodeAtPath,
                            parentValueByID,
                            [],
                            [],
                            valueAtPath,
                            prevAtPath,
                            immediate,
                            0,
                            whenOptimizedOnlyIf,
                        );
                    }
                }
            }
        }
    }
}

function batchNotifyChanges(changesInBatch: Map<NodeValue, ChangeInBatch>, immediate: boolean) {
    const listenersNotified = new Set<ListenerFn>();
    // For each change in the batch, notify all of the listeners
    changesInBatch.forEach(({ changes, level, value, whenOptimizedOnlyIf }, node) => {
        const listeners = immediate ? node.listenersImmediate : node.listeners;
        if (listeners) {
            let listenerParams: ListenerParams | undefined;
            // Need to convert to an array here instead of using a for...of loop because listeners can change while iterating
            const arr = Array.from(listeners);
            for (let i = 0; i < arr.length; i++) {
                const listenerFn = arr[i];
                const { track, noArgs, listener } = listenerFn;
                if (!listenersNotified.has(listener)) {
                    const ok =
                        track === true ? level <= 0 : track === optimized ? whenOptimizedOnlyIf && level <= 0 : true;

                    // Notify if listener is not shallow or if this is the first level
                    if (ok) {
                        // Create listenerParams if not already created
                        if (!noArgs && !listenerParams) {
                            listenerParams = {
                                value,
                                getPrevious: createPreviousHandler(value, changes),
                                changes,
                            };
                        }

                        if (!track) {
                            listenersNotified.add(listener);
                        }

                        listener(listenerParams!);
                    }
                }
            }
        }
    });
}

export function runBatch() {
    // Save batch locally and reset _batchMap first because a new batch could begin while looping over callbacks.
    // This can happen with observableComputed for example.
    const map = _batchMap;
    _batchMap = new Map();
    const changesInBatch = new Map<NodeValue, ChangeInBatch>();
    // First compute all of the changes at each node. It's important to do this first before
    // running all the notifications because createPreviousHandler depends on knowing
    // all of the changes happening at the node.
    map.forEach(({ value, prev, level, whenOptimizedOnlyIf }, node) => {
        computeChangesRecursive(changesInBatch, node, value, [], [], value, prev, false, level, whenOptimizedOnlyIf);
    });

    // Once all changes are computed, notify all listeners for each node with the computed changes.
    batchNotifyChanges(changesInBatch, false);
}

export function batch(fn: () => void, onComplete?: () => void) {
    if (onComplete) {
        // If there's an onComplete we need a batch that's fully isolated from others to ensure it wraps only the given changes.
        // So if already batching, push this batch onto a queue and run it after the current batch is fully done.
        if (isRunningBatch) {
            _queuedBatches.push([fn, onComplete]);
            return;
        } else {
            _afterBatch.push(onComplete);
        }
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
    if (!timeout) {
        timeout = setTimeout(onActionTimeout, 0);
    }
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
            const after = _afterBatch;
            if (after.length) {
                _afterBatch = [];
            }

            isRunningBatch = true;

            runBatch();

            isRunningBatch = false;

            // Run after functions at the end of this batch before running the next batch.
            // This needs to run before the delayed endBatch because the after functions need
            // to run before any side effects of the batch
            for (let i = 0; i < after.length; i++) {
                after[i]();
            }

            // If an endBatch was delayed run it now
            if (didDelayEndBatch) {
                didDelayEndBatch = false;
                endBatch(true);
            }

            const queued = _queuedBatches;
            if (queued.length) {
                _queuedBatches = [];
                for (let i = 0; i < queued.length; i++) {
                    const [fn, onComplete] = queued[i];
                    batch(fn, onComplete);
                }
            }
        }
    }
}
