import { event } from '../src/event';
import { observable } from '../src/observable';
import { beginTracking, endTracking, tracking } from '../src/tracking';

beforeEach(() => {
    beginTracking();
});
afterEach(() => {
    endTracking();
});

describe('Tracking', () => {
    test('get() observes', () => {
        const obs = observable({ test: { test2: { test3: 'hi' } } });
        obs.test.test2.test3.get();

        expect(tracking.current!.nodes!.size).toEqual(1);
    });
    test('peek() does not observe', () => {
        const obs = observable({ test: { test2: { test3: 'hi' } } });
        obs.test.test2.test3.peek();

        expect(tracking.current?.nodes).toEqual(undefined);
    });
    test('set() does not observe', () => {
        const obs = observable({ test: { test2: { test3: 'hi' } } });

        obs.test.test2.test3.set('hello');

        expect(tracking.current?.nodes).toEqual(undefined);
    });
    test('primitive access observes', () => {
        const obs = observable({ test: 'hi' });
        obs.test.get();

        expect(tracking.current!.nodes!.size).toEqual(1);
    });
    test('object access does not observe', () => {
        const obs = observable({ test: { text: 'hi' } });
        obs.test;

        expect(tracking.current?.nodes).toEqual(undefined);
    });
    test('get() observes2', () => {
        const obs = observable({ test: { text: 'hi' } });

        obs.test.get();

        expect(tracking.current!.nodes!.size).toEqual(1);

        const nodes = [...tracking.current!.nodes!.values()];
        expect(nodes[0].track).toEqual(undefined);
    });
    test('get() shallow', () => {
        const obs = observable({ test: { text: 'hi' } });

        obs.test.get(true);

        expect(tracking.current!.nodes!.size).toEqual(1);

        const nodes = [...tracking.current!.nodes!.values()];
        expect(nodes[0].track).toEqual(true);
    });
    test('primitive get access observes', () => {
        const obs = observable({ test: 'hi' });
        obs.test.get();

        expect(tracking.current!.nodes!.size).toEqual(1);
    });
    test('Object.keys(obs) observes shallow', () => {
        const obs = observable({ test: { text: 'hi' } });

        Object.keys(obs);

        expect(tracking.current!.nodes!.size).toEqual(1);

        const nodes = [...tracking.current!.nodes!.values()];

        expect(nodes[0].node.key).toEqual(undefined);
        expect(nodes[0].track).toEqual(true);
    });
    test('Object.entries(obs) observes shallow', () => {
        const obs = observable({ test: { text: 'hi' } });

        Object.entries(obs);

        expect(tracking.current!.nodes!.size).toEqual(1);

        const nodes = [...tracking.current!.nodes!.values()];

        expect(nodes[0].node.key).toEqual(undefined);
        expect(nodes[0].track).toEqual(true);
    });
    test('Accessing undefined observes', () => {
        const obs = observable({ test: {} as Record<string, { text: 'hi' }> });

        obs.test['a'].get();

        expect(tracking.current!.nodes!.size).toEqual(1);

        const nodes = [...tracking.current!.nodes!.values()];

        expect(nodes[0].node.key).toEqual('a');
    });
    test('get() an event observes', () => {
        const evt = event();

        evt.get();

        expect(tracking.current!.nodes!.size).toEqual(1);
    });
    test('Array map observes arary', () => {
        const obs = observable({
            arr: [
                { id: 1, text: 'hi1' },
                { id: 2, text: 'hi2' },
            ],
        });

        obs.arr.map((it) => it);

        expect(tracking.current!.nodes!.size).toEqual(1);

        const nodes = [...tracking.current!.nodes!.values()];

        expect(nodes[0].node.key).toEqual('arr');
    });
    test('Array length observes array shallow', () => {
        const obs = observable({
            arr: [{ id: 1, text: 'hi1' }],
        });

        obs.arr.length;

        expect(tracking.current!.nodes!.size).toEqual(1);

        const nodes = [...tracking.current!.nodes!.values()];

        expect(nodes[0].node.key).toEqual('arr');
        expect(nodes[0].track).toEqual(true);
    });
});
