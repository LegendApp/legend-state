import { getNodeValue } from './globals';
import { isArray } from './is';
import type { Change, ListenerFn, ListenerParams, NodeValue, TypeAtPath } from './observableInterfaces';

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
let _batch: (BatchItemWithoutGetPrevious | (() => void))[] = [];
let _afterBatch: (() => void)[] = [];
// Use a Map of callbacks for fast lookups to update the BatchItem
let _batchMap = new Map<ListenerFn, BatchItemWithoutGetPrevious | true>();
let _batchMap2 = new Map<NodeValue, { value: any; prev: any; level: number; whenOptimizedOnlyIf?: boolean }>();

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

// function createPreviousHandler(value: any, changes: Change[]) {
//     // Create a function that clones the current state and injects the previous data at the changed path
//     return function () {
//         let clone = value ? JSON.parse(JSON.stringify(value)) : {};
//         for (let i = 0; i < changes.length; i++) {
//             const { path, prevAtPath } = changes[i];
//             let o = clone;
//             if (path.length > 0) {
//                 let i: number;
//                 for (i = 0; i < path.length - 1; i++) {
//                     o = o[path[i]];
//                 }
//                 o[path[i]] = prevAtPath;
//             } else {
//                 clone = prevAtPath;
//             }
//         }
//         return clone;
//     };
// }
function createPreviousHandler2(value: any, node: NodeValue, changes: Change[]) {
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

export function batchNotify2(node: NodeValue, value: any, prev: any, level: number, whenOptimizedOnlyIf?: boolean) {
    const existing = _batchMap2.get(node);
    if (existing) {
        existing.value = value;
        // TODO: level, whenOptimizedOnlyIf
    } else {
        _batchMap2.set(node, { value, prev, level, whenOptimizedOnlyIf });
    }

    if (numInBatch <= 0) {
        runBatch2();
    }
}

// export function batchNotifyNode2(
//     changesInBatch: Map<NodeValue, ChangeInBatch>,
//     node: NodeValue,
//     value: any,
//     path: string[],
//     pathTypes: ('object' | 'array')[],
//     valueAtPath: any,
//     prevAtPath: any,
//     level: number,
//     whenOptimizedOnlyIf?: boolean
// ) {
//     const listeners = node.listeners;
//     if (listeners) {
//         let listenerParams: ListenerParams;
//         // Need to convert to an array here instead of using a for...of loop because listeners can change while iterating
//         const arr = Array.from(listeners);
//         for (let i = 0; i < arr.length; i++) {
//             const listenerFn = arr[i];
//             const { track, noArgs, listener } = listenerFn;

//             const ok =
//                 track === true || track === 'shallow'
//                     ? level <= 0
//                     : track === 'optimize'
//                     ? whenOptimizedOnlyIf && level <= 0
//                     : true;

//             // Notify if listener is not shallow or if this is the first level
//             if (ok) {
//                 // Create listenerParams if not already created
//                 if (!noArgs && !listenerParams) {
//                     // listenerParams = {
//                     //     value,
//                     //     // getPrevious: createPreviousHandler2(value, node, changesInBatch),
//                     //     changes: [
//                     //         {
//                     //             path,
//                     //             pathTypes,
//                     //             valueAtPath,
//                     //             prevAtPath,
//                     //         },
//                     //     ],
//                     // };
//                 }

//                 listener(listenerParams);
//             }
//         }
//     }
// }

export function computeChangesAtNode(
    changesInBatch: Map<NodeValue, ChangeInBatch>,
    node: NodeValue,
    value: any,
    path: string[],
    pathTypes: ('object' | 'array')[],
    valueAtPath: any,
    prevAtPath: any,
    level: number,
    whenOptimizedOnlyIf?: boolean
) {
    const listeners = node.listeners;
    if (listeners) {
        const change: Change = {
            path,
            pathTypes,
            valueAtPath,
            prevAtPath,
        };

        const changeInBatch = changesInBatch.get(node);
        // If the node itself has been changed then we can ignore all the child changes
        if (changeInBatch && path.length > 0) {
            changeInBatch.changes.push(change);
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
    level: number,
    whenOptimizedOnlyIf?: boolean
) {
    // Do the notify
    computeChangesAtNode(
        changesInBatch,
        node,
        value,
        path,
        pathTypes,
        valueAtPath,
        prevAtPath,
        level,
        whenOptimizedOnlyIf
    );
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
                level + 1,
                whenOptimizedOnlyIf
            );
        }
    }
}

// function batchNotifyRecursive2(
//     changesInBatch: Map<NodeValue, ChangeInBatch>,
//     node: NodeValue,
//     value: any,
//     path: string[],
//     pathTypes: TypeAtPath[],
//     valueAtPath: any,
//     prevAtPath: any,
//     level: number,
//     whenOptimizedOnlyIf?: boolean
// ) {
//     // Do the notify
//     batchNotifyNode2(changesInBatch, node, value, path, pathTypes, valueAtPath, prevAtPath, level, whenOptimizedOnlyIf);
//     // If not root notify up through parents
//     if (node.parent) {
//         const parent = node.parent;
//         if (parent) {
//             const parentValue = getNodeValue(parent);
//             batchNotifyRecursive2(
//                 changesInBatch,
//                 parent,
//                 parentValue,
//                 [node.key].concat(path),
//                 [(isArray(value) ? 'array' : 'object') as TypeAtPath].concat(pathTypes),
//                 valueAtPath,
//                 prevAtPath,
//                 level + 1,
//                 whenOptimizedOnlyIf
//             );
//         }
//     }
// }

function batchNotifyChanges2(changesInBatch: Map<NodeValue, ChangeInBatch>) {
    changesInBatch.forEach(({ changes, level, value, whenOptimizedOnlyIf }, node) => {
        const listeners = node.listeners;
        if (listeners) {
            let listenerParams: ListenerParams;
            // Need to convert to an array here instead of using a for...of loop because listeners can change while iterating
            const arr = Array.from(listeners);
            for (let i = 0; i < arr.length; i++) {
                const listenerFn = arr[i];
                const { track, noArgs, listener } = listenerFn;

                const ok =
                    track === true || track === 'shallow'
                        ? level <= 0
                        : track === 'optimize'
                        ? whenOptimizedOnlyIf && level <= 0
                        : true;

                // Notify if listener is not shallow or if this is the first level
                if (ok) {
                    // Create listenerParams if not already created
                    if (!noArgs && !listenerParams) {
                        listenerParams = {
                            value,
                            getPrevious: createPreviousHandler2(value, node, changes),
                            changes,
                        };
                    }

                    listener(listenerParams);
                }
            }
        }
    });
}

export function runBatch2() {
    const map = _batchMap2;
    _batchMap2 = new Map();
    const changesInBatch = new Map<NodeValue, ChangeInBatch>();
    map.forEach(({ value, prev, level, whenOptimizedOnlyIf }, node) => {
        computeChangesRecursive(changesInBatch, node, value, [], [], value, prev, level, whenOptimizedOnlyIf);
    });

    batchNotifyChanges2(changesInBatch);
}

// export function batchNotify(b: BatchItemWithoutGetPrevious | (() => void), immediate: boolean) {
//     const isFunc = isFunction(b);
//     const cb = isFunc ? b : b.cb;
//     if (!immediate && numInBatch > 0) {
//         // Set a timeout to call end() in case end() is never called or there's an uncaught error
//         if (!timeout) {
//             timeout = setTimeout(onActionTimeout, 0);
//         }

//         const existing = _batchMap.get(cb);
//         // If this callback already exists, make sure it has the latest value but do not add it
//         if (existing) {
//             if (!isFunc) {
//                 const params = (existing as BatchItem).params;
//                 params.value = b.params.value;
//                 params.changes.push(...b.params.changes);
//                 params.getPrevious = createPreviousHandler(params.value, params.changes);
//             }
//         } else {
//             if (!isFunc) {
//                 b.params.getPrevious = createPreviousHandler(b.params.value, b.params.changes);
//             }
//             _batch.push(b);
//             _batchMap.set(cb, isFunc ? true : b);
//         }
//     } else {
//         // If not batched callback immediately
//         if (isFunc) {
//             b();
//         } else {
//             b.params.getPrevious = createPreviousHandler(b.params.value, b.params.changes);
//             b.cb(b.params as ListenerParams);
//         }

//         if (numInBatch === 0) {
//             // Run afterBatch callbacks if this is not batched
//             const after = _afterBatch;
//             _afterBatch = [];
//             for (let i = 0; i < after.length; i++) {
//                 after[i]();
//             }
//         }
//     }
// }

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

            // for (let i = 0; i < batch.length; i++) {
            //     const b = batch[i];
            //     if (isFunction(b)) {
            //         b();
            //     } else {
            //         const { cb } = b;
            //         cb(b.params as ListenerParams);
            //     }
            // }
            runBatch2();

            isRunningBatch = false;

            if (didDelayEndBatch) {
                didDelayEndBatch = false;
                endBatch(true);
            }

            for (let i = 0; i < after.length; i++) {
                after[i]();
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
