import { Tracking } from '../src/globals';
import { observable } from '../src/observable';
import { event } from '../src/event';
import { beginTracking, endTracking, tracking } from '../src/tracking';

let prevTracking = undefined;
beforeEach(() => {
    prevTracking = beginTracking();
});
afterEach(() => {
    endTracking(prevTracking);
});

describe('Tracking', () => {
    test('get() observes', () => {
        const obs = observable({ test: { test2: { test3: 'hi' } } });
        obs.test.test2.test3.get();

        expect(tracking.nodes.size).toEqual(1);
    });
    test('get(false) does not observe', () => {
        const obs = observable({ test: { test2: { test3: 'hi' } } });
        obs.test.test2.test3.get(false);

        expect(tracking.nodes.size).toEqual(0);
    });
    test('obs() does not observe', () => {
        const obs = observable({ test: { test2: { test3: 'hi' } } });
        const ref = obs.test.test2.obs();

        expect(tracking.nodes).toEqual(undefined);

        expect(ref.get(false)).toEqual({ test3: 'hi' });
    });
    test('obs(true) observes', () => {
        const obs = observable({ test: { test2: { test3: 'hi' } } });
        const ref = obs.test.test2.obs(true);

        expect(tracking.nodes.size).toEqual(1);

        expect(ref.get()).toEqual({ test3: 'hi' });
    });
    test('child of obs() observes', () => {
        const obs = observable({ test: { test2: { test3: 'hi' } } });
        const ref = obs.test.test2.obs();

        expect(tracking.nodes).toEqual(undefined);

        ref.test3;

        expect(tracking.nodes.size).toEqual(1);

        expect(ref.get()).toEqual({ test3: 'hi' });
    });
    test('set() does not observe', () => {
        const obs = observable({ test: { test2: { test3: 'hi' } } });
        obs.test.test2.test3.set('hello');

        expect(tracking.nodes.size).toEqual(0);
    });
    test('primitive access observes', () => {
        const obs = observable({ test: 'hi' });
        obs.test;

        expect(tracking.nodes.size).toEqual(1);
    });
    test('object access does not observe', () => {
        const obs = observable({ test: { text: 'hi' } });
        obs.test;

        expect(tracking.nodes).toEqual(undefined);
    });
    test('get() observes', () => {
        const obs = observable({ test: { text: 'hi' } });

        obs.test.get();

        expect(tracking.nodes.size).toEqual(1);

        const nodes = [...tracking.nodes.values()];
        expect(nodes[0].manual).toEqual(true);
        expect(nodes[0].track).toEqual(true);
    });
    test('get() shallow', () => {
        const obs = observable({ test: { text: 'hi' } });

        obs.test.get(Tracking.shallow);

        expect(tracking.nodes.size).toEqual(1);

        const nodes = [...tracking.nodes.values()];
        expect(nodes[0].manual).toEqual(true);
        expect(nodes[0].track).toEqual(Tracking.shallow);
    });
    test('primitive get access observes', () => {
        const obs = observable({ test: 'hi' });
        obs.test.get();

        expect(tracking.nodes.size).toEqual(1);
    });
    test('Object.keys(obs) observes shallow', () => {
        const obs = observable({ test: { text: 'hi' } });

        Object.keys(obs);

        expect(tracking.nodes.size).toEqual(1);

        const nodes = [...tracking.nodes.values()];

        expect(nodes[0].node.key).toEqual(undefined);
        expect(nodes[0].track).toEqual(Tracking.shallow);
    });
    test('Object.entries(obs) observes shallow', () => {
        const obs = observable({ test: { text: 'hi' } });

        Object.entries(obs);

        expect(tracking.nodes.size).toEqual(1);

        const nodes = [...tracking.nodes.values()];

        expect(nodes[0].node.key).toEqual(undefined);
        expect(nodes[0].track).toEqual(Tracking.shallow);
    });
    test('Accessing undefined observes', () => {
        const obs = observable({ test: {} as Record<string, { text: 'hi' }> });

        obs.test['a'];

        expect(tracking.nodes.size).toEqual(1);

        const nodes = [...tracking.nodes.values()];

        expect(nodes[0].node.key).toEqual('a');
    });
    test('get() an event observes', () => {
        const evt = event();

        evt.get();

        expect(tracking.nodes.size).toEqual(1);
    });
    test('value on a primitive observes', () => {
        const prim = observable(0);

        const a = prim.value;

        const nodes = [...tracking.nodes.values()];
        expect(nodes[0].node.key).toEqual(undefined);
    });
    test('Array map observes arary', () => {
        const obs = observable({
            arr: [
                { id: 1, text: 'hi1' },
                { id: 2, text: 'hi2' },
            ],
        });

        obs.arr.map((it) => it);

        expect(tracking.nodes.size).toEqual(1);

        const nodes = [...tracking.nodes.values()];

        expect(nodes[0].node.key).toEqual('arr');
    });
    test('Array length observes array shallow', () => {
        const obs = observable({
            arr: [{ id: 1, text: 'hi1' }],
        });

        obs.arr.length;

        expect(tracking.nodes.size).toEqual(1);

        const nodes = [...tracking.nodes.values()];

        expect(nodes[0].node.key).toEqual('arr');
        expect(nodes[0].track).toEqual(Tracking.shallow);
    });
    test('obs() untracks only last accessed', () => {
        const obs = observable({ text: 'hi' });
        const text = obs.text;

        const ref = obs.text.obs();

        expect(tracking.nodes.size).toEqual(1);
    });
    test('obs(key) untracks only last accessed', () => {
        const obs = observable({ text: 'hi' });
        const text = obs.text;

        const ref = obs.obs('text');

        expect(tracking.nodes.size).toEqual(1);
    });
});
