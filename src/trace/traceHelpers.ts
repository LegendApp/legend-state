import type { NodeInfo } from '@legendapp/state';

export function getNodePath(node: NodeInfo) {
    const arr: (string | number)[] = [];
    let n = node;
    while (n?.key !== undefined) {
        arr.splice(0, 0, n.key);
        n = n.parent;
    }
    return arr.join('.');
}
