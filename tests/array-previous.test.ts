import { observable } from '../src/observable';
import { batch } from '../src/batching';
import { undoRedo } from '../src/helpers/undoRedo';
import { syncObservable } from '../src/sync/syncObservable';
import { when } from '../src/when';
import { ObservablePersistLocalStorage, getPersistName, localStorage, promiseTimeout } from './testglobals';

describe('array previous lengths', () => {
    it('undoes the first push without a null tail', () => {
        const state = observable({ items: [] as number[] });
        const history = undoRedo(state);
        state.items.push(1);
        history.undo();
        expect(state.peek()).toStrictEqual({ items: [] });
        history.redo();
        expect(state.peek()).toStrictEqual({ items: [1] });
    });
    for (const batched of [false, true]) {
        it(`undo/redo pushes, batched=${batched}`, () => {
            const state = observable({ items: [] as number[] });
            const history = undoRedo(state);
            const write = () => {
                state.items.push(1);
                state.items.push(2);
            };
            if (batched) batch(write);
            else write();
            history.undo();
            expect(state.peek()).toStrictEqual({ items: batched ? [] : [1] });
            history.redo();
            expect(state.peek()).toStrictEqual({ items: [1, 2] });
        });
    }
    it('retains a legitimate undefined tail', () => {
        const state = observable([undefined] as (number | undefined)[]);
        let previous: unknown;
        state.onChange((e) => {
            previous = e.getPrevious();
        });
        state[0].set(1);
        expect(previous).toStrictEqual([undefined]);
    });
    it('handles indexed growth', () => {
        const state = observable([1]);
        let previous: unknown;
        state.onChange((e) => {
            previous = e.getPrevious();
        });
        state[4].set(2);
        expect(previous).toStrictEqual([1]);
    });
    it('handles append then parent replacement in a batch', () => {
        const state = observable({ items: [1] });
        let previous: unknown;
        state.onChange((e) => {
            previous = e.getPrevious();
        });
        batch(() => {
            state.items.push(2);
            state.items.set([3]);
        });
        expect(previous).toStrictEqual({ items: [1] });
    });
    it('handles append then root replacement in a batch', () => {
        const state = observable([1]);
        let previous: unknown;
        state.onChange((e) => {
            previous = e.getPrevious();
        });
        batch(() => {
            state.push(2);
            state.set([3]);
        });
        expect(previous).toStrictEqual([1]);
    });
    it('handles child then parent replacement in a batch', () => {
        const state = observable({ b: { c: 0 } });
        let previous: unknown;
        state.onChange((e) => {
            previous = e.getPrevious();
        });
        batch(() => {
            state.b.c.set(1);
            state.b.set({ c: 5 });
        });
        expect(previous).toStrictEqual({ b: { c: 0 } });
    });
});

test('batched growth remains a change when the final value is undefined', () => {
    const state = observable<(number | undefined)[]>([]);
    let previous: unknown = 'not notified';
    state.onChange(({ getPrevious }) => {
        previous = getPrevious();
    });
    batch(() => {
        state.push(1);
        state[0].set(undefined);
    });
    expect(previous).toStrictEqual([]);
    expect(state.peek()).toStrictEqual([undefined]);
});

test('array lengths stay local when a linked scalar is stored in another array', () => {
    const source = observable<(number | undefined)[]>([]);
    const linked = observable([source[0]]);
    linked[0].get();
    let previous: unknown;
    linked.onChange(({ getPrevious }) => {
        previous = getPrevious();
    });
    source.push(1);
    expect(previous).toStrictEqual([undefined]);
    expect(linked.get()).toStrictEqual([1]);
});

test('linked whole arrays retain their shared prior length', () => {
    const source = observable<number[]>([]);
    const linked = observable({ items: source });
    linked.items.get();
    let previous: unknown;
    linked.onChange(({ getPrevious }) => {
        previous = getPrevious();
    });
    source.push(1);
    expect(previous).toStrictEqual({ items: [] });
    expect(linked.get()).toStrictEqual({ items: [1] });
});

test('immediate and batched listeners both restore the prior array length', () => {
    const state = observable([1]);
    const previous: unknown[] = [];
    state.onChange(({ getPrevious }) => previous.push(getPrevious()), { immediate: true });
    state.onChange(({ getPrevious }) => previous.push(getPrevious()));
    state.push(2);
    expect(previous).toStrictEqual([[1], [1]]);
});

test('batched push then root replacement persists only the current root', async () => {
    const state = observable([1]);
    const name = getPersistName();
    const status = syncObservable(state, { persist: { name, plugin: ObservablePersistLocalStorage } });
    await when(status.isPersistLoaded);
    let paths: string[][] | undefined;
    let previous: unknown;
    state.onChange((event) => {
        paths = event.changes.map((change) => change.path);
        previous = event.getPrevious();
    });
    batch(() => {
        state.push(2);
        state.set([3]);
    });
    await promiseTimeout();
    expect(paths).toStrictEqual([[]]);
    expect(previous).toStrictEqual([1]);
    expect(JSON.parse(localStorage.getItem(name)!)).toStrictEqual([3]);
});

test('getPrevious does not mutate a replaced object while reversing earlier child writes', () => {
    const initial = { c: 0 };
    const state = observable({ b: initial });
    let getPrevious: (() => unknown) | undefined;
    state.onChange((event) => {
        getPrevious = event.getPrevious;
    });
    batch(() => {
        state.b.c.set(1);
        state.b.set({ c: 5 });
    });
    expect(initial.c).toBe(1);
    expect(getPrevious!()).toStrictEqual({ b: { c: 0 } });
    expect(initial.c).toBe(1);
});

test('push followed by reordering with child listeners restores the original array', () => {
    const state = observable([{ id: 1 }, { id: 2 }, { id: 3 }]);
    state[0].onChange(() => {});
    state[1].onChange(() => {});
    state[2].onChange(() => {});
    let previous: unknown;
    state.onChange(({ getPrevious }) => {
        previous = getPrevious();
    });
    batch(() => {
        state.push({ id: 4 });
        state.set([{ id: 3 }, { id: 2 }, { id: 1 }, { id: 4 }]);
    });
    expect(previous).toStrictEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
});

for (const nested of [false, true]) {
    test(`pushed ID rows keep their previous index through a length-changing move, nested=${nested}`, () => {
        const state = observable({ items: [{ id: 1 }, { id: 2 }] });
        const target = nested ? state : state.items;
        let previous: unknown;
        target.onChange(({ getPrevious }) => {
            previous = getPrevious();
        });
        batch(() => {
            state.items.push({ id: 3 });
            state.items.set([{ id: 3 }, { id: 1 }]);
        });
        expect(previous).toStrictEqual(nested ? { items: [{ id: 1 }, { id: 2 }] } : [{ id: 1 }, { id: 2 }]);
    });
}

test('a child write before an ID move restores the original row', () => {
    const state = observable([
        { id: 1, v: 0 },
        { id: 2, v: 0 },
    ]);
    let previous: unknown;
    state.onChange(({ getPrevious }) => {
        previous = getPrevious();
    });
    batch(() => {
        state[0].v.set(1);
        state.set([
            { id: 2, v: 0 },
            { id: 3, v: 0 },
            { id: 1, v: 1 },
        ]);
    });
    expect(previous).toStrictEqual([
        { id: 1, v: 0 },
        { id: 2, v: 0 },
    ]);
});

test('moved ID paths rebase to the linked array name', () => {
    const source = observable({ items: [{ id: 1 }, { id: 2 }] });
    const linked = observable({ nested: { different: source.items } });
    linked.nested.different.get();
    let previous: unknown;
    linked.onChange(({ getPrevious }) => {
        previous = getPrevious();
    });
    batch(() => {
        source.items.push({ id: 3 });
        source.items.set([{ id: 3 }, { id: 1 }]);
    });
    expect(previous).toStrictEqual({ nested: { different: [{ id: 1 }, { id: 2 }] } });
});

test('linked array writes retain the containing row path when that row moves', () => {
    const source = observable([{ id: 1 }, { id: 2 }]);
    const linked = observable([
        { id: 'a', items: source },
        { id: 'b', items: [] as { id: number }[] },
    ]);
    linked[0].items.get();
    let previous: unknown;
    linked.onChange(({ getPrevious }) => {
        previous = getPrevious();
    });
    batch(() => {
        source.push({ id: 3 });
        linked.set([
            { id: 'b', items: [] },
            { id: 'c', items: [] },
            { id: 'a', items: source },
        ]);
    });
    expect(previous).toStrictEqual([
        { id: 'a', items: [{ id: 1 }, { id: 2 }] },
        { id: 'b', items: [] },
    ]);
});

test('linked backing values update before an earlier shared callback reads the parent', () => {
    const source = observable([1]);
    const seen: number[] = [];
    const listener = () => seen.push(linked.peek().items[0]);
    source.onChange(listener);
    function createLinked() {
        return observable({ items: source });
    }
    const linked = createLinked();
    linked.items.get();
    linked.onChange(listener);
    source.set([2]);
    expect(seen.at(-1)).toBe(2);
});

test('linked push and replacement records one undo snapshot', () => {
    const source = observable([{ id: 1 }, { id: 2 }]);
    const linked = observable<{ items: { id: number }[] }>({ items: source });
    linked.items.get();
    const history = undoRedo(linked);
    batch(() => {
        source.push({ id: 3 });
        source.set([{ id: 3 }, { id: 1 }]);
    });
    expect(history.undos$.get()).toBe(1);
    expect(history.getHistory()[0]).toStrictEqual({ items: [{ id: 1 }, { id: 2 }] });
    history.undo();
    expect(linked.get()).toStrictEqual({ items: [{ id: 1 }, { id: 2 }] });
});

test('a detached linked row is not recreated when its old source changes', () => {
    const source = observable([1]);
    source.onChange(() => {});
    const list = observable([{ id: 'row', items: source }]);
    list[0].items.get();
    list.set([]);
    source.set([9]);
    expect(list.peek()).toStrictEqual([]);
});

test('an old source cannot overwrite backing data after a link switches targets', () => {
    const first = observable([1]);
    const second = observable([2]);
    first.onChange(() => {});
    const linked = observable({ items: first });
    linked.items.get();
    linked.set({ items: second });
    linked.items.get();
    first.set([9]);
    expect(linked.peek()).toStrictEqual({ items: [2] });
    expect(linked.items.get()).toStrictEqual([2]);
});
