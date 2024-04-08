import type { NodeValue } from '@legendapp/state';

export function getNodePath(node: NodeValue) {
    const arr: (string | number)[] = [];
    let n = node;
    while (n?.key !== undefined) {
        arr.splice(0, 0, n.key);
        n = n.parent;
    }
    return arr.join('.');
}
