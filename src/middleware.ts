import type { NodeInfo, NodeListener } from './observableInterfaces';

// Types for middleware events and handlers
export type MiddlewareEventType = 'listener-added' | 'listener-removed' | 'listeners-cleared';

export interface MiddlewareEvent {
    type: MiddlewareEventType;
    node: NodeInfo;
    listener?: NodeListener; // Optional because listeners-cleared event doesn't have a specific listener
    timestamp: number;
}

// Generic middleware handler that can handle specific event types
export type MiddlewareHandler = (event: MiddlewareEvent) => void;

// Store middleware handlers in a WeakMap keyed by node
const nodeMiddlewareHandlers = new WeakMap<NodeInfo, Map<MiddlewareEventType, Set<MiddlewareHandler>>>();

// Queued events - use arrays instead of Sets for better performance in this case
const queuedNodes: NodeInfo[] = [];
const queuedListeners: (NodeListener | undefined)[] = [];
const queuedTypes: MiddlewareEventType[] = [];
let queueSize = 0;
let isMicrotaskScheduled = false;

/**
 * Register a middleware handler for a specific node and event type
 * @param node The node to register the middleware handler for
 * @param type The event type to handle
 * @param handler The middleware handler function
 * @returns A function to remove the handler
 */
export function registerMiddleware(node: NodeInfo, type: MiddlewareEventType, handler: MiddlewareHandler): () => void {
    // Get or create handlers map for this node
    let handlersMap = nodeMiddlewareHandlers.get(node);
    if (!handlersMap) {
        handlersMap = new Map();
        nodeMiddlewareHandlers.set(node, handlersMap);
    }

    // Get or create handlers set for this event type
    let handlers = handlersMap.get(type);
    if (!handlers) {
        handlers = new Set();
        handlersMap.set(type, handlers);
    }

    // Add handler to the set
    handlers.add(handler);

    // Return a function to remove the handler
    return () => {
        const handlersMap = nodeMiddlewareHandlers.get(node);
        if (!handlersMap) return;

        const handlers = handlersMap.get(type);
        if (!handlers) return;

        handlers.delete(handler);

        // Cleanup empty sets and maps
        if (handlers.size === 0) {
            handlersMap.delete(type);
            if (handlersMap.size === 0) {
                nodeMiddlewareHandlers.delete(node);
            }
        }
    };
}

/**
 * Queue a middleware event for a specific node to be processed in a microtask
 * @param node The node to queue the event for
 * @param listener The listener that was added or removed (optional for listeners-cleared)
 * @param type The type of event
 */
export function dispatchMiddlewareEvent(
    node: NodeInfo,
    listener: NodeListener | undefined,
    type: MiddlewareEventType,
): void {
    // Fast path: Skip if there are no handlers for this node or event type
    const handlersMap = nodeMiddlewareHandlers.get(node);
    if (!handlersMap || !handlersMap.has(type)) {
        return;
    }

    // Check if handlers exist (avoid empty sets)
    const handlers = handlersMap.get(type);
    if (!handlers || handlers.size === 0) {
        return;
    }

    // Queue the event in parallel arrays for better performance
    queuedNodes[queueSize] = node;
    queuedListeners[queueSize] = listener;
    queuedTypes[queueSize] = type;
    queueSize++;

    // Schedule microtask if not already scheduled
    if (!isMicrotaskScheduled) {
        isMicrotaskScheduled = true;
        queueMicrotask(processQueuedEvents);
    }
}

// Reusable event object to avoid allocation during processing
const eventObj: MiddlewareEvent = {
    type: 'listener-added',
    node: null as any,
    listener: undefined,
    timestamp: 0,
};

/**
 * Process all queued middleware events in a microtask
 * Using a single function for validation and processing improves performance
 */
function processQueuedEvents(): void {
    isMicrotaskScheduled = false;

    // Use performance.now() if available for more precise timing
    const timestamp = typeof performance !== 'undefined' ? performance.now() : Date.now();
    eventObj.timestamp = timestamp;

    // Process each queued event
    for (let i = 0; i < queueSize; i++) {
        const node = queuedNodes[i];
        const listener = queuedListeners[i];
        const type = queuedTypes[i];

        // Fast check for handlers without re-fetching from WeakMap if possible
        const handlersMap = nodeMiddlewareHandlers.get(node);
        if (!handlersMap) continue;

        const handlers = handlersMap.get(type);
        if (!handlers || handlers.size === 0) continue;

        // Get node's listener sets - avoid creating empty sets
        const nodeListeners = node.listeners;
        const nodeListenersImmediate = node.listenersImmediate;
        // Skip validation if there are no local listeners and this is not a parent node listener-added event
        // (parent node listener-added events use recursive listener count, so we need to process them)
        if (
            !nodeListeners &&
            !nodeListenersImmediate &&
            node.numListenersRecursive &&
            !(type === 'listener-added' && !listener)
        ) {
            continue;
        }

        // Validate event based on type (optimized validation logic)
        let isValid = false;

        // Use cached string constants for faster comparison
        if (type === 'listener-added') {
            if (listener) {
                // Direct listener added to this node
                isValid = !!nodeListeners?.has(listener) || !!nodeListenersImmediate?.has(listener);
            } else {
                // Listener added to a child node - only valid if the parent node has no local listeners
                // but has recursive listeners. This allows synced observables (which have no local
                // listeners but need to know about recursive listeners) to react, while preserving
                // the behavior that parent nodes with their own listeners don't get events from children.
                const hasNoLocalListeners = !nodeListeners && !nodeListenersImmediate;
                if (hasNoLocalListeners && typeof node.numListenersRecursive === 'number') {
                    isValid = node.numListenersRecursive > 0;
                } else {
                    isValid = false;
                }
            }
        } else if (type === 'listener-removed') {
            isValid = !nodeListeners?.has(listener!) && !nodeListenersImmediate?.has(listener!);
        } else {
            // type === 'listeners-cleared'
            const hasAnyLocal =
                (nodeListeners && nodeListeners.size > 0) ||
                (nodeListenersImmediate && nodeListenersImmediate.size > 0);

            // Prefer the recursive listener count when available so that ancestor/root
            // nodes can observe when their entire subtree has been cleared of listeners.
            if (typeof node.numListenersRecursive === 'number') {
                isValid = !hasAnyLocal && node.numListenersRecursive === 0;
            } else {
                // Fallback: rely only on local listener sets
                isValid = !hasAnyLocal;
            }
        }

        // Only dispatch if the event is valid
        if (isValid) {
            // Update properties of the reused event object
            eventObj.type = type;
            eventObj.node = node;
            eventObj.listener = listener;

            // Iterator optimization for Sets
            const iterableHandlers = Array.from(handlers);
            for (let j = 0; j < iterableHandlers.length; j++) {
                try {
                    iterableHandlers[j](eventObj);
                } catch (error) {
                    console.error(`Error in middleware handler for ${type}:`, error);
                }
            }
        }
    }

    // Clear the queue by resetting size rather than reallocating arrays
    queueSize = 0;
}
