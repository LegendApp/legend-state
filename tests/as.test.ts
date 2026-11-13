import { observable } from '@legendapp/state';
import { arrayAsRecord } from '../src/as/arrayAsRecord';
import { recordAsArray } from '../src/as/recordAsArray';

interface Item {
    id: string;
    slug: string;
    name: string;
}

const items: Item[] = [
    { id: 'a', slug: 'first', name: 'A' },
    { id: 'b', slug: 'second', name: 'B' },
];

describe('arrayAsRecord', () => {
    test('maps array values to a record by the default id field', () => {
        const source$ = observable(items);
        const record$ = observable(arrayAsRecord(source$));

        expect(record$.get()).toEqual({ a: items[0], b: items[1] });

        record$.set({ b: items[1] });

        expect(source$.get()).toEqual([items[1]]);
    });

    test('supports a custom key field', () => {
        const source$ = observable(items);
        const record$ = observable(arrayAsRecord(source$, 'slug'));

        expect(record$.get()).toEqual({ first: items[0], second: items[1] });
    });
});

describe('recordAsArray', () => {
    test('returns an empty array while the record has not loaded', () => {
        const source$ = observable<Record<string, Item>>();
        const array$ = observable(recordAsArray(source$));
        expect(array$.get()).toEqual([]);
        source$.set({ a: items[0] });
        expect(array$.get()).toEqual([items[0]]);
        source$.delete();
        expect(array$.get()).toEqual([]);
    });
    test('maps all record values to an array and writes them back by id', () => {
        const source$ = observable<Record<string, Item>>({ a: items[0], b: items[1] });
        const array$ = observable(recordAsArray(source$));

        expect(array$.get()).toEqual(items);

        array$.set([items[1]]);

        expect(source$.get()).toEqual({ b: items[1] });
    });

    test('supports a custom key field when writing the record', () => {
        const source$ = observable<Record<string, Item>>({});
        const array$ = observable(recordAsArray(source$, 'slug'));

        array$.set(items);

        expect(source$.get()).toEqual({ first: items[0], second: items[1] });
    });
});

test('record converters preserve prototype-named keys as own values', () => {
    const row = { id: '__proto__', slug: 'constructor', name: 'kept' };
    const source$ = observable([row]);
    const record$ = observable(arrayAsRecord(source$));
    expect(Object.getOwnPropertyDescriptor(record$.get(), '__proto__')?.value).toEqual(row);
    expect(Object.getPrototypeOf(record$.get())).toBe(Object.prototype);
    const target$ = observable<Record<string, typeof row>>({});
    const array$ = observable(recordAsArray(target$));
    array$.set([row]);
    expect(Object.getOwnPropertyDescriptor(target$.get(), '__proto__')?.value).toEqual(row);
    expect(Object.getPrototypeOf(target$.get())).toBe(Object.prototype);
});
