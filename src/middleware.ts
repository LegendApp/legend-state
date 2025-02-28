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

// Queue of events to be processed in microtask
const queuedEvents = new Set<{
    node: NodeInfo;
    listener?: NodeListener;
    type: MiddlewareEventType;
}>();
let isMicrotaskScheduled = false;

/**
 * Register a middleware handler for a specific node and event type
 * @param node The node to register the middleware handler for
 * @param type The event type to handle
 * @param handler The middleware handler function
 * @returns A function to remove the handler
 */
export function registerMiddleware(node: NodeInfo, type: MiddlewareEventType, handler: MiddlewareHandler): () => void {
    // Initialize middleware handlers map for this node if it doesn't exist
    if (!nodeMiddlewareHandlers.has(node)) {
        nodeMiddlewareHandlers.set(node, new Map());
    }

    const handlersMap = nodeMiddlewareHandlers.get(node)!;

    // Initialize handlers Set for this event type if it doesn't exist
    if (!handlersMap.has(type)) {
        handlersMap.set(type, new Set<MiddlewareHandler>());
    }

    // Add handler to the appropriate set
    const handlers = handlersMap.get(type)!;
    handlers.add(handler);

    // Return a function to remove the handler
    return () => {
        const handlersMap = nodeMiddlewareHandlers.get(node);
        if (handlersMap) {
            const handlers = handlersMap.get(type);
            if (handlers) {
                handlers.delete(handler);

                // If there are no more handlers for this type, remove the type entry
                if (handlers.size === 0) {
                    handlersMap.delete(type);
                }

                // If there are no more event types for this node, remove the node entry
                if (handlersMap.size === 0) {
                    nodeMiddlewareHandlers.delete(node);
                }
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
    // Skip if there are no handlers for this node or event type
    const handlersMap = nodeMiddlewareHandlers.get(node);
    if (!handlersMap || !handlersMap.has(type)) {
        return;
    }

    // Queue the event
    queuedEvents.add({ node, listener, type });

    // Schedule microtask to process events if not already scheduled
    if (!isMicrotaskScheduled) {
        isMicrotaskScheduled = true;
        queueMicrotask(processQueuedEvents);
    }
}

/**
 * Process all queued middleware events in a microtask
 * This allows us to verify if events are still valid before dispatching them
 */
function processQueuedEvents(): void {
    isMicrotaskScheduled = false;
    const timestamp = Date.now();

    // Process all queued events
    for (const { node, listener, type } of queuedEvents) {
        const handlersMap = nodeMiddlewareHandlers.get(node);
        if (!handlersMap || !handlersMap.has(type)) continue;

        const handlers = handlersMap.get(type)!;
        if (handlers.size === 0) continue;

        // Check if the event is still valid based on its type
        let isValid = false;

        // Get node's listener sets outside of switch
        const nodeListeners = node.listeners || new Set();
        const nodeListenersImmediate = node.listenersImmediate || new Set();

        switch (type) {
            case 'listener-added':
                // Valid if the listener is in either listeners set
                if (listener) {
                    isValid = nodeListeners.has(listener) || nodeListenersImmediate.has(listener);
                }
                break;

            case 'listener-removed':
                // Valid if the listener is not in either listeners set
                if (listener) {
                    isValid = !nodeListeners.has(listener) && !nodeListenersImmediate.has(listener);
                }
                break;

            case 'listeners-cleared':
                // Valid if both listener sets are empty
                isValid = nodeListeners.size === 0 && nodeListenersImmediate.size === 0;
                break;
        }

        // Only dispatch if the event is valid
        if (isValid) {
            const event: MiddlewareEvent = {
                type,
                node,
                listener,
                timestamp,
            };

            for (const handler of handlers) {
                try {
                    handler(event);
                } catch (error) {
                    console.error(`Error in middleware handler for ${type}:`, error);
                }
            }
        }
    }

    // Clear the queue
    queuedEvents.clear();
}
