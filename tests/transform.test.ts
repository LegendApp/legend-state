import { observable, when } from '@legendapp/state';
import { synced, transformStringify } from '@legendapp/state/sync';
import { promiseTimeout } from './testglobals';

jest?.setTimeout?.(1000);

describe('transform', () => {
    test('transform dates', async () => {
        let setVal = undefined;
        const date = new Date();
        const obs$ = observable<{ text: string; date: Date }>(
            // @ts-expect-error asdf
            synced({
                get: async () => ({
                    text: 'hi',
                    date: date.toISOString(),
                }),
                set: ({ value }) => {
                    setVal = value;
                },
                // @ts-expect-error asdf
                transform: transformStringify({ stringifyIf: { date: true } }),
            }),
        );

        await when(obs$);

        expect(obs$.get()).toEqual({ text: 'hi', date });

        const dateNew = new Date(+date + 1000);
        obs$.date.set(dateNew);

        await promiseTimeout(0);

        expect(setVal).toEqual({ text: 'hi', date: dateNew.toISOString() });
        expect(obs$.get()).toEqual({ text: 'hi', date: dateNew });
    });
});
