import { endBatch } from '../src/batching';
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
