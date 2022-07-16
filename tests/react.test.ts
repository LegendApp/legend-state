import { renderHook, act } from '@testing-library/react-hooks';
import { configureObservable, observable, shallow } from '../src';
import { useObservables } from '../src/react';

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
});
