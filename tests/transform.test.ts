import { observable, when } from '@legendapp/state';
import {
    TransformStringsToDates,
    combineTransforms,
    synced,
    transformStringifyDates,
    transformStringifyKeys,
} from '@legendapp/state/sync';
import { expectTypeOf } from 'expect-type';
import { promiseTimeout } from './testglobals';

describe('transform', () => {
    test('TransformStringsToDates', async () => {
        interface Remote {
            text: string | null;
            date: string | null;
            date2: string;
            num: number;
        }
        type Local = TransformStringsToDates<Remote, 'date' | 'date2'>;

        expectTypeOf<Local['text']>().toEqualTypeOf<string | null>();
        expectTypeOf<Local['date']>().toEqualTypeOf<Date | null>();
        expectTypeOf<Local['date2']>().toEqualTypeOf<Date>();
        expectTypeOf<Local['num']>().toEqualTypeOf<number>();
    });
    test('transform dates args', async () => {
        let setVal = undefined;
        const date = new Date();
        interface Remote {
            text: string | null;
            date: string | null;
        }
        const obs$ = observable(
            synced({
                get: async () =>
                    ({
                        text: 'hi',
                        date: date.toISOString(),
                    }) as Remote,
                set: ({ value }) => {
                    setVal = value;
                },
                transform: transformStringifyDates<Remote, 'date'>('date'),
            }),
        );

        expectTypeOf<(typeof obs$)['text']['get']>().returns.toEqualTypeOf<string | null>();
        expectTypeOf<(typeof obs$)['date']['get']>().returns.toEqualTypeOf<Date | null>();

        await when(obs$);

        expect(obs$.get()).toEqual({ text: 'hi', date });

        const dateNew = new Date(+date + 1000);
        obs$.date.set(dateNew);

        await promiseTimeout(0);

        expect(setVal).toEqual({ text: 'hi', date: dateNew.toISOString() });
        expect(obs$.get()).toEqual({ text: 'hi', date: dateNew });
    });
    test('transform dates auto', async () => {
        let setVal = undefined;
        const date = new Date();
        interface Remote {
            text: string | null;
            date: string | null;
        }
        interface Local extends Omit<Remote, 'date'> {
            date: Date | null;
        }
        const obs$ = observable(
            synced({
                get: async () =>
                    ({
                        text: 'hi',
                        date: date.toISOString(),
                    }) as Remote,
                set: ({ value }) => {
                    setVal = value;
                },
                transform: transformStringifyDates<Remote, Local>(),
            }),
        );

        expectTypeOf<(typeof obs$)['text']['get']>().returns.toEqualTypeOf<string | null>();
        expectTypeOf<(typeof obs$)['date']['get']>().returns.toEqualTypeOf<Date | null>();

        await when(obs$);

        expect(obs$.get()).toEqual({ text: 'hi', date });

        const dateNew = new Date(+date + 1000);
        obs$.date.set(dateNew);

        await promiseTimeout(0);

        expect(setVal).toEqual({ text: 'hi', date: dateNew.toISOString() });
        expect(obs$.get()).toEqual({ text: 'hi', date: dateNew });
    });
    test('transform keys', async () => {
        let setVal = undefined;
        interface Remote {
            text: string | null;
            num: string | null;
            obj: string | null;
            arr: string | null;
        }
        interface Local {
            text: string | null;
            num: number | null;
            obj: { key: 'value' } | null;
            arr: number[] | null;
        }
        const obs$ = observable(
            synced({
                get: async () =>
                    ({
                        text: 'hi',
                        arr: JSON.stringify([1, 2, 3]),
                        num: JSON.stringify(10),
                        obj: JSON.stringify({ key: 'value' }),
                    }) as Remote,
                set: ({ value }) => {
                    setVal = value;
                },
                transform: transformStringifyKeys<Remote, Local>('arr', 'num', 'obj'),
            }),
        );

        await when(obs$);

        expect(obs$.get()).toEqual({ text: 'hi', arr: [1, 2, 3], num: 10, obj: { key: 'value' } });

        obs$.arr.push(4);

        await promiseTimeout(0);

        expect(setVal).toEqual({
            text: 'hi',
            arr: JSON.stringify([1, 2, 3, 4]),
            num: JSON.stringify(10),
            obj: JSON.stringify({ key: 'value' }),
        });
        expect(obs$.get()).toEqual({ text: 'hi', arr: [1, 2, 3, 4], num: 10, obj: { key: 'value' } });
    });
    test('transform everything', async () => {
        let setVal = undefined;
        const date = new Date();
        interface Remote {
            text: string | null;
            date: string | null;
            num: string | null;
            obj: string | null;
            arr: string | null;
        }
        interface Local {
            text: string | null;
            date: Date | null;
            num: number | null;
            obj: { key: 'value' } | null;
            arr: number[] | null;
        }
        const obs$ = observable(
            synced({
                get: async () =>
                    ({
                        text: 'hi',
                        date: date.toISOString(),
                        arr: JSON.stringify([1, 2, 3]),
                        num: JSON.stringify(10),
                        obj: JSON.stringify({ key: 'value' }),
                    }) as Remote,
                set: ({ value }) => {
                    setVal = value;
                },
                transform: combineTransforms(
                    transformStringifyDates<Remote, Local>(),
                    transformStringifyKeys<Remote, Local>('arr', 'num', 'obj'),
                ),
            }),
        );

        await when(obs$);

        expect(obs$.get()).toEqual({ text: 'hi', date, arr: [1, 2, 3], num: 10, obj: { key: 'value' } });

        const dateNew = new Date(+date + 1000);
        obs$.date.set(dateNew);
        obs$.arr.push(4);

        await promiseTimeout(0);

        expect(setVal).toEqual({
            text: 'hi',
            arr: JSON.stringify([1, 2, 3, 4]),
            num: JSON.stringify(10),
            obj: JSON.stringify({ key: 'value' }),
            date: dateNew.toISOString(),
        });
        expect(obs$.get()).toEqual({
            text: 'hi',
            arr: [1, 2, 3, 4],
            num: 10,
            obj: { key: 'value' },
            date: dateNew,
        });
    });
});
