import { observable } from '../src/observable';
import { syncedCrud } from '../src/sync-plugins/crud';
import { syncedSupabase } from '../src/sync-plugins/supabase';
import { symbolDelete } from '../src/globals';
import { promiseTimeout } from './testglobals';

const rows = [
    { id: 'a', text: 'deleted', deleted: true, created_at: '2025-01-01', updated_at: '2025-01-02' },
    { id: 'b', text: 'live', deleted: false, created_at: '2025-01-01', updated_at: '2025-01-02' },
];

describe('issue 515', () => {
    test('changesSince all (set mode) removes soft deleted rows instead of Symbol(delete)', async () => {
        // repro #515
        const obs$ = observable<any>(
            syncedSupabase({
                supabase: {} as any,
                collection: 'entries' as any,
                list: async () => ({ data: rows.map((row) => ({ ...row })), error: null }) as any,
                fieldId: 'id',
                fieldCreatedAt: 'created_at',
                fieldUpdatedAt: 'updated_at',
                fieldDeleted: 'deleted',
                changesSince: 'all',
            } as any),
        );

        obs$.get();
        await promiseTimeout(30);

        const value = obs$.get();
        expect(Object.values(value)).not.toContain(symbolDelete);
        expect(Object.keys(value)).toEqual(['b']);
    });

    test('subscribe update in set mode removes soft deleted rows', async () => {
        let update: any;
        const obs$ = observable<any>(
            syncedCrud({
                list: async () => [],
                subscribe: (params: any) => {
                    update = params.update;
                },
                fieldDeleted: 'deleted',
            } as any),
        );

        obs$.get();
        await promiseTimeout(0);
        update({ value: rows, mode: 'set' });
        await promiseTimeout(0);

        expect(Object.keys(obs$.get())).toEqual(['b']);
    });
});
