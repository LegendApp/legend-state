import { getNode, Observable, observable } from '@legendapp/state';
import { registerMiddleware, dispatchMiddlewareEvent } from '../src/middleware';
import type { MiddlewareEvent } from '../src/middleware';
import type { NodeInfo } from '../src/observableInterfaces';

jest?.setTimeout?.(1000);

describe('Middleware System', () => {
    let store: Observable<{ count: number; user: { name: string } }>;
    let rootNode: NodeInfo;
    let countNode: NodeInfo;
    let userNameNode: NodeInfo;

    // Setup before each test
    beforeEach(() => {
        // Create a fresh store for each test
        store = observable({ count: 0, user: { name: 'John' } });
        rootNode = getNode(store);
        countNode = getNode(store.count);
        userNameNode = getNode(store.user.name);

        // Reset any microtasks
        jest.useRealTimers();
    });

    describe('Middleware Registration', () => {
        test('should register a middleware handler for a specific event type', () => {
            const handler = jest.fn();
            const unregister = registerMiddleware(countNode, 'listener-added', handler);

            // Make sure the returned function is callable
            expect(typeof unregister).toBe('function');

            // Add a listener to trigger the middleware
            store.count.onChange(() => {});

            // Wait for microtask to complete
            return new Promise((resolve) => {
                setTimeout(() => {
                    expect(handler).toHaveBeenCalledTimes(1);
                    const event = handler.mock.calls[0][0] as MiddlewareEvent;
                    expect(event.type).toBe('listener-added');
                    expect(event.node).toBe(countNode);
                    expect(event.timestamp).toBeDefined();
                    resolve(null);
                }, 0);
            });
        });

        test('should unregister a middleware handler', () => {
            const handler = jest.fn();
            const unregister = registerMiddleware(countNode, 'listener-added', handler);

            // Unregister the handler
            unregister();

            // Add a listener which would trigger the middleware if still registered
            store.count.onChange(() => {});

            // Wait for microtask to complete
            return new Promise((resolve) => {
                setTimeout(() => {
                    expect(handler).not.toHaveBeenCalled();
                    resolve(null);
                }, 0);
            });
        });

        test('should support multiple handlers for the same event type', () => {
            const handler1 = jest.fn();
            const handler2 = jest.fn();

            registerMiddleware(countNode, 'listener-added', handler1);
            registerMiddleware(countNode, 'listener-added', handler2);

            // Add a listener to trigger both middleware handlers
            store.count.onChange(() => {});

            // Wait for microtask to complete
            return new Promise((resolve) => {
                setTimeout(() => {
                    expect(handler1).toHaveBeenCalledTimes(1);
                    expect(handler2).toHaveBeenCalledTimes(1);
                    resolve(null);
                }, 0);
            });
        });

        test('should support handlers for different event types', () => {
            const addedHandler = jest.fn();
            const removedHandler = jest.fn();

            registerMiddleware(countNode, 'listener-added', addedHandler);
            registerMiddleware(countNode, 'listener-removed', removedHandler);

            // Add and then remove a listener to trigger both middleware handlers
            const unsubscribe = store.count.onChange(() => {});

            // Wait for microtask to complete
            return new Promise((resolve) => {
                setTimeout(() => {
                    expect(addedHandler).toHaveBeenCalledTimes(1);
                    expect(removedHandler).toHaveBeenCalledTimes(0);

                    setTimeout(() => {
                        unsubscribe();
                        setTimeout(() => {
                            expect(addedHandler).toHaveBeenCalledTimes(1);
                            expect(removedHandler).toHaveBeenCalledTimes(1);
                            resolve(null);
                        }, 0);
                    }, 0);
                }, 0);
            });
        });
    });

    describe('Event Validation and Batching', () => {
        test('should batch events in a microtask', () => {
            const countHandler = jest.fn();
            const nameHandler = jest.fn();

            registerMiddleware(countNode, 'listener-added', countHandler);
            registerMiddleware(userNameNode, 'listener-added', nameHandler);

            // Add multiple listeners
            store.count.onChange(() => {});
            store.user.name.onChange(() => {});

            // Handlers should not be called synchronously
            expect(countHandler).not.toHaveBeenCalled();
            expect(nameHandler).not.toHaveBeenCalled();

            // Wait for microtask to complete
            return new Promise((resolve) => {
                setTimeout(() => {
                    expect(countHandler).toHaveBeenCalledTimes(1);
                    expect(nameHandler).toHaveBeenCalledTimes(1);
                    resolve(null);
                }, 0);
            });
        });

        test('should validate listener-added events before dispatching', () => {
            const handler = jest.fn();
            registerMiddleware(countNode, 'listener-added', handler);

            // Create a listener and get the NodeListener object
            const unsubscribe = store.count.onChange(() => {});

            // Extract the listener from the node's listener set
            const listener = Array.from(countNode.listeners || [])[0];

            // Directly dispatch a listener-added event with a listener that exists
            dispatchMiddlewareEvent(countNode, listener, 'listener-added');

            // Wait for first microtask to complete
            return new Promise((resolve) => {
                setTimeout(() => {
                    // Should be called twice - once from onChange and once from direct dispatch
                    expect(handler).toHaveBeenCalledTimes(2);

                    // Now remove the listener
                    unsubscribe();

                    // Reset the mock
                    handler.mockReset();

                    // Try to dispatch for a listener that no longer exists
                    dispatchMiddlewareEvent(countNode, listener, 'listener-added');

                    // Wait for second microtask
                    setTimeout(() => {
                        // Should not be called because listener is no longer valid
                        expect(handler).not.toHaveBeenCalled();
                        resolve(null);
                    }, 0);
                }, 0);
            });
        });

        test('should validate listener-removed events before dispatching', () => {
            const handler = jest.fn();
            registerMiddleware(countNode, 'listener-removed', handler);

            // Create a listener and immediately capture its reference
            const unsubscribe = store.count.onChange(() => {});
            const listener = Array.from(countNode.listeners || [])[0];

            // Remove the listener
            unsubscribe();

            // Wait for first microtask to complete
            return new Promise((resolve) => {
                setTimeout(() => {
                    expect(handler).toHaveBeenCalledTimes(1);

                    // Reset the mock
                    handler.mockReset();

                    // Try to dispatch another removed event for the same listener
                    dispatchMiddlewareEvent(countNode, listener, 'listener-removed');

                    // Wait for second microtask
                    setTimeout(() => {
                        // Should be called because the listener is indeed removed
                        expect(handler).toHaveBeenCalledTimes(1);
                        resolve(null);
                    }, 0);
                }, 0);
            });
        });
    });

    test('should validate listeners-cleared events on root node before dispatching', () => {
        const handler = jest.fn();
        // Register middleware on the root node so it can observe when the entire tree is cleared
        registerMiddleware(rootNode, 'listeners-cleared', handler);

        // Add and remove a single listener to trigger listeners-cleared on both the node and root
        const unsubscribe = store.user.name.onChange(() => {});
        unsubscribe();

        // Wait for first microtask to complete
        return new Promise((resolve) => {
            setTimeout(() => {
                expect(handler).toHaveBeenCalledTimes(1);

                // Reset the mock
                handler.mockReset();

                // Add another listener so the node is not empty
                store.user.name.onChange(() => {});

                // Try to dispatch a cleared event when there are still listeners
                dispatchMiddlewareEvent(rootNode, undefined, 'listeners-cleared');

                // Wait for second microtask
                setTimeout(() => {
                    // Should not be called because node still has listeners
                    expect(handler).not.toHaveBeenCalled();
                    resolve(null);
                }, 0);
            }, 0);
        });
    });

    describe('Event Types', () => {
        test('should detect when all listeners are cleared from a node', () => {
            const clearedHandler = jest.fn();
            registerMiddleware(countNode, 'listeners-cleared', clearedHandler);

            // Add multiple listeners
            const unsubscribe1 = store.count.onChange(() => {});
            const unsubscribe2 = store.count.onChange(() => {});

            // Remove just one listener - should not trigger cleared event
            unsubscribe1();

            // Wait for first microtask to complete
            return new Promise((resolve) => {
                setTimeout(() => {
                    expect(clearedHandler).not.toHaveBeenCalled();

                    // Remove the last listener - should trigger cleared event
                    unsubscribe2();

                    // Wait for second microtask
                    setTimeout(() => {
                        expect(clearedHandler).toHaveBeenCalledTimes(1);
                        resolve(null);
                    }, 0);
                }, 0);
            });
        });

        test('should handle immediate and non-immediate listeners correctly', () => {
            const addedHandler = jest.fn();
            const removedHandler = jest.fn();
            const clearedHandler = jest.fn();

            registerMiddleware(countNode, 'listener-added', addedHandler);
            registerMiddleware(countNode, 'listener-removed', removedHandler);
            registerMiddleware(countNode, 'listeners-cleared', clearedHandler);

            // Add an immediate and non-immediate listener
            const unsubscribe1 = store.count.onChange(() => {}, { immediate: false });
            const unsubscribe2 = store.count.onChange(() => {}, { immediate: true });

            // Wait for first microtask to complete
            return new Promise((resolve) => {
                setTimeout(() => {
                    expect(addedHandler).toHaveBeenCalledTimes(2);

                    // Remove one of each type of listener
                    unsubscribe1();
                    unsubscribe2();

                    // Wait for second microtask
                    setTimeout(() => {
                        expect(removedHandler).toHaveBeenCalledTimes(2);
                        // Both listener types were cleared
                        expect(clearedHandler).toHaveBeenCalledTimes(2);
                        resolve(null);
                    }, 0);
                }, 0);
            });
        });
    });

    describe('Node-specific Middleware', () => {
        test('should only trigger middleware for the registered node', () => {
            const rootHandler = jest.fn();
            const countHandler = jest.fn();
            const userNameHandler = jest.fn();

            registerMiddleware(rootNode, 'listener-added', rootHandler);
            registerMiddleware(countNode, 'listener-added', countHandler);
            registerMiddleware(userNameNode, 'listener-added', userNameHandler);

            // Add listeners to different nodes
            store.count.onChange(() => {});
            store.user.name.onChange(() => {});

            // Wait for microtask to complete
            return new Promise((resolve) => {
                setTimeout(() => {
                    // Root handler should NOT receive events from child nodes
                    expect(rootHandler).toHaveBeenCalledTimes(0);

                    // Node-specific handlers should only see their own events
                    expect(countHandler).toHaveBeenCalledTimes(1);
                    expect(userNameHandler).toHaveBeenCalledTimes(1);

                    resolve(null);
                }, 0);
            });
        });

        test('should verify that events do not bubble up the tree', () => {
            // Set up handlers at different levels
            const parentHandler = jest.fn();
            const childHandler = jest.fn();

            // Register middleware on parent and child nodes
            registerMiddleware(rootNode, 'listener-added', parentHandler);
            registerMiddleware(countNode, 'listener-added', childHandler);

            // Add a listener to the child node
            store.count.onChange(() => {});

            // Add a listener to the parent node
            store.onChange(() => {});

            // Wait for microtask to complete
            return new Promise((resolve) => {
                setTimeout(() => {
                    // Parent handler should only be called for events on itself
                    expect(parentHandler).toHaveBeenCalledTimes(1);

                    // Child handler should only be called for events on itself
                    expect(childHandler).toHaveBeenCalledTimes(1);

                    resolve(null);
                }, 0);
            });
        });
    });

    describe('Error Handling', () => {
        test('should continue processing events if a handler throws', () => {
            const errorHandler = jest.fn().mockImplementation(() => {
                throw new Error('Test error');
            });
            const normalHandler = jest.fn();

            // Spy on console.error
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            registerMiddleware(countNode, 'listener-added', errorHandler);
            registerMiddleware(countNode, 'listener-added', normalHandler);

            // Add a listener to trigger the middleware
            store.count.onChange(() => {});

            // Wait for microtask to complete
            return new Promise((resolve) => {
                setTimeout(() => {
                    // Error should be caught and logged
                    expect(consoleErrorSpy).toHaveBeenCalled();

                    // Both handlers should be called
                    expect(errorHandler).toHaveBeenCalledTimes(1);
                    expect(normalHandler).toHaveBeenCalledTimes(1);

                    // Clean up
                    consoleErrorSpy.mockRestore();
                    resolve(null);
                }, 0);
            });
        });
    });
});
