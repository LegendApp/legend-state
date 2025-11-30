import { isHintPlain } from './globals';
import type { NodeInfo } from './observableInterfaces';

export function checkPlain(node: NodeInfo, value: any) {
    if (!node.isPlain && (node.parent?.isPlain || isHintPlain(value))) {
        node.isPlain = true;
    }
}
