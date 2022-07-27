import { act, renderHook } from '@testing-library/react-hooks';
import { observableBatcher } from '../src/observableBatcher';
import { observable } from '../src/observable';
import { observableComputed } from '../src/observableComputed';
import { shallow } from '../src/observableFns';
import { useObservables } from '../src/react/useObservables';

describe('React Hooks', () => {
    test('useObservables', () => {
        let numRenders = 0;
        const obs = observable({ val: { val2: { val3: 'hello' } } });
        const { result } = renderHook(() => {
            numRenders++;
            return useObservables(() => [obs.val]);
        });
        const [val] = result.current;

        expect(numRenders).toEqual(1);
        expect(val.val2.val3).toEqual('hello');

        act(() => {
            obs.val.val2.val3.set('hi');
        });

        expect(numRenders).toEqual(2);
        expect(val.val2.val3).toEqual('hi');
    });
    test('useObservables with object returns object', () => {
        const obs = observable({ val: { val2: { val3: 'hello' } } });
        const { result } = renderHook(() => {
            return useObservables(() => ({ val3: obs.val.val2.val3 }));
        });
        const { val3 } = result.current;

        expect(val3).toEqual('hello');
    });
    test('useObservables with single obs return single obs', () => {
        const obs = observable({ val: { val2: { val3: 'hello' } } });
        const { result } = renderHook(() => {
            return useObservables(() => obs.val.val2.val3);
        });
        const val3 = result.current;

        expect(val3).toEqual('hello');
    });
    test('useObservables shallow does not re-render from deep set', () => {
        let numRenders = 0;
        const obs = observable({ val: { val2: { val3: 'hello' } } as any });
        const { result } = renderHook(() => {
            numRenders++;
            return useObservables(() => [shallow(obs.val)]);
        });
        const [val] = result.current;

        expect(numRenders).toEqual(1);
        expect(val.val2.val3).toEqual('hello');

        // Does not re-render from a deep set
        act(() => {
            obs.val.val2.val3.set('hi');
        });

        expect(numRenders).toEqual(1);
        expect(val.val2.val3).toEqual('hi');

        // Does re-render from assigning to val
        act(() => {
            obs.val.assign({ val4: 'v' });
        });

        expect(numRenders).toEqual(2);
        expect(val.val2.val3).toEqual('hi');
        expect(val.val4).toEqual('v');
    });
    test('useObservables shallow does not re-render from set inside array', () => {
        let numRenders = 0;
        const obs = observable({ val: [{ text: 'hello' }] });
        const { result } = renderHook(() => {
            numRenders++;
            return useObservables(() => [shallow(obs.val)]);
        });
        const [val] = result.current;

        expect(numRenders).toEqual(1);
        expect(val[0].text).toEqual('hello');

        // Does not re-render from a deep set
        act(() => {
            obs.val[0].text.set('hi');
        });

        expect(numRenders).toEqual(1);
        expect(val[0].text).toEqual('hi');

        // Does re-render from assigning to val
        act(() => {
            obs.val.push({ text: 'hi2' });
        });

        expect(numRenders).toEqual(2);
        expect(val[0].text).toEqual('hi');
        expect(val[1].text).toEqual('hi2');
    });
    test('useObservables with computed', () => {
        let numRenders = 0;
        const obs = observable({ val: 'hello', val2: 'there' });
        const computed = observableComputed(() => ({ test: obs.val + ' ' + obs.val2 }));

        const { result } = renderHook(() => {
            numRenders++;
            return useObservables(() => [computed]);
        });
        const [{ test: full }] = result.current;
        expect(full).toEqual('hello there');
    });
    test('useObservables with shouldRender', () => {
        let numRenders = 0;
        const obs = observable({ text: '' });
        const { result } = renderHook(() => {
            numRenders++;
            return useObservables(
                () => [obs.text],
                () => obs.text === 'hi'
            );
        });
        expect(numRenders).toEqual(1);

        act(() => {
            obs.text.set('hello');
        });

        expect(numRenders).toEqual(1);

        act(() => {
            obs.text.set('there');
        });

        expect(numRenders).toEqual(1);

        act(() => {
            obs.text.set('hi');
        });

        expect(numRenders).toEqual(2);
    });
    test('Shallow tracks array setting on index', () => {
        let numRenders = 0;
        const obs = observable({ test: [1, 2, 3, 4] });

        const { result } = renderHook(() => {
            numRenders++;
            return useObservables(() => [shallow(obs.test)]);
        });

        act(() => {
            obs.test.set(1, 22);
        });

        expect(numRenders).toEqual(2);

        act(() => {
            obs.test.set(1, 222);
        });

        expect(numRenders).toEqual(3);
    });
    // test('Array swap renders correctly', () => {
    //     let numRenders = 0;
    //     const obs = observable({ test: [{ text: 1 }, { text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }] });

    //     const { result } = renderHook(() => {
    //         numRenders++;
    //         return useObservables(() => [shallow(obs.test)]);
    //     });

    //     act(() => {
    //         const arr = obs.test.get();
    //         const tmp = arr[1];
    //         obs.test.set(1, arr[4]);
    //         obs.test.set(4, tmp);
    //     });

    //     expect(obs.test).toEqual([{ text: 1 }, { text: 5 }, { text: 3 }, { text: 4 }, { text: 2 }]);
    //     expect(numRenders).toEqual(2);

    //     act(() => {
    //         const arr = obs.test.get();
    //         const tmp = arr[1];
    //         obs.test.set(1, arr[4]);
    //         obs.test.set(4, tmp);
    //     });

    //     expect(obs.test).toEqual([1, 2, 3, 4, 5]);
    //     expect(numRenders).toEqual(3);
    // });
});
