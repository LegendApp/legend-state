import { observable } from '../src/observable';
import type { Observable } from '../src/observableTypes';

type Item = { id: string; value: number };

const make = () => {
    const memo = new WeakMap<object, any>();
    const itemMapper = (o: Observable<Item>) => {
        let mapped = memo.get(o);
        if (!mapped) {
            mapped = { value: () => o.id.get() + '_' + o.value.get() };
            memo.set(o, mapped);
        }
        return mapped;
    };
    const values = [50000, 10000, 70000, 30000, 90000];
    const state$: any = observable({
        items: Object.fromEntries(
            values.map((value, i) => [`ID_${i + 1}`, { id: `ID_${i + 1}`, value }] as [string, Item]),
        ) as Record<string, Item>,
        itemList: (): Observable<Item>[] => Object.values(state$.items) as any,
        itemDerivedList: () => state$.itemList.map(itemMapper),
        sortedList: () => [...state$.itemList].sort((a: any, b: any) => a.value.get() - b.value.get()),
    });
    return state$;
};

describe('issue 424', () => {
    test('sorted list from Object.values does not stack overflow after deletes', () => {
        // repro #424
        const state$ = make();
        expect(state$.sortedList.get().map((x: any) => x?.id)).toEqual(['ID_2', 'ID_4', 'ID_1', 'ID_3', 'ID_5']);
        state$.items.ID_1.delete();
        state$.items.ID_3.delete();
        expect(state$.sortedList.get().map((x: any) => x?.id)).toEqual(['ID_2', 'ID_4', 'ID_5']);
        state$.items.ID_5.value.set(1);
        expect(state$.sortedList.get().map((x: any) => x?.id)).toEqual(['ID_5', 'ID_2', 'ID_4']);
    });

    test('memoized derived list drops deleted items', () => {
        // repro #424
        const state$ = make();
        const derived = () =>
            state$.itemDerivedList.get().map((_: any, i: number) => state$.itemDerivedList[i].value.get());
        expect(derived()).toEqual(['ID_1_50000', 'ID_2_10000', 'ID_3_70000', 'ID_4_30000', 'ID_5_90000']);
        state$.items.ID_1.delete();
        expect(derived()).toEqual(['ID_2_10000', 'ID_3_70000', 'ID_4_30000', 'ID_5_90000']);
    });
});
