import { beginBatch, endBatch } from '../src/batching';
import { trackHistory } from '../src/history/trackHistory';
import { observable } from '../src/observable';

function promiseTimeout(time?: number) {
    return new Promise((resolve) => setTimeout(resolve, time || 0));
}

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
