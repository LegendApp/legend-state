import { getNode, observable, observe } from '@legendapp/state';

describe('onChange disposal', () => {
    test('disposing twice preserves recursive counts and later listeners', () => {
        const source$ = observable({ value: 0 });
        const rootNode = getNode(source$);
        const valueNode = getNode(source$.value);
        const dispose = source$.value.onChange(() => {});

        expect(valueNode.numListenersRecursive).toBe(1);
        expect(rootNode.numListenersRecursive).toBe(1);

        dispose();
        dispose();

        expect(valueNode.numListenersRecursive).toBe(0);
        expect(rootNode.numListenersRecursive).toBe(0);

        let calls = 0;
        const disposeNext = source$.value.onChange(() => calls++);
        source$.value.set(1);
        disposeNext();

        expect(calls).toBe(1);
    });

    test('disposing a linked listener twice preserves both node counts', () => {
        const source$ = observable({ value: 0 });
        const linked$ = observable(() => source$.value);
        linked$.get();
        const sourceNode = getNode(source$.value);
        const linkedNode = getNode(linked$);
        const sourceCountBefore = sourceNode.numListenersRecursive;
        const linkedCountBefore = linkedNode.numListenersRecursive;
        const dispose = linked$.onChange(() => {});

        dispose();
        dispose();

        expect(sourceNode.numListenersRecursive).toBe(sourceCountBefore);
        expect(linkedNode.numListenersRecursive).toBe(linkedCountBefore);
    });

    test('observe disposal remains idempotent', () => {
        const source$ = observable(0);
        const sourceNode = getNode(source$);
        const countBefore = sourceNode.numListenersRecursive;
        const dispose = observe(() => source$.get());

        dispose();
        dispose();

        expect(sourceNode.numListenersRecursive).toBe(countBefore);
    });

    test('a throwing initial callback does not leave an orphaned listener', () => {
        const source$ = observable(0);
        const sourceNode = getNode(source$);
        const error = new Error('initial listener failed');

        expect(() =>
            source$.onChange(
                () => {
                    throw error;
                },
                { initial: true },
            ),
        ).toThrow(error);

        expect(sourceNode.listeners?.size).toBe(0);
        expect(sourceNode.numListenersRecursive).toBe(0);
    });

    test('a linked listener delivers its initial callback once', () => {
        const source$ = observable(0);
        const linked$ = observable(() => source$);
        linked$.get();
        let calls = 0;

        const dispose = linked$.onChange(() => calls++, { initial: true });

        expect(calls).toBe(1);

        dispose();
    });
});
