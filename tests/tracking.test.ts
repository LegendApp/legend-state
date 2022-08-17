import { tracking } from '../src/state';
import { isObservable } from '../src/helpers';
import { observable } from '../src/observable';
import { observableBatcher } from '../src/observableBatcher';
import { observableComputed } from '../src/observableComputed';
import { observableEvent } from '../src/observableEvent';
import { ObservableType } from '../src/observableInterfaces';

beforeEach(() => {
    tracking.nodes = new Map();
});

describe('Tracking', () => {
    test('get() does not observe', () => {
        const obs = observable({ test: { test2: { test3: 'hi' } } });
        obs.test.test2.test3.get();

        expect(tracking.nodes.size).toEqual(0);
    });
    test('ref() does not observe', () => {
        const obs = observable({ test: { test2: { test3: 'hi' } } });
        const ref = obs.test.test2.ref();

        expect(ref.get()).toEqual({ test3: 'hi' });

        expect(tracking.nodes.size).toEqual(0);
    });
    test('child of ref() observes', () => {
        const obs = observable({ test: { test2: { test3: 'hi' } } });
        const ref = obs.test.test2.ref();

        expect(ref.get()).toEqual({ test3: 'hi' });

        expect(tracking.nodes.size).toEqual(0);

        ref.test3;

        expect(tracking.nodes.size).toEqual(1);
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
    test('object access observes', () => {
        const obs = observable({ test: { text: 'hi' } });
        obs.test;

        expect(tracking.nodes.size).toEqual(1);
    });
    test('observe() observes', () => {
        const obs = observable({ test: { text: 'hi' } });

        obs.test.observe();

        expect(tracking.nodes.size).toEqual(1);

        const nodes = [...tracking.nodes.values()];
        expect(nodes[0].manual).toEqual(true);
        expect(nodes[0].shallow).toEqual(undefined);
    });
    test('observe() shallow', () => {
        const obs = observable({ test: { text: 'hi' } });

        obs.test.observe(true);

        expect(tracking.nodes.size).toEqual(1);

        const nodes = [...tracking.nodes.values()];
        expect(nodes[0].manual).toEqual(true);
        expect(nodes[0].shallow).toEqual(true);
    });
    test('primitive observe access observes', () => {
        const obs = observable({ test: 'hi' });
        obs.test.observe();

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
    test('Observing an event observes', () => {
        const evt = observableEvent();

        evt.observe();

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
