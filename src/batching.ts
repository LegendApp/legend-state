import { clone, getChildNode, getNodeValue, getPathType, globalState, optimized, setNodeValue } from './globals';
import { applyChanges } from './helpers';
import type { Change, ListenerFn, ListenerParams, NodeInfo, TypeAtPath } from './observableInterfaces';

interface BatchItem {
    value: any;
    prev: any;
    level: number;
    isFromPersist: boolean;
    isFromSync: boolean;
    whenOptimizedOnlyIf?: boolean;
    prevArrayLength?: number;
    fromParentUpdate?: boolean;
}
interface ChangeInBatch {
    value: any;
    level: number;
    isFromPersist: boolean;
    isFromSync: boolean;
    whenOptimizedOnlyIf?: boolean;
    changes: Change[];
    prevChanges?: ChangeInBatch;
    /** Whether any change in this group was a direct write rather than derived from a parent update */
    hasDirect: boolean;
    /** Derived changes in a group with direct changes, excluded when reconstructing previous values */
    derived?: Change[];
}
let timeout: ReturnType<typeof setTimeout> | undefined;
let numInBatch = 0;
let isRunningBatch = false;
let didDelayEndBatch = false;
let _batchMap = new Map<NodeInfo, BatchItem>();
const previousChangePaths = new WeakMap<Change, string[]>();

let previousNodeKeys: Map<NodeInfo, string> | undefined;
let hasDirectChangesInBatch = false;

function getNodePath(node: NodeInfo, previousKeys?: Map<NodeInfo, string>) {
    const path: string[] = [];
    for (let n = node; n.parent; n = n.parent) path.unshift(previousKeys?.get(n) ?? n.key!);
    return path;
}

export function savePreviousKey(node: NodeInfo) {
    if (!hasDirectChangesInBatch) return;
    previousNodeKeys ||= new Map();
    if (!previousNodeKeys.has(node)) previousNodeKeys.set(node, node.key!);
}

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

function createPreviousHandlerInner(value: any, changes: Change[], derived?: Set<Change>) {
    try {
        // Clones the current state and inject the previous data at the changed path
        if (changes.length < 2 && !previousChangePaths.has(changes[0])) {
            return applyChanges(value ? clone(value) : {}, changes, true);
        }
        const reversed = changes
            .filter((change) => !derived?.has(change))
            .map((change, i) => {
                const path = previousChangePaths.get(change);
                const copyPrevious = i > 0 && change.prevAtPath && typeof change.prevAtPath === 'object';
                return path || copyPrevious
                    ? {
                          ...change,
                          path: path || change.path,
                          prevAtPath: copyPrevious ? clone(change.prevAtPath) : change.prevAtPath,
                      }
                    : change;
            })
            .reverse();
        return applyChanges(value ? clone(value) : {}, reversed, true);
    } catch {
        return undefined;
    }
}

export function createPreviousHandler(value: any, changes: Change[], changeInBatch?: ChangeInBatch) {
    // Create a function that generates the previous state
    // We don't want to always do this because cloning is expensive
    // so it's better to run on demand.
    return function () {
        if (!changeInBatch || (!changeInBatch.prevChanges && !changeInBatch.derived)) {
            return createPreviousHandlerInner(value, changes);
        }
        const derived = new Set<Change>();
        const groups: Change[][] = [];
        for (let group: ChangeInBatch | undefined = changeInBatch; group; group = group.prevChanges) {
            group.derived?.forEach((change) => derived.add(change));
            groups.push(group.changes);
        }
        return createPreviousHandlerInner(value, groups.reverse().flat(), derived);
    };
}

export function notify(
    node: NodeInfo,
    value: any,
    prev: any,
    level: number,
    whenOptimizedOnlyIf?: boolean,
    prevArrayLength?: number,
    fromParentUpdate?: boolean,
) {
    if (!fromParentUpdate) hasDirectChangesInBatch = true;
    // Run immediate listeners if there are any
    const changesInBatch = new Map<NodeInfo, ChangeInBatch>();
    computeChangesRecursive(
        changesInBatch,
        node,
        /*loading*/ !!globalState.isLoadingLocal,
        /*remote*/ !!globalState.isLoadingRemote,
        value,
        [],
        [],
        value,
        prev,
        /*immediate*/ true,
        level,
        whenOptimizedOnlyIf,
        prevArrayLength,
        fromParentUpdate,
    );

    // Update the current batch
    const existing = _batchMap.get(node);
    if (existing) {
        // Check that value is still different from prev as it could have been reverted during the batch,
        // then don't need to notify for it
        if (existing.prev === value && existing.prevArrayLength === undefined) {
            _batchMap.delete(node);
        } else {
            existing.value = value;
        }
        // TODO: level, whenOptimizedOnlyIf
    } else {
        _batchMap.set(node, {
            value,
            prev,
            level,
            whenOptimizedOnlyIf,
            prevArrayLength,
            fromParentUpdate,
            isFromSync: !!globalState.isLoadingRemote,
            isFromPersist: !!globalState.isLoadingLocal,
        });
    }

    if (changesInBatch.size) {
        try {
            batchNotifyChanges(changesInBatch, /*immediate*/ true);
        } catch (error) {
            if (numInBatch <= 0) {
                try {
                    runBatch();
                } catch {
                    // Preserve the earlier immediate-listener error.
                }
            }
            throw error;
        }
    }

    // If not in a batch run it immediately
    if (numInBatch <= 0) {
        runBatch();
    }
}

function computeChangesAtNode(
    changesInBatch: Map<NodeInfo, ChangeInBatch>,
    node: NodeInfo,
    isFromPersist: boolean,
    isFromSync: boolean,
    value: any,
    path: string[],
    pathTypes: TypeAtPath[],
    valueAtPath: any,
    prevAtPath: any,
    immediate: boolean,
    level: number,
    whenOptimizedOnlyIf?: boolean,
    prevArrayLength?: number,
    fromParentUpdate?: boolean,
    previousPath?: string[],
) {
    // If there are listeners at this node compute the changes that need to be run
    if (immediate ? node.listenersImmediate : node.listeners) {
        const change: Change = {
            path,
            pathTypes,
            valueAtPath,
            prevAtPath,
        };
        if (prevArrayLength !== undefined && path.length > 0) {
            change.prevArrayLength = prevArrayLength;
        }
        if (previousPath && path.length > 0) previousChangePaths.set(change, previousPath.slice(-path.length));

        const changeInBatch = changesInBatch.get(node);
        // If the node itself has been changed then we can ignore all the child changes
        if (changeInBatch && path.length > 0) {
            const { changes } = changeInBatch;
            if (!isArraySubset(changes[0].path, change.path)) {
                if (fromParentUpdate) {
                    if (changeInBatch.hasDirect) (changeInBatch.derived ||= []).push(change);
                } else if (!changeInBatch.hasDirect) {
                    // Everything recorded before the first direct change was derived from a parent update
                    changeInBatch.hasDirect = true;
                    changeInBatch.derived = changes.slice();
                }
                changes.push(change);
                // This fixes shallow listeners because an earlier change may have come from setting a child
                changeInBatch.level = Math.min(changeInBatch.level, level);
                changeInBatch.whenOptimizedOnlyIf ||= whenOptimizedOnlyIf;
            }
        } else {
            changesInBatch.set(node, {
                level,
                value,
                isFromSync,
                isFromPersist,
                whenOptimizedOnlyIf,
                changes: [change],
                // A group of only derived changes is superseded by this change
                prevChanges: changeInBatch?.hasDirect ? changeInBatch : changeInBatch?.prevChanges,
                hasDirect: !fromParentUpdate,
                derived: undefined,
            });
        }
    }
}

function computeChangesRecursive(
    changesInBatch: Map<NodeInfo, ChangeInBatch>,
    node: NodeInfo,
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
    prevArrayLength?: number,
    fromParentUpdate?: boolean,
    previousPath?: string[],
    previousKeys?: Map<NodeInfo, string>,
) {
    if (node.numListenersRecursive > 0) {
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
            prevArrayLength,
            fromParentUpdate,
            previousPath,
        );
        if (node.linkedFromNodes) {
            for (const linkedFromNode of node.linkedFromNodes) {
                // Keep parent reads coherent before callbacks run, without replaying the source change.
                if (linkedFromNode.linkedToNode === node && typeof value !== 'function') {
                    setNodeValue(linkedFromNode, value);
                }
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
                    path.length > 0 ? prevArrayLength : undefined,
                    fromParentUpdate,
                    previousPath || previousKeys
                        ? getNodePath(linkedFromNode, previousKeys).concat(
                              path.length > 0 ? (previousPath ? previousPath.slice(-path.length) : path) : [],
                          )
                        : undefined,
                    previousKeys,
                );
            }
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
                prevArrayLength,
                fromParentUpdate,
                previousPath,
                previousKeys,
            );
        }
    }
}

function batchNotifyChanges(changesInBatch: Map<NodeInfo, ChangeInBatch>, immediate: boolean) {
    const listenersNotified = new Set<ListenerFn>();
    let didError = false;
    let firstError: unknown;
    // For each change in the batch, notify all of the listeners
    changesInBatch.forEach((changeInBatch, node) => {
        const { changes, level, value, isFromPersist, isFromSync, whenOptimizedOnlyIf } = changeInBatch;
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
                                isFromPersist,
                                isFromSync,
                                getPrevious: createPreviousHandler(value, changes, changeInBatch),
                                changes,
                            };
                        }

                        if (!track) {
                            listenersNotified.add(listener);
                        }

                        try {
                            listener(listenerParams!);
                        } catch (error) {
                            if (!didError) {
                                didError = true;
                                firstError = error;
                            }
                        }
                    }
                }
            }
        }
    });

    if (didError) {
        throw firstError;
    }
}

export function runBatch() {
    const dirtyNodes = Array.from(globalState.dirtyNodes);
    globalState.dirtyNodes.clear();
    dirtyNodes.forEach((node) => {
        const dirtyFn = node.dirtyFn;
        if (dirtyFn) {
            node.dirtyFn = undefined;
            dirtyFn();
        }
    });
    // Save batch locally and reset _batchMap first because a new batch could begin while looping over callbacks.
    // This can happen with computeds for example.
    const previousKeys = previousNodeKeys;
    previousNodeKeys = undefined;
    hasDirectChangesInBatch = false;
    const map = _batchMap;
    _batchMap = new Map();
    const changesInBatch = new Map<NodeInfo, ChangeInBatch>();
    // First compute all of the changes at each node. It's important to do this first before
    // running all the notifications because createPreviousHandler depends on knowing
    // all of the changes happening at the node.
    map.forEach((batchItem, node) => {
        const {
            value,
            prev,
            level,
            isFromPersist,
            isFromSync,
            whenOptimizedOnlyIf,
            prevArrayLength,
            fromParentUpdate,
        } = batchItem;
        computeChangesRecursive(
            changesInBatch,
            node,
            isFromPersist,
            isFromSync,
            value,
            [],
            [],
            value,
            prev,
            false,
            level,
            whenOptimizedOnlyIf,
            prevArrayLength,
            fromParentUpdate,
            previousKeys ? getNodePath(node, previousKeys) : undefined,
            previousKeys,
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
    } catch (error) {
        endBatchAndThrow(error);
    }
    endBatch();
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
            try {
                runBatch();
            } catch (error) {
                isRunningBatch = false;
                if (didDelayEndBatch) {
                    didDelayEndBatch = false;
                    endBatchAndThrow(error, true);
                }
                throw error;
            }
            isRunningBatch = false;

            // If an endBatch was delayed run it now
            if (didDelayEndBatch) {
                didDelayEndBatch = false;
                endBatch(true);
            }
        }
    }
}

export function endBatchAndThrow(error: unknown, force?: boolean): never {
    try {
        endBatch(force);
    } catch {
        // Preserve the error that interrupted the batched operation.
    }
    throw error;
}

function getNodeAtPath(obj: NodeInfo, path: string[]): NodeInfo {
    let o: NodeInfo = obj;
    for (let i = 0; i < path.length; i++) {
        const p = path[i];
        o = getChildNode(o, p);
    }

    return o;
}
