import { batchNotify } from './batching';
import { getNodeValue } from './globals';
import { NodeValue } from './observableInterfaces';

function createPreviousHandler(value: any, path: (string | number)[], prevAtPath: any) {
    // Create a function that clones the current state and injects the previous data at the changed path
    return function () {
        let clone = value ? JSON.parse(JSON.stringify(value)) : path.length > 0 ? {} : value;
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
        return clone;
    };
}

export function doNotify(
    node: NodeValue,
    value: any,
    path: (string | number)[],
    valueAtPath: any,
    prevAtPath: any,
    level: number,
    whenOptimizedOnlyIf?: boolean
) {
    const listeners = node.listeners;
    if (listeners) {
        let getPrevious;
        let listenerNode = node.listeners;
        while (listenerNode) {
            const { track, noArgs } = listenerNode;

            const ok = track === true ? level <= 0 : track === 'optimize' ? whenOptimizedOnlyIf && level <= 0 : true;

            // Notify if listener is not shallow or if this is the first level
            if (ok) {
                // Create a function to get the previous data. Computing a clone of previous data can be expensive if doing
                // it often, so leave it up to the caller.
                if (!noArgs && !getPrevious) {
                    getPrevious = createPreviousHandler(value, path, prevAtPath);
                }
                batchNotify(
                    noArgs
                        ? (listenerNode.listener as () => void)
                        : {
                              cb: listenerNode.listener,
                              value,
                              getPrevious,
                              path,
                              valueAtPath,
                              prevAtPath,
                              node,
                          }
                );
            }

            listenerNode = listenerNode.next;
        }
    }
}

function _notifyParents(
    node: NodeValue,
    value: any,
    path: (string | number)[],
    valueAtPath: any,
    prevAtPath: any,
    level: number,
    whenOptimizedOnlyIf?: boolean
) {
    // Do the notify
    doNotify(node, value, path, valueAtPath, prevAtPath, level, whenOptimizedOnlyIf);
    // If not root notify up through parents
    if (node.parent) {
        const parent = node.parent;
        if (parent) {
            const parentValue = getNodeValue(parent);
            _notifyParents(
                parent,
                parentValue,
                [node.key].concat(path),
                valueAtPath,
                prevAtPath,
                level + 1,
                whenOptimizedOnlyIf
            );
        }
    }
}
export function notify(node: NodeValue, value: any, prev: any, level: number, whenOptimizedOnlyIf?: boolean) {
    // Notify self and up through parents
    _notifyParents(node, value, [], value, prev, level, whenOptimizedOnlyIf);
}
