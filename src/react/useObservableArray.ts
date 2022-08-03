import { useCallback, useRef } from 'react';
import { shallow } from '../helpers';
import { Observable } from '../observableInterfaces';
import { useObservables } from './useObservables';

export function useObservableArray<T>(array: Observable<T[]>, key: keyof T): [T[], Map<string, (id: string) => T>] {
    const map = useRef(new Map());
    const useItem = useCallback((id: string) => {
        const item = map.current.get(id);
        const raw = useObservables(() => item);
        return [raw, item];
    }, []);
    const [arr] = useObservables(() => [shallow(array)]) as unknown as [T[]];

    map.current.clear();
    for (let i = 0; i < arr.length; i++) {
        map.current.set(arr[i][key], array[i]);
    }

    return [arr as any, useItem as any];
}

// interface A {
//     id: number;
//     text: string;
// }

// const obs = observable({
//     arr: [
//         { id: 1, text: 'hi' },
//         { id: 2, text: 'hello' },
//     ] as A[],
// });

// const [arr, map] = useShallowArray(obs.arr, 'id');

// arr.map(item => <Row key={item.id} id={item.id} map={map} />)
