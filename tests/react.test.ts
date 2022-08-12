import { act, renderHook } from '@testing-library/react-hooks';
import { observable } from '../src/observable';
import { shallow } from '../src/helpers';
import { useObservables } from '../src/react/useObservables';
import { useNewObservable } from '../src/react/useNewObservable';
import { observableComputed } from '../src/observableComputed';

describe('React Hooks', () => {
    test('useObservables', () => {
        let numRenders = 0;
        const obs = observable({ val: { arr: ['hi'], val2: { val3: 'hello' } } });
        const { result } = renderHook(() => {
            numRenders++;
            return useObservables(() => [obs.val]);
        });
        const [val] = result.current;
        expect(numRenders).toEqual(1);
        expect(val.val2.val3).toEqual('hello');
        expect(val.arr.map((a) => a)).toEqual(['hi']);
        expect(val.arr.length).toEqual(1);
        act(() => {
            obs.val.val2.set('val3', 'hi');
        });
        expect(numRenders).toEqual(2);
        expect(val.val2.val3).toEqual('hi');
    });
    test('useObservables with prop', () => {
        let numRenders = 0;
        const obs = observable({ val: { val2: { val3: 'hello' } }, selected: 0 });
        const { result } = renderHook(() => {
            numRenders++;
            return useObservables(() => [obs.val, obs.prop('selected')]);
        });
        const [val] = result.current;
        expect(numRenders).toEqual(1);
        // TODO
        // @ts-ignore
        expect(val.val2.val3).toEqual('hello');
        act(() => {
            obs.val.val2.val3.set('hi');
        });
        expect(numRenders).toEqual(2);
        // @ts-ignore
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
    test('useObservables with single object re-renders when changed', () => {
        let numRenders = 0;
        const obs = observable({ val: { val2: { val3: 'hello' } } });
        const { result } = renderHook(() => {
            numRenders++;
            return useObservables(() => obs.val.val2);
        });
        act(() => {
            obs.val.val2.val3.set('hi');
        });
        expect(numRenders).toEqual(2);
    });
    test('useObservables shallow does not re-render from deep set', () => {
        let numRenders = 0;
        const obs = observable({ val: { val2: { val3: 'hello' } } });
        const { result } = renderHook(() => {
            numRenders++;
            return useObservables(() => [shallow(obs.val)]);
        });
        const [val] = result.current;
        expect(numRenders).toEqual(1);
        // @ts-ignore
        expect(val.val2.val3).toEqual('hello');
        // Does not re-render from a deep set
        act(() => {
            obs.val.val2.set('val3', 'hi');
        });
        expect(numRenders).toEqual(1);
        // TODO
        // @ts-ignore
        expect(val.val2.val3).toEqual('hi');
        // Does re-render from assigning to val
        act(() => {
            obs.val.assign({ val4: 'v' } as any);
        });
        expect(numRenders).toEqual(2);
        // @ts-ignore
        expect(val.val2.val3).toEqual('hi');
        // @ts-ignore
        expect(val.val4).toEqual('v');
    });
    test('useObservables shallow does not re-render from set inside array', () => {
        let numRenders = 0;
        const obs = observable({ arr: [{ text: 'hello' }] });
        const { result } = renderHook(() => {
            numRenders++;
            return useObservables(() => [shallow(obs.arr)]);
        });
        const [arr] = result.current;
        expect(numRenders).toEqual(1);
        expect(arr[0].text).toEqual('hello');
        // Does not re-render from a deep set
        act(() => {
            obs.arr[0].text.set('hi');
        });
        expect(numRenders).toEqual(1);
        expect(arr[0].text).toEqual('hi');
        // Does re-render from assigning to val
        act(() => {
            obs.arr.push({ text: 'hi2' });
        });
        expect(numRenders).toEqual(2);
        expect(arr[0].text).toEqual('hi');
        expect(arr[1].text).toEqual('hi2');
    });
    test('useObservables shallow re-renders from push array', () => {
        let numRenders = 0;
        const obs = observable({ arr: [{ text: 'hello' }] });
        const { result } = renderHook(() => {
            numRenders++;
            return useObservables(() => [shallow(obs.arr)]);
        });
        const [arr] = result.current;
        expect(numRenders).toEqual(1);
        // Does not re-render from a deep set
        act(() => {
            obs.arr.push({ text: 'hi' });
        });
        expect(numRenders).toEqual(2);
        expect(arr[0].text).toEqual('hello');
        expect(arr[1].text).toEqual('hi');
    });
    test('useObservables with computed', () => {
        let numRenders = 0;
        const obs = observable({ val: 'hello', val2: 'there' });
        const computed = observableComputed(() => ({ test: obs.val + ' ' + obs.val2 }));
        const { result } = renderHook(() => {
            numRenders++;
            return useObservables(() => [computed]);
        });
        // @ts-ignore
        const [{ test: full }] = result.current;
        expect(full).toEqual('hello there');
    });
    test('Shallow tracks array setting on index', () => {
        let numRenders = 0;
        const obs = observable({ test: [1, 2, 3, 4] });
        const { result } = renderHook(() => {
            numRenders++;
            return useObservables(() => shallow(obs.test));
        });
        expect(result.current).toEqual(obs.get().test);
        act(() => {
            obs.test.set(1, 22);
        });
        expect(numRenders).toEqual(1);
        act(() => {
            obs.test.set(1, 222);
        });
        expect(numRenders).toEqual(1);
    });
    test('Shallow array swap renders correctly', () => {
        let numRendersShallow = 0;
        let numRendersItem = 0;
        const obs = observable({ arr: [{ text: 1 }, { text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }] });
        renderHook(() => {
            numRendersShallow++;
            return useObservables(() => [shallow(obs.arr)]);
        });
        const { result } = renderHook(() => {
            numRendersItem++;
            return useObservables(() => [obs.arr[1]]);
        });
        act(() => {
            const arr = obs.arr.get();
            const tmp = arr[1];
            obs.arr.set(1, arr[4]);
            obs.arr.set(4, tmp);
        });
        expect(obs.arr.get()).toEqual([{ text: 1 }, { text: 5 }, { text: 3 }, { text: 4 }, { text: 2 }]);
        expect(numRendersShallow).toEqual(1);
        expect(numRendersItem).toEqual(2);
        expect(result.current).toEqual([{ text: 5 }]);
        act(() => {
            const arr = obs.arr.get();
            const tmp = arr[1];
            obs.arr.set(1, arr[4]);
            obs.arr.set(4, tmp);
        });
        expect(obs.arr.get()).toEqual([{ text: 1 }, { text: 2 }, { text: 3 }, { text: 4 }, { text: 5 }]);
        expect(numRendersShallow).toEqual(1);
        expect(numRendersItem).toEqual(3);
        expect(result.current).toEqual([{ text: 2 }]);
    });
    test('useObservables with computations', () => {
        let numRenders = 0;
        const obs = observable({ val: { arr: ['hi'], val2: { val3: 'hello' } }, otherval: 'sup' });
        const { result } = renderHook(() => {
            numRenders++;
            // @ts-ignore
            return useObservables(() => [obs.otherval, obs.val.arr[0] + obs.val.val2.val3]);
        });
        let [other, text] = result.current;
        expect(numRenders).toEqual(1);
        expect(text).toEqual('hihello');
        // expect(val.arr.map((a) => a)).toEqual(['hi']);
        // expect(val.arr.length).toEqual(1);
        act(() => {
            obs.val.val2.set('val3', 'hi');
        });
        expect(numRenders).toEqual(2);
        [other, text] = result.current;
        expect(text).toEqual('hihi');
        // expect(val.val2.val3).toEqual('hi');
    });
    test('useNewObservable primitive', () => {
        let numRenders = 0;
        const { result } = renderHook(() => {
            numRenders++;
            return useNewObservable(10);
        });
        const [obs, val] = result.current;
        expect(numRenders).toEqual(1);
        expect(val).toEqual(10);
        act(() => {
            obs.set(20);
        });
        expect(numRenders).toEqual(2);
        expect(result.current[1]).toEqual(20);
    });
    test('useNewObservable object', () => {
        let numRenders = 0;
        const { result } = renderHook(() => {
            numRenders++;
            return useNewObservable({ text: 'hi' });
        });
        const [obs, val] = result.current;
        expect(numRenders).toEqual(1);
        expect(result.current[1]).toEqual({ text: 'hi' });

        act(() => {
            obs.set({ text: 'hello' });
        });
        expect(numRenders).toEqual(2);
        expect(result.current[1]).toEqual({ text: 'hello' });
    });
    test('useNewObservable not listening', () => {
        let numRenders = 0;
        const { result } = renderHook(() => {
            numRenders++;
            return useNewObservable(10, false);
        });
        const [obs] = result.current;
        expect(numRenders).toEqual(1);
        expect(obs).toEqual({ current: 10 });
        act(() => {
            obs.set(20);
        });
        expect(numRenders).toEqual(1);
    });
    test('useObservables with multiple primitives', () => {
        let numRenders = 0;
        const obs = observable({ val1: 1, val2: 2, val3: 3, val4: 4 });
        const { result } = renderHook(() => {
            numRenders++;
            return useObservables(() => [obs.val1, obs.val2, obs.val3]);
        });
        const val = result.current;
        expect(numRenders).toEqual(1);
        expect(val).toEqual([1, 2, 3]);

        act(() => {
            obs.val1.set(11);
        });
        expect(numRenders).toEqual(2);

        act(() => {
            obs.val2.set(22);
        });
        expect(numRenders).toEqual(3);

        act(() => {
            obs.val3.set(33);
        });
        expect(numRenders).toEqual(4);

        // Changing a value not tracked doesn't update it, making sure that it tracks the
        // prop and not the parent
        act(() => {
            obs.val4.set(44);
        });
        expect(numRenders).toEqual(4);
    });
    test('useObservables slice does not re-render', () => {
        let numRenders = 0;
        const obs = observable({ arr: ['hi'] });
        const { result } = renderHook(() => {
            numRenders++;
            return useObservables(() => [obs.arr]);
        });
        act(() => {
            obs.arr.slice(0);
        });
        expect(numRenders).toEqual(1);
    });
});
