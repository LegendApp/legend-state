import { shallow } from '../src/globals';
import { observable } from '../src/observable';
import { observableEvent } from '../src/observableEvent';
import { tracking } from '../src/tracking';

beforeEach(() => {
    tracking.nodes = new Map();
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
    test('ref() does not observe', () => {
        const obs = observable({ test: { test2: { test3: 'hi' } } });
        const ref = obs.test.test2.ref();

        expect(tracking.nodes.size).toEqual(0);

        expect(ref.get(false)).toEqual({ test3: 'hi' });
    });
    test('ref(true) observes', () => {
        const obs = observable({ test: { test2: { test3: 'hi' } } });
        const ref = obs.test.test2.ref(true);

        expect(tracking.nodes.size).toEqual(1);

        expect(ref.get()).toEqual({ test3: 'hi' });
    });
    test('child of ref() observes', () => {
        const obs = observable({ test: { test2: { test3: 'hi' } } });
        const ref = obs.test.test2.ref();

        expect(tracking.nodes.size).toEqual(0);

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

        expect(tracking.nodes.size).toEqual(0);
    });
    test('get() observes', () => {
        const obs = observable({ test: { text: 'hi' } });

        obs.test.get();

        expect(tracking.nodes.size).toEqual(1);

        const nodes = [...tracking.nodes.values()];
        expect(nodes[0].manual).toEqual(true);
        expect(nodes[0].shallow).toEqual(false);
    });
    test('get() shallow', () => {
        const obs = observable({ test: { text: 'hi' } });

        obs.test.get(shallow);

        expect(tracking.nodes.size).toEqual(1);

        const nodes = [...tracking.nodes.values()];
        expect(nodes[0].manual).toEqual(true);
        expect(nodes[0].shallow).toEqual(true);
    });
    test('primitive get access observes', () => {
        const obs = observable({ test: 'hi' });
        obs.test.get();

        expect(tracking.nodes.size).toEqual(1);
    });
    test('Object.keys(obs) observes', () => {
        const obs = observable({ test: { text: 'hi' } });

        Object.keys(obs);

        expect(tracking.nodes.size).toEqual(1);

        const nodes = [...tracking.nodes.values()];

        expect(nodes[0].node.key).toEqual(undefined);
        expect(nodes[0].shallow).toEqual(true);
    });
    test('Accessing undefined observes', () => {
        const obs = observable({ test: {} as Record<string, { text: 'hi' }> });

        obs.test['a'];

        expect(tracking.nodes.size).toEqual(1);

        const nodes = [...tracking.nodes.values()];

        expect(nodes[0].node.key).toEqual('a');
    });
    test('get() an event observes', () => {
        const evt = observableEvent();

        evt.get();

        expect(tracking.nodes.size).toEqual(1);
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
        expect(nodes[0].shallow).toEqual(true);
    });
});
