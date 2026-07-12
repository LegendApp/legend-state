import { getNode, observable, observablePrimitive } from '@legendapp/state';
import { onObservableCreated } from '../src/middleware';
import type { NodeInfo } from '../src/observableInterfaces';

jest?.setTimeout?.(1000);

describe('Devtools Support', () => {
    describe('Observable Naming', () => {
        test('observable accepts a name option', () => {
            const store = observable({ count: 0 }, { name: 'myStore' });
            const node = getNode(store);
            expect(node._name).toBe('myStore');
        });

        test('observablePrimitive accepts a name option', () => {
            const count = observablePrimitive(0, { name: 'count' });
            const node = getNode(count);
            expect(node._name).toBe('count');
        });

        test('observable without name option has no _name', () => {
            const store = observable({ count: 0 });
            const node = getNode(store);
            expect(node._name).toBeUndefined();
        });

        test('observable with empty options has no _name', () => {
            const store = observable({ count: 0 }, {});
            const node = getNode(store);
            expect(node._name).toBeUndefined();
        });

        test('child nodes derive path from parent _name and key', () => {
            const store = observable({ user: { name: 'Alice' } }, { name: 'appStore' });
            const rootNode = getNode(store);
            const userNode = getNode(store.user);
            const nameNode = getNode(store.user.name);

            expect(rootNode._name).toBe('appStore');
            // Child nodes have keys that can be combined with root name for full path
            expect(userNode.key).toBe('user');
            expect(nameNode.key).toBe('name');
            expect(nameNode.parent).toBe(userNode);
        });
    });

    describe('onObservableCreated', () => {
        test('fires handler when observable is created', () => {
            const handler = jest.fn();
            const unsub = onObservableCreated(handler);

            const store = observable({ count: 0 });
            expect(handler).toHaveBeenCalledTimes(1);

            const node = handler.mock.calls[0][0] as NodeInfo;
            expect(node).toBe(getNode(store));

            unsub();
        });

        test('fires handler when observablePrimitive is created', () => {
            const handler = jest.fn();
            const unsub = onObservableCreated(handler);

            const count = observablePrimitive(42);
            expect(handler).toHaveBeenCalledTimes(1);

            const node = handler.mock.calls[0][0] as NodeInfo;
            expect(node).toBe(getNode(count));

            unsub();
        });

        test('handler receives node with _name when name option is provided', () => {
            const handler = jest.fn();
            const unsub = onObservableCreated(handler);

            observable({ count: 0 }, { name: 'myStore' });
            expect(handler).toHaveBeenCalledTimes(1);

            const node = handler.mock.calls[0][0] as NodeInfo;
            expect(node._name).toBe('myStore');

            unsub();
        });

        test('unsubscribe stops notifications', () => {
            const handler = jest.fn();
            const unsub = onObservableCreated(handler);

            observable({ a: 1 });
            expect(handler).toHaveBeenCalledTimes(1);

            unsub();

            observable({ b: 2 });
            expect(handler).toHaveBeenCalledTimes(1);
        });

        test('multiple handlers all fire', () => {
            const handler1 = jest.fn();
            const handler2 = jest.fn();
            const unsub1 = onObservableCreated(handler1);
            const unsub2 = onObservableCreated(handler2);

            observable({ x: 1 });
            expect(handler1).toHaveBeenCalledTimes(1);
            expect(handler2).toHaveBeenCalledTimes(1);

            unsub1();
            unsub2();
        });

        test('handler error does not prevent other handlers from firing', () => {
            const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
            const handler1 = jest.fn(() => {
                throw new Error('test error');
            });
            const handler2 = jest.fn();
            const unsub1 = onObservableCreated(handler1);
            const unsub2 = onObservableCreated(handler2);

            observable({ x: 1 });
            expect(handler1).toHaveBeenCalledTimes(1);
            expect(handler2).toHaveBeenCalledTimes(1);
            expect(consoleError).toHaveBeenCalledTimes(1);

            unsub1();
            unsub2();
            consoleError.mockRestore();
        });

        test('zero cost when no handlers registered', () => {
            const store = observable({ count: 0 });
            expect(store.count.get()).toBe(0);
        });

        test('does not fire for already-observable values passed to observable()', () => {
            const handler = jest.fn();
            const unsub = onObservableCreated(handler);

            const original = observable({ a: 1 });
            handler.mockClear();

            const same = observable(original);
            expect(handler).toHaveBeenCalledTimes(0);
            expect(same).toBe(original);

            unsub();
        });
    });

    describe('Path Derivation Helper', () => {
        test('can derive full path from node chain', () => {
            const store = observable(
                {
                    users: {
                        alice: { age: 30 },
                    },
                },
                { name: 'store' },
            );

            const ageNode = getNode(store.users.alice.age);

            const path = getNodePath(ageNode);
            expect(path).toBe('store.users.alice.age');
        });

        test('path without root name uses anonymous prefix', () => {
            const store = observable({
                x: { y: 1 },
            });

            const yNode = getNode(store.x.y);
            const path = getNodePath(yNode);
            expect(path).toBe('<anonymous>.x.y');
        });
    });
});

function getNodePath(node: NodeInfo): string {
    const parts: string[] = [];
    let current: NodeInfo | undefined = node;
    while (current) {
        if (current.key) {
            parts.unshift(current.key);
        } else if (current._name) {
            parts.unshift(current._name);
        } else if (!current.parent) {
            parts.unshift('<anonymous>');
        }
        current = current.parent;
    }
    return parts.join('.');
}
