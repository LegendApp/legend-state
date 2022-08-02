import { Observable, PathNode } from './observableInterfaces';
export default {
    isTracking: false,
    trackedNodes: new Set<PathNode>(),
};
