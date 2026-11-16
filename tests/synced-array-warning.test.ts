import { observable, syncState } from '@legendapp/state';
import { synced } from '@legendapp/state/sync';
import { syncedCrud } from '@legendapp/state/sync-plugins/crud';
import { promiseTimeout } from './testglobals';

type Item = { id: string; text: string };
type Doc = { items: Item[] };

function getArrayWarnings(warn: jest.SpyInstance) {
    return warn.mock.calls.filter((args) => /not supported for per-item sync/.test(args[0]));
}

function setupSynced<T>(initialRemote: T) {
    let update: ((params: { value: T }) => void) | undefined;
    const obs$ = observable(
        synced<T>({
            get: () => initialRemote,
            // Never resolves so local edits stay pending
            set: () => new Promise<void>(() => {}),
            subscribe: (params) => {
                update = params.update as any;
            },
        }),
    );
    obs$.get();
    return { obs$, update: (value: T) => update!({ value }) };
}

describe('Synced array warnings', () => {
    let warn: jest.SpyInstance;
    beforeEach(() => {
        warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        warn.mockRestore();
    });

    test('warns once when a remote array replaces an array with pending edits inside it', async () => {
        const { obs$, update } = setupSynced<Doc>({ items: [{ id: 'a', text: 'a' }] });
        await promiseTimeout(1);

        obs$.items[0].text.set('local');
        await promiseTimeout(1);

        update({ items: [{ id: 'b', text: 'b' }] });
        update({ items: [{ id: 'c', text: 'c' }] });
        await promiseTimeout(1);

        const warnings = getArrayWarnings(warn);
        expect(warnings.length).toBe(1);
        expect(warnings[0][0]).toContain('path "items"');
        expect(warnings[0][0]).toContain('"items.0.text"');
        expect(warnings[0][0]).toContain('object or Map keyed by id');
    });

    test('warns once per synced observable across different array paths', async () => {
        const { obs$, update } = setupSynced<{ a: string[]; b: string[] }>({ a: ['x'], b: ['y'] });
        await promiseTimeout(1);

        obs$.a[0].set('local-a');
        obs$.b[0].set('local-b');
        await promiseTimeout(1);
        update({ a: ['x2'], b: ['y2'] });
        await promiseTimeout(1);

        expect(getArrayWarnings(warn).length).toBe(1);
    });

    test('warns for push on an array with a pending save (current behavior, pending decision)', async () => {
        const { obs$, update } = setupSynced<{ tags: string[] }>({ tags: ['a'] });
        await promiseTimeout(1);

        obs$.tags.push('b');
        await promiseTimeout(1);
        update({ tags: ['a'] });
        await promiseTimeout(1);

        expect(getArrayWarnings(warn).length).toBe(1);
    });

    test('does not warn for a pending whole-value array set', async () => {
        const { obs$, update } = setupSynced<{ tags: string[] }>({ tags: ['a'] });
        await promiseTimeout(1);

        obs$.tags.set(['a', 'b']);
        await promiseTimeout(1);
        update({ tags: ['a'] });
        await promiseTimeout(1);

        expect(getArrayWarnings(warn).length).toBe(0);
    });

    test('does not warn for a remote array without pending edits inside it', async () => {
        const { obs$, update } = setupSynced<Doc & { title: string }>({ title: 't', items: [{ id: 'a', text: 'a' }] });
        await promiseTimeout(1);

        update({ title: 't', items: [{ id: 'b', text: 'b' }] });
        // Pending edit outside the array
        obs$.title.set('local');
        await promiseTimeout(1);
        update({ title: 't', items: [{ id: 'c', text: 'c' }] });
        await promiseTimeout(1);

        expect(getArrayWarnings(warn).length).toBe(0);
        expect(obs$.items.get()).toEqual([{ id: 'c', text: 'c' }]);
    });

    test('does not warn for pending edits inside an object keyed by id', async () => {
        const { obs$, update } = setupSynced<{ items: Record<string, Item> }>({
            items: { a: { id: 'a', text: 'a' } },
        });
        await promiseTimeout(1);

        obs$.items.a.text.set('local');
        await promiseTimeout(1);
        update({ items: { a: { id: 'a', text: 'a' }, b: { id: 'b', text: 'b' } } });
        await promiseTimeout(1);

        expect(getArrayWarnings(warn).length).toBe(0);
    });

    test('warns once when syncedCrud get returns an array of rows', async () => {
        let n = 0;
        const obs$ = observable(
            syncedCrud({
                get: () => [{ id: 'a', text: String(n++) }] as unknown as Item,
                update: async (input: Partial<Item>) => input,
            }),
        );
        obs$.get();
        await promiseTimeout(1);

        const warnings = getArrayWarnings(warn);
        expect(warnings.length).toBe(1);
        expect(warnings[0][0]).toContain('syncedCrud get returned an array');
    });

    test('warns once when syncedCrud create or update returns an array of rows', async () => {
        const obs$ = observable(
            syncedCrud({
                list: () => [] as Item[],
                // e.g. supabase insert().select() returning data instead of data[0]
                create: async (input: Item) => [{ ...input, text: 'server' }] as unknown as Item,
                update: async (input: Partial<Item>) => [{ ...input, text: 'server' }] as unknown as Item,
            }),
        );
        obs$.get();
        await promiseTimeout(1);
        obs$.a.set({ id: 'a', text: 'local' });
        await promiseTimeout(10);
        obs$.a.text.set('local2');
        await promiseTimeout(10);

        const warnings = getArrayWarnings(warn);
        expect(warnings.length).toBe(1);
        expect(warnings[0][0]).toContain('syncedCrud create or update returned an array');
    });

    test('warns when syncedCrud update returns an array of rows', async () => {
        const obs$ = observable(
            syncedCrud({
                list: () => [{ id: 'a', text: 'a' }] as Item[],
                update: async (input: Partial<Item>) => [{ ...input }] as unknown as Item,
            }),
        );
        obs$.get();
        await promiseTimeout(1);
        obs$.a.text.set('local');
        await promiseTimeout(10);

        expect(getArrayWarnings(warn).length).toBe(1);
    });

    test('does not warn when create or update return a row or delete returns an array', async () => {
        const obs$ = observable(
            syncedCrud({
                list: () => [] as Item[],
                create: async (input: Item) => input,
                update: async (input: Partial<Item>) => input as Item,
                delete: async (input: Item) => [input],
            }),
        );
        obs$.get();
        await promiseTimeout(1);
        obs$.a.set({ id: 'a', text: 'local' });
        await promiseTimeout(10);
        obs$.a.text.set('local2');
        await promiseTimeout(10);
        obs$.a.delete();
        await promiseTimeout(10);

        expect(getArrayWarnings(warn).length).toBe(0);
    });

    test('does not warn for syncedCrud get returning a single row', async () => {
        const obs$ = observable(
            syncedCrud({
                get: () => ({ id: 'a', text: 'a' }) as Item,
                update: async (input: Partial<Item>) => input,
            }),
        );
        obs$.get();
        await promiseTimeout(1);

        expect(getArrayWarnings(warn).length).toBe(0);
    });

    test('does not warn for normal object-keyed or array syncedCrud lists with pending edits', async () => {
        for (const as of ['object', 'array'] as const) {
            let listed = 0;
            const obs$ = observable(
                syncedCrud({
                    list: () => [{ id: 'a', text: String(listed++) }] as Item[],
                    as,
                    update: () => new Promise<Partial<Item>>(() => {}),
                }),
            );
            obs$.get();
            await promiseTimeout(1);
            if (as === 'object') {
                (obs$ as any).a.text.set('local');
            } else {
                (obs$ as any)[0].text.set('local');
            }
            await promiseTimeout(1);
            await syncState(obs$).sync();
            await promiseTimeout(1);
        }

        expect(getArrayWarnings(warn).length).toBe(0);
    });
});
