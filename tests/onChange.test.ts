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

describe('onChange paths through ancestors without listeners', () => {
    test('root and middle listeners get full paths and types across maps and arrays', () => {
        const state$ = observable({ a: new Map([['m', { arr: [{ b: { c: 1 } }] }]]) });
        const rootChanges: any[] = [];
        const middleChanges: any[] = [];
        const immediateChanges: any[] = [];
        state$.onChange(({ changes }) => rootChanges.push(...changes));
        state$.a.get('m').arr.onChange(({ changes }) => middleChanges.push(...changes));
        state$.onChange(({ changes }) => immediateChanges.push(...changes), { immediate: true });

        state$.a.get('m').arr[0].b.c.set(2);

        const expected = {
            path: ['a', 'm', 'arr', '0', 'b', 'c'],
            pathTypes: ['map', 'object', 'array', 'object', 'object', 'object'],
            valueAtPath: 2,
            prevAtPath: 1,
        };
        expect(rootChanges).toEqual([expected]);
        expect(immediateChanges).toEqual([expected]);
        expect(middleChanges).toEqual([
            { path: ['0', 'b', 'c'], pathTypes: ['object', 'object', 'object'], valueAtPath: 2, prevAtPath: 1 },
        ]);
    });
    test('a shallow listener above skipped levels ignores deep writes', () => {
        const state$ = observable({ a: { b: { c: 1 } }, d: 1 });
        let shallow = 0;
        let deep = 0;
        state$.onChange(() => shallow++, { trackingType: true });
        state$.onChange(() => deep++);

        state$.a.b.c.set(2);
        expect(shallow).toBe(0);
        expect(deep).toBe(1);

        state$.a.set({ b: { c: 3 } });
        expect(shallow).toBe(0);
        expect(deep).toBe(2);
    });
    test('a listener below a link target gets the linked path', () => {
        const source$ = observable({ x: { y: { z: 1 } } });
        const alias$ = observable({ target: () => source$.x });
        const changes: any[] = [];
        alias$.target.get();
        alias$.onChange(({ changes: c }) => changes.push(...c));

        source$.x.y.z.set(2);

        expect(alias$.target.y.z.peek()).toBe(2);
        expect(changes.map((c) => c.path)).toEqual([['target', 'y', 'z']]);
    });
});
