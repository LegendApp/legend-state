import { observable, registerMiddleware, MiddlewareEvent, MiddlewareHandler } from '../index';

// Import necessary types
import type { NodeInfo } from '../src/observableInterfaces';

// Create an observable store for our examples
const store = observable({ count: 0, user: { name: 'John' } });
// Get the root node for middleware registration
const rootNode = (store as any).__node as NodeInfo;

// Example 1: Register for listener-added events on the root node
const listenersAddedHandler = registerMiddleware(rootNode, 'listener-added', (event: MiddlewareEvent) => {
    console.log('Listener added to node:', event.node);
});

// Example 2: Register for listener-removed events on the root node
const listenersRemovedHandler = registerMiddleware(rootNode, 'listener-removed', (event: MiddlewareEvent) => {
    console.log('Listener removed from node:', event.node);
});

// Example 3: Register for listeners-cleared events on the root node
const listenersClearedHandler = registerMiddleware(rootNode, 'listeners-cleared', (event: MiddlewareEvent) => {
    console.log('All listeners cleared from node:', event.node);
});

// Example 4: Register for a specific event type on a specific node - Listener Added
function createListenerAddedLogger(node: NodeInfo) {
    return registerMiddleware(
        node,
        'listener-added',
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        (() => {
            console.log(`[${new Date().toISOString()}] Listener added to node`);
        }) as MiddlewareHandler,
    );
}

// Example 5: Register handlers for multiple specific event types
function createListenerTracker(node: NodeInfo) {
    let stats = {
        listenersAdded: 0,
        listenersRemoved: 0,
        nodesCleared: 0,
    };

    const addHandler = registerMiddleware(
        node,
        'listener-added',
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        (() => {
            stats.listenersAdded++;
            console.log(`Listener added to node`);
        }) as MiddlewareHandler,
    );

    const removeHandler = registerMiddleware(
        node,
        'listener-removed',
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        (() => {
            stats.listenersRemoved++;
            console.log(`Listener removed from node`);
        }) as MiddlewareHandler,
    );

    const clearHandler = registerMiddleware(
        node,
        'listeners-cleared',
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        (() => {
            stats.nodesCleared++;
            console.log(`All listeners cleared from node`);
        }) as MiddlewareHandler,
    );

    return {
        getStats: () => ({ ...stats }),
        reset: () => {
            stats = { listenersAdded: 0, listenersRemoved: 0, nodesCleared: 0 };
        },
        unregister: () => {
            addHandler();
            removeHandler();
            clearHandler();
        },
    };
}

// Example 6: Demonstrating the listeners-cleared event
function demonstrateListenersCleared() {
    console.log('\n--- Demonstrating listeners-cleared event ---');

    // Create a specific node for this example
    const demoNode = (store.count as any).__node as NodeInfo;

    // Register a handler specifically for the listeners-cleared event
    const clearedHandler = registerMiddleware(
        demoNode,
        'listeners-cleared',
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        (_event: MiddlewareEvent) => {
            console.log(`CLEARED EVENT: All listeners have been removed from node at ${new Date().toISOString()}`);
        },
    );

    console.log('Adding first listener...');
    const unsubscribe1 = store.count.onChange(({ value }) => console.log('First listener:', value));

    console.log('Adding second listener...');
    const unsubscribe2 = store.count.onChange(({ value }) => console.log('Second listener:', value));

    console.log('Removing first listener...');
    unsubscribe1();

    console.log('Removing second listener (should trigger listeners-cleared)...');
    unsubscribe2();

    // Clean up the middleware handler
    clearedHandler();
    console.log('--- End of listeners-cleared demo ---\n');
}

// Example 7: Demonstrating microtask batching behavior
function demonstrateMicrotaskBatching() {
    console.log('\n--- Demonstrating microtask batching ---');

    // Create a specific node for this example
    const demoNode = (store.user.name as any).__node as NodeInfo;

    // Register handlers for all event types
    const eventLog: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const addedHandler = registerMiddleware(demoNode, 'listener-added', (event: MiddlewareEvent) => {
        eventLog.push(`Added listener at ${new Date().toISOString()}`);
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const removedHandler = registerMiddleware(demoNode, 'listener-removed', (event: MiddlewareEvent) => {
        eventLog.push(`Removed listener at ${new Date().toISOString()}`);
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const clearedHandler = registerMiddleware(demoNode, 'listeners-cleared', (event: MiddlewareEvent) => {
        eventLog.push(`Cleared listeners at ${new Date().toISOString()}`);
    });

    console.log('Adding and immediately removing a listener (should not trigger any events):');
    const unsubscribe = store.user.name.onChange(({ value }) => console.log('Temp listener:', value));
    unsubscribe(); // Immediately unsubscribe

    console.log('Adding a persistent listener:');
    const persistentUnsubscribe = store.user.name.onChange(({ value }) => console.log('Persistent listener:', value));

    // Use a setTimeout to see what events were actually dispatched after the microtask
    setTimeout(() => {
        console.log('Events that occurred (should only show Added listener):');
        eventLog.forEach((log) => console.log(` - ${log}`));
        eventLog.length = 0; // Clear the log

        console.log('Now removing the persistent listener:');
        persistentUnsubscribe();

        // Use another setTimeout to see what events were dispatched
        setTimeout(() => {
            console.log('Events that occurred after removing persistent listener:');
            eventLog.forEach((log) => console.log(` - ${log}`));

            // Clean up
            addedHandler();
            removedHandler();
            clearedHandler();
            console.log('--- End of microtask batching demo ---\n');
        }, 0);
    }, 0);
}

// Example 8: Registering middleware on different nodes in the tree
function exampleMultiNodeMiddleware() {
    // Get nodes for different parts of the store
    const countNode = (store.count as any).__node as NodeInfo;
    const userNode = (store.user as any).__node as NodeInfo;

    // Register middleware specific to the count node
    const countLogger = createListenerAddedLogger(countNode);

    // Register middleware specific to the user node
    const userTracker = createListenerTracker(userNode);

    // Now events will only be dispatched to the appropriate node's middleware

    // Add a listener to count
    const countUnsubscribe = store.count.onChange(({ value }) => console.log('Count is now:', value));

    // Add a listener to user.name
    const nameUnsubscribe = store.user.name.onChange(({ value }) => console.log('Name is now:', value));

    // Only count middleware would have been triggered for the count listener
    // Only user middleware would have been triggered for the name listener

    console.log('User node stats:', userTracker.getStats()); // Should show no listeners on user node

    // Clean up
    countUnsubscribe();
    nameUnsubscribe();
    countLogger();
    userTracker.unregister();
}

// Example 9: Usage in an application
function exampleUsage() {
    // Register node-specific middleware
    const addedLogger = createListenerAddedLogger(rootNode);
    const listenerTracker = createListenerTracker(rootNode);

    // Add a listener
    const unsubscribe = store.count.onChange(({ value }) => {
        console.log('Count changed:', value);
    });

    // Change values
    store.count.set(1);
    store.count.set(2);
    store.user.name.set('Alice');

    // Get stats from middleware after a microtask
    setTimeout(() => {
        console.log('Listener stats:', listenerTracker.getStats());

        // Remove listener
        unsubscribe();

        // Change more values
        store.count.set(3);

        // Get updated stats after another microtask
        setTimeout(() => {
            console.log('Updated listener stats:', listenerTracker.getStats());

            // Demonstrate the listeners-cleared event
            demonstrateListenersCleared();

            // Demonstrate batching behavior
            demonstrateMicrotaskBatching();

            // Demonstrate multi-node middleware
            exampleMultiNodeMiddleware();

            // Clean up all middleware
            addedLogger();
            listenerTracker.unregister();
            listenersAddedHandler();
            listenersRemovedHandler();
            listenersClearedHandler();
        }, 0);
    }, 0);
}

// Run the example
exampleUsage();
