import { observable } from '@legendapp/state';
import { syncedCrud } from '@legendapp/state/sync-plugins/crud';
import { promiseTimeout } from './testglobals';

type Row = { id: string; text: string };

function getIdWarnings(warn: jest.SpyInstance) {
    return warn.mock.calls.filter((args) => /syncedCrud create/.test(args[0]));
}

describe('syncedCrud create id contract warning', () => {
    let warn: jest.SpyInstance;
    beforeEach(() => {
        warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        warn.mockRestore();
    });

    test('warns once when create returns a different id', async () => {
        const obs$ = observable(
            syncedCrud({
                list: () => [] as Row[],
                create: async (input: Row) => ({ ...input, id: 'server-id' }),
            }),
        );
        obs$.get();
        obs$.local1.set({ id: 'local1', text: 'hi' });
        await promiseTimeout(10);

        const warnings = getIdWarnings(warn);
        expect(warnings.length).toBe(1);
        expect(warnings[0][0]).toContain('"local1"');
        expect(warnings[0][0]).toContain('"server-id"');
        expect(warnings[0][0]).toContain('at "(root)"');
        expect(warnings[0][0]).toContain('server must persist and return that same id');
        // No rekeying
        expect(Object.keys(obs$.get())).toEqual(['local1']);
    });

    test('warns with a custom fieldId and as: value', async () => {
        const obs$ = observable(
            syncedCrud({
                get: () => null as { key: string; text: string } | null,
                fieldId: 'key',
                create: async (input: { key: string; text: string }) => ({ ...input, key: 'server-key' }),
            }),
        );
        obs$.get();
        obs$.set({ key: 'local-key', text: 'hi' });
        await promiseTimeout(10);

        const warnings = getIdWarnings(warn);
        expect(warnings.length).toBe(1);
        expect(warnings[0][0]).toContain('returned key "server-key"');
        expect(warnings[0][0]).toContain('with key "local-key"');
    });

    test('warns with as: Map and as: array, naming the containing path', async () => {
        for (const as of ['Map', 'array'] as const) {
            warn.mockClear();
            const store$ = observable({
                todos: syncedCrud({
                    list: () => [] as Row[],
                    as,
                    generateId: () => 'g0',
                    create: async (input: Row) => ({ ...input, id: 'srv' }),
                }),
            });
            store$.todos.get();
            if (as === 'Map') {
                (store$.todos as any).set('g0', { id: 'g0', text: 'hi' });
            } else {
                (store$.todos as any).push({ text: 'hi' });
            }
            await promiseTimeout(10);

            const warnings = getIdWarnings(warn);
            expect(warnings.length).toBe(1);
            expect(warnings[0][0]).toContain('create at "todos" returned id "srv"');
            expect(warnings[0][0]).toContain('created locally with id "g0"');
        }
    });

    test('does not warn when create returns the same id', async () => {
        const obs$ = observable(
            syncedCrud({
                list: () => [] as Row[],
                create: async (input: Row) => ({ ...input, text: 'saved' }),
            }),
        );
        obs$.get();
        obs$.local1.set({ id: 'local1', text: 'hi' });
        await promiseTimeout(10);

        expect(getIdWarnings(warn).length).toBe(0);
        expect(obs$.local1.text.get()).toBe('saved');
    });

    test('does not warn when create returns nothing or omits the id', async () => {
        const obs$ = observable(
            syncedCrud({
                list: () => [] as Row[],
                create: async (input: Row) => (input.id === 'a' ? undefined : ({ text: 'partial' } as Row)),
            }),
        );
        obs$.get();
        obs$.a.set({ id: 'a', text: 'hi' });
        obs$.b.set({ id: 'b', text: 'hi' });
        await promiseTimeout(10);

        expect(getIdWarnings(warn).length).toBe(0);
    });

    test('does not warn when update returns a different id', async () => {
        const obs$ = observable(
            syncedCrud({
                list: () => [{ id: 'id1', text: 'hi' }] as Row[],
                create: async (input: Row) => input,
                update: async (input: Partial<Row>) => ({ ...input, id: 'other' }),
            }),
        );
        obs$.get();
        await promiseTimeout(1);
        obs$.id1.text.set('changed');
        await promiseTimeout(10);

        expect(getIdWarnings(warn).length).toBe(0);
    });
});
