import { observable } from '@legendapp/state';
import { createClient } from '@supabase/supabase-js';
import { syncedSupabase } from '../src/sync-plugins/supabase';
import { promiseTimeout } from './testglobals';

const RLS_MESSAGE = 'new row violates row-level security policy for table "items"';

// Real supabase-js client with a fake fetch: reads return no rows, every write is rejected by RLS like PostgREST does
function createTestClient() {
    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    const fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
        const method = init?.method || 'GET';
        if (method === 'GET') {
            return json([]);
        }
        return json({ code: '42501', details: null, hint: null, message: RLS_MESSAGE }, 403);
    };
    return createClient('http://localhost:54321', 'anon-key', {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch },
    });
}

describe('syncedSupabase custom functions', () => {
    for (const source of ['create', 'update'] as const) {
        test(`custom ${source} returning { error } reaches onError with the server error`, async () => {
            const supabase = createTestClient();
            const errors: { message: string; source?: string; hasRevert: boolean }[] = [];
            // Custom write functions return the supabase-js result ({ data, error }), like list does
            const customFns = {
                create: (input: any) => supabase.from('items').insert(input).select(),
                update: (input: any) => supabase.from('items').update(input).eq('id', input.id).select(),
            };
            const obs$: any = observable(
                syncedSupabase({
                    supabase,
                    collection: 'items' as any,
                    as: 'object',
                    fieldCreatedAt: 'created_at',
                    fieldUpdatedAt: 'updated_at',
                    [source]: customFns[source] as any,
                    onError: (error: Error, params: any) => {
                        errors.push({ message: error.message, source: params?.source, hasRevert: !!params?.revert });
                    },
                }) as any,
            );
            obs$.get();
            await promiseTimeout(0);

            // Rows with created_at are updates, rows without are creates
            obs$.id1.set(
                source === 'update'
                    ? { id: 'id1', name: 'x', created_at: '2026-01-01T00:00:00Z' }
                    : { id: 'id1', name: 'x' },
            );
            await promiseTimeout(50);

            expect(errors[0]).toEqual({ message: RLS_MESSAGE, source, hasRevert: true });
        });
    }
});
