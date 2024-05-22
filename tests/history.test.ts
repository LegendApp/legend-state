import { beginBatch, endBatch } from '../src/batching';
import { trackHistory } from '../src/helpers/trackHistory';
import { undoRedo } from '../src/helpers/undoRedo';
import { observable } from '../src/observable';
import { promiseTimeout } from './testglobals';

describe('History', () => {
    test('Basic history', () => {
        const obs = observable({ test: 'hi' });
        const history = trackHistory(obs);

        obs.set({ test: 'hello' });

        const historyKeys = Object.keys(history);
        const firstKey = historyKeys[0]; // '1667050028427' (string)
        const historyObj = history.get(); // { '1667050028427': { test: 'hi' } }
        const firstEntry = historyObj[firstKey]; // { test: 'hi' }
        expect(firstEntry).toEqual({ test: 'hi' });
    });
    test('Two in history', async () => {
        const obs = observable({ test: 'hi' });
        const history = trackHistory(obs);

        obs.set({ test: 'hello' });
        await promiseTimeout(10);
        obs.set({ test: 'hello2' });

        const historyKeys = Object.keys(history);

        expect(history.get()[historyKeys[0]]).toEqual({ test: 'hi' });
        expect(history.get()[historyKeys[1]]).toEqual({ test: 'hello' });
    });
    test('Two keys in history', async () => {
        const obs = observable({ test: 'hi', test2: 'a' });
        const history = trackHistory(obs);

        obs.assign({ test: 'hello' });
        await promiseTimeout(10);
        obs.assign({ test2: 'b' });

        const historyKeys = Object.keys(history);

        expect(history.get()[historyKeys[0]]).toEqual({ test: 'hi' });
        expect(history.get()[historyKeys[1]]).toEqual({ test2: 'a' });
    });
    test('Multiple changes in history', () => {
        const obs = observable({ test: 'hi', test2: 'a' });
        const history = trackHistory(obs);

        obs.assign({ test: 'hello', test2: 'b' });

        const historyKeys = Object.keys(history);

        expect(history.get()[historyKeys[0]]).toEqual({ test: 'hi', test2: 'a' });
    });
    test('Batching changes in history', () => {
        const obs = observable({ test: 'hi', test2: 'a' });
        const history = trackHistory(obs);

        beginBatch();
        obs.assign({ test: 'hello' });
        obs.assign({ test2: 'b' });
        endBatch();

        const historyKeys = Object.keys(history);

        expect(history.get()[historyKeys[0]]).toEqual({ test: 'hi', test2: 'a' });
    });
    test('Batching changes in history with set', () => {
        const obs = observable({ test: 'hi', test2: 'a' });
        const history = trackHistory(obs);

        beginBatch();
        obs.test.set('hello');
        obs.test2.set('b');
        endBatch();

        const historyKeys = Object.keys(history);

        expect(history.get()[historyKeys[0]]).toEqual({ test: 'hi', test2: 'a' });
    });
    test('Adding to empty object', () => {
        const obs = observable({} as { test: string });
        const history = trackHistory(obs);

        obs.test.set('hello');

        const historyKeys = Object.keys(history);

        expect(history.get()[historyKeys[0]]).toEqual({ test: undefined });
    });
});

describe('Undo/Redo', () => {
    test('Undo/Redo', () => {
        const obs = observable({ test: 'hi' });
        const { undo, redo, undos$, redos$, getHistory } = undoRedo(obs);

        expect(undos$.get()).toBe(0);
        expect(redos$.get()).toBe(0);

        obs.set({ test: 'hello' });

        expect(undos$.get()).toBe(1);
        expect(redos$.get()).toBe(0);

        undo();
        expect(obs.get()).toEqual({ test: 'hi' });
        expect(undos$.get()).toBe(0);
        expect(redos$.get()).toBe(1);

        redo();
        expect(obs.get()).toEqual({ test: 'hello' });
        expect(undos$.get()).toBe(1);
        expect(redos$.get()).toBe(0);

        expect(getHistory()).toEqual([{ test: 'hi' }, { test: 'hello' }]);
    });

    test('Undo/Redo with multiple changes', () => {
        const obs = observable({ test: 'hi', test2: 'a' });
        const { undo, redo, undos$, redos$, getHistory } = undoRedo(obs);

        expect(undos$.get()).toBe(0);
        expect(redos$.get()).toBe(0);

        obs.assign({ test: 'hello', test2: 'b' });

        expect(undos$.get()).toBe(1);
        expect(redos$.get()).toBe(0);

        undo();
        expect(obs.get()).toEqual({ test: 'hi', test2: 'a' });
        expect(undos$.get()).toBe(0);
        expect(redos$.get()).toBe(1);

        redo();
        expect(obs.get()).toEqual({ test: 'hello', test2: 'b' });
        expect(undos$.get()).toBe(1);
        expect(redos$.get()).toBe(0);

        expect(getHistory()).toEqual([
            { test: 'hi', test2: 'a' },
            { test: 'hello', test2: 'b' },
        ]);
    });

    test('Undo/Redo with batching', () => {
        const obs = observable({ test: 'hi', test2: 'a' });
        const { undo, redo, undos$, redos$, getHistory } = undoRedo(obs);

        expect(undos$.get()).toBe(0);
        expect(redos$.get()).toBe(0);

        beginBatch();
        obs.assign({ test: 'hello' });
        obs.assign({ test2: 'b' });
        expect(undos$.get()).toBe(0);
        expect(redos$.get()).toBe(0);
        endBatch();

        expect(undos$.get()).toBe(1);
        expect(redos$.get()).toBe(0);

        undo();
        expect(obs.get()).toEqual({ test: 'hi', test2: 'a' });
        expect(undos$.get()).toBe(0);
        expect(redos$.get()).toBe(1);

        redo();
        expect(obs.get()).toEqual({ test: 'hello', test2: 'b' });
        expect(undos$.get()).toBe(1);
        expect(redos$.get()).toBe(0);

        expect(getHistory()).toEqual([
            { test: 'hi', test2: 'a' },
            { test: 'hello', test2: 'b' },
        ]);
    });

    test('Undo/Redo with multiple changes after undoing', () => {
        const obs$ = observable({ test: 'hi', test2: 'a' });
        const { undo, redo, undos$, redos$, getHistory } = undoRedo(obs$);

        expect(undos$.get()).toBe(0);
        expect(redos$.get()).toBe(0);

        obs$.test.set('hello');

        expect(undos$.get()).toBe(1);
        expect(redos$.get()).toBe(0);
        expect(obs$.test.get()).toBe('hello');
        expect(obs$.get()).toEqual({ test: 'hello', test2: 'a' });

        undo();
        expect(undos$.get()).toBe(0);
        expect(redos$.get()).toBe(1);
        expect(obs$.get()).toEqual({ test: 'hi', test2: 'a' });

        // no batching, so it'll change twice
        obs$.test2.set('b'); // from 'a'
        obs$.test.set('world'); // from 'hi'

        expect(undos$.get()).toBe(2); // should be 2 undos
        expect(redos$.get()).toBe(0); // deleted the existing redo
        expect(obs$.get()).toEqual({ test: 'world', test2: 'b' });

        undo();
        expect(undos$.get()).toBe(1);
        expect(redos$.get()).toBe(1);
        expect(obs$.get()).toEqual({ test: 'hi', test2: 'b' });

        undo();
        expect(undos$.get()).toBe(0);
        expect(redos$.get()).toBe(2);
        expect(obs$.get()).toEqual({ test: 'hi', test2: 'a' });

        redo();
        expect(undos$.get()).toBe(1);
        expect(redos$.get()).toBe(1);
        expect(obs$.get()).toEqual({ test: 'hi', test2: 'b' });

        expect(getHistory()).toEqual([
            { test: 'hi', test2: 'a' },
            { test: 'hi', test2: 'b' },
            { test: 'world', test2: 'b' },
        ]);
    });

    test('Undo/Redo with a limit on history length', () => {
        const obs$ = observable({ test: 'hi', test2: 'a' });
        const { undo, redo, undos$, redos$, getHistory } = undoRedo(obs$, { limit: 3 });

        expect(undos$.get()).toBe(0);
        expect(redos$.get()).toBe(0);

        obs$.test.set('hello');

        expect(undos$.get()).toBe(1);
        expect(redos$.get()).toBe(0);
        expect(obs$.test.get()).toBe('hello');
        expect(obs$.get()).toEqual({ test: 'hello', test2: 'a' });

        obs$.test2.set('b');

        expect(undos$.get()).toBe(2);
        expect(redos$.get()).toBe(0);
        expect(obs$.get()).toEqual({ test: 'hello', test2: 'b' });

        obs$.test.set('world');

        expect(getHistory()).toEqual([
            { test: 'hi', test2: 'a' },
            { test: 'hello', test2: 'a' },
            { test: 'hello', test2: 'b' },
            { test: 'world', test2: 'b' },
        ]);

        expect(undos$.get()).toBe(3); // number of undos
        expect(redos$.get()).toBe(0);
        expect(obs$.get()).toEqual({ test: 'world', test2: 'b' });

        obs$.test2.set('c');

        expect(getHistory()).toEqual([
            // { test: 'hi', test2: 'a' }, // truncated!
            { test: 'hello', test2: 'a' },
            { test: 'hello', test2: 'b' },
            { test: 'world', test2: 'b' },
            { test: 'world', test2: 'c' },
        ]);
        expect(undos$.get()).toBe(3); // number of undos
        expect(redos$.get()).toBe(0);

        obs$.test.set('terve'); // "hello" in finnish

        expect(getHistory()).toEqual([
            // { test: 'hi', test2: 'a' }, // truncated!
            // { test: 'hello', test2: 'a' }, // truncated!
            { test: 'hello', test2: 'b' },
            { test: 'world', test2: 'b' },
            { test: 'world', test2: 'c' },
            { test: 'terve', test2: 'c' },
        ]);

        expect(undos$.get()).toBe(3); // number of undos
        expect(redos$.get()).toBe(0);

        undo();
        undo();
        redo();

        expect(obs$.get()).toEqual({ test: 'world', test2: 'c' });
        expect(undos$.get()).toBe(2);
        expect(redos$.get()).toBe(1);
    });
});
