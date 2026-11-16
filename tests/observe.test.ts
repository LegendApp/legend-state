import { endBatch } from '../src/batching';
import { getNode } from '../src/globals';
import { observable } from '../src/observable';
import { observe } from '../src/observe';

describe('observe error recovery', () => {
    test('restores batching after the initial selector throws', () => {
        const source$ = observable(0);
        const target$ = observable(0);
        const error = new Error('selector failed');
        let targetCalls = 0;

        expect(() =>
            observe(() => {
                source$.get();
                throw error;
            }),
        ).toThrow(error);

        target$.onChange(() => targetCalls++);
        target$.set(1);
        const callsBeforeForcedCleanup = targetCalls;

        if (callsBeforeForcedCleanup === 0) {
            endBatch(true);
        }

        expect(callsBeforeForcedCleanup).toBe(1);
    });

    test('preserves a selector error when batched delivery also fails', () => {
        const target$ = observable(0);
        const selectorError = new Error('selector failed');
        const listenerError = new Error('listener failed');
        const listener = jest.fn(() => {
            throw listenerError;
        });
        target$.onChange(listener);

        expect(() =>
            observe(() => {
                target$.set(1);
                throw selectorError;
            }),
        ).toThrow(selectorError);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    test('keeps the previous subscription when a rerun throws', () => {
        const source$ = observable(0);
        const error = new Error('selector failed');
        let selectorCalls = 0;
        const dispose = observe(() => {
            selectorCalls++;
            const value = source$.get();
            if (value === 1) {
                throw error;
            }
        });

        expect(() => source$.set(1)).toThrow(error);
        expect(() => source$.set(2)).not.toThrow();
        const callsBeforeForcedCleanup = selectorCalls;

        if (callsBeforeForcedCleanup !== 3) {
            endBatch(true);
        }
        dispose();

        expect(callsBeforeForcedCleanup).toBe(3);
    });
});

test('a failed dependency switch retains previous listeners until tracking succeeds', () => {
    const chooseB$ = observable(false);
    const a$ = observable(0);
    const b$ = observable(0);
    let fail = false;
    let runs = 0;
    const dispose = observe(() => {
        runs++;
        const value = chooseB$.get() ? b$.get() : a$.get();
        if (fail) throw new Error('switch failed');
        return value;
    });
    fail = true;
    expect(() => chooseB$.set(true)).toThrow('switch failed');
    const afterFailure = runs;
    b$.set(1);
    expect(runs).toBe(afterFailure);
    fail = false;
    a$.set(1);
    expect(runs).toBe(afterFailure + 1);
    a$.set(2);
    expect(runs).toBe(afterFailure + 1);
    b$.set(2);
    expect(runs).toBe(afterFailure + 2);
    dispose();
});

describe('observe re-tracking', () => {
    test('keeps listeners for unchanged dependencies and swaps changed ones', () => {
        const state$ = observable({ flag: false, a: 1, b: 2, c: 3 });
        let runs = 0;
        const dispose = observe(() => {
            runs++;
            state$.c.get();
            if (state$.flag.get()) state$.a.get();
            else state$.b.get();
        });
        const listenerC = [...getNode(state$.c).listeners!][0];

        state$.flag.set(true);
        expect([...getNode(state$.c).listeners!][0]).toBe(listenerC);
        expect(getNode(state$.a).listeners?.size).toBe(1);
        expect(getNode(state$.b).listeners?.size ?? 0).toBe(0);
        expect(getNode(state$).numListenersRecursive).toBe(3);

        state$.b.set(20);
        expect(runs).toBe(2);
        state$.a.set(10);
        state$.c.set(30);
        expect(runs).toBe(4);

        dispose();
        expect(getNode(state$).numListenersRecursive).toBe(0);
    });
    test('resubscribes a dependency that became linked to another observable', () => {
        const other$ = observable(5);
        const state$ = observable<{ trigger: number; value: any }>({ trigger: 0, value: 1 });
        const seen: unknown[] = [];
        const dispose = observe(() => {
            state$.trigger.get();
            seen.push(state$.value.get());
        });

        state$.value.set(other$);
        state$.trigger.set(1);
        other$.set(6);
        expect(seen.at(-1)).toBe(6);
        dispose();
    });
});
