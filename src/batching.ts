import { isMap } from './is';
import { clone, getChildNode, getNodeValue, getPathType, globalState, optimized } from './globals';
import type { Change, ListenerFn, ListenerParams, NodeValue, TypeAtPath } from './observableInterfaces';

interface BatchItem {
    value: any;
    prev: any;
    level: number;
    loading: boolean;
    remote: boolean;
    whenOptimizedOnlyIf?: boolean;
}
interface ChangeInBatch {
    value: any;
    level: number;
    remote: boolean;
    loading: boolean;
    whenOptimizedOnlyIf?: boolean;
    changes: Change[];
}
let timeout: ReturnType<typeof setTimeout> | undefined;
let numInBatch = 0;
let isRunningBatch = false;
let didDelayEndBatch = false;
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

export function isArraySubset<T>(mainArr: T[], subsetArr: T[]) {
    for (let i = 0; i < mainArr.length; i++) {
        if (mainArr[i] !== subsetArr[i]) {
            return false;
        }
    }

    return true;
}

function createPreviousHandlerInner(value: any, changes: Change[]) {
    try {
        // Clones the current state and inject the previous data at the changed path
        let cloned = value ? clone(value) : {};
        for (let i = 0; i < changes.length; i++) {
            const { path, prevAtPath } = changes[i];
            let o = cloned;
            if (path.length > 0) {
                let i: number;
                for (i = 0; i < path.length - 1; i++) {
                    o = o[path[i]];
                }
                const key = path[i];
                if (isMap(o)) {
                    o.set(key, prevAtPath);
                } else {
                    o[key] = prevAtPath;
                }
            } else {
                cloned = prevAtPath;
            }
        }
        return cloned;
    } catch {
        return undefined;
    }
}

export function createPreviousHandler(value: any, changes: Change[]) {
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
        /*loading*/ globalState.isLoadingLocal,
        /*remote*/ globalState.isLoadingRemote,
        value,
        [],
        [],
        value,
        prev,
        /*immediate*/ true,
        level,
        whenOptimizedOnlyIf,
    );
    if (changesInBatch.size) {
        batchNotifyChanges(changesInBatch, /*immediate*/ true);
    }

    // Update the current batch
    const existing = _batchMap.get(node);
    if (existing) {
        existing.value = value;
        // TODO: level, whenOptimizedOnlyIf
    } else {
        _batchMap.set(node, {
            value,
            prev,
            level,
            whenOptimizedOnlyIf,
            remote: globalState.isLoadingRemote,
            loading: globalState.isLoadingLocal,
        });
    }

    // If not in a batch run it immediately
    if (numInBatch <= 0) {
        runBatch();
    }
}

function computeChangesAtNode(
    changesInBatch: Map<NodeValue, ChangeInBatch>,
    node: NodeValue,
    loading: boolean,
    remote: boolean,
    value: any,
    path: string[],
    pathTypes: TypeAtPath[],
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
                remote,
                loading,
                whenOptimizedOnlyIf,
                changes: [change],
            });
        }
    }
}

function computeChangesRecursive(
    changesInBatch: Map<NodeValue, ChangeInBatch>,
    node: NodeValue,
    loading: boolean,
    remote: boolean,
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
        loading,
        remote,
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
            const childNode = getNodeAtPath(linkedFromNode, path);
            computeChangesRecursive(
                changesInBatch,
                childNode,
                loading,
                remote,
                valueAtPath,
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
    // If not root notify up through parents
    if (node.parent) {
        const parent = node.parent;
        if (parent) {
            const parentValue = getNodeValue(parent);
            computeChangesRecursive(
                changesInBatch,
                parent,
                loading,
                remote,
                parentValue,
                [node.key].concat(path),
                [getPathType(value)].concat(pathTypes),
                valueAtPath,
                prevAtPath,
                immediate,
                level + 1,
                whenOptimizedOnlyIf,
            );
        }
    }
}

function batchNotifyChanges(changesInBatch: Map<NodeValue, ChangeInBatch>, immediate: boolean) {
    const listenersNotified = new Set<ListenerFn>();
    // For each change in the batch, notify all of the listeners
    changesInBatch.forEach(({ changes, level, value, loading, remote, whenOptimizedOnlyIf }, node) => {
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
                                loading,
                                remote,
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
    const dirtyNodes = Array.from(globalState.dirtyNodes);
    globalState.dirtyNodes.clear();
    dirtyNodes.forEach((node) => {
        node.dirtyFn?.();
        node.dirtyFn = undefined;
    });
    // Save batch locally and reset _batchMap first because a new batch could begin while looping over callbacks.
    // This can happen with computeds for example.
    const map = _batchMap;
    _batchMap = new Map();
    const changesInBatch = new Map<NodeValue, ChangeInBatch>();
    // First compute all of the changes at each node. It's important to do this first before
    // running all the notifications because createPreviousHandler depends on knowing
    // all of the changes happening at the node.
    map.forEach(({ value, prev, level, loading, remote, whenOptimizedOnlyIf }, node) => {
        computeChangesRecursive(
            changesInBatch,
            node,
            loading,
            remote,
            value,
            [],
            [],
            value,
            prev,
            false,
            level,
            whenOptimizedOnlyIf,
        );
    });

    // Once all changes are computed, notify all listeners for each node with the computed changes.
    if (changesInBatch.size) {
        batchNotifyChanges(changesInBatch, false);
    }
}

export function batch(fn: () => void) {
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

            isRunningBatch = true;

            runBatch();

            isRunningBatch = false;

            // If an endBatch was delayed run it now
            if (didDelayEndBatch) {
                didDelayEndBatch = false;
                endBatch(true);
            }
        }
    }
}

function getNodeAtPath(obj: NodeValue, path: string[]): NodeValue {
    let o: NodeValue = obj;
    for (let i = 0; i < path.length; i++) {
        const p = path[i];
        o = getChildNode(o, p);
    }

    return o;
}
