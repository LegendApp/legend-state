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
        const obs = observable({ test: 'hi' });
        obs.test.get();

        expect(tracking.nodes.size).toEqual(0);
    });
    test('ref() does not observe', () => {
        const obs = observable({ test: 'hi' });
        const ref = obs.test.ref();

        expect(ref.get()).toEqual('hi');

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
    test('Object.keys(obs) observes', () => {
        const obs = observable({ test: { text: 'hi' } });

        Object.keys(obs);

        expect(tracking.nodes.size).toEqual(1);
    });
    test('Accessing undefined observes', () => {
        const obs = observable({ test: {} as Record<string, { text: 'hi' }> });

        obs.test['a'];

        expect(tracking.nodes.size).toEqual(1);

        const nodes = [...tracking.nodes.values()];

        expect(nodes[0].node.key).toEqual('a');
    });
});
