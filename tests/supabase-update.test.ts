import { observable } from '@legendapp/state';
import { createClient } from '@supabase/supabase-js';
import { syncedSupabase } from '../src/sync-plugins/supabase';
import { promiseTimeout } from './testglobals';

// Real supabase-js client with a fake fetch that answers like PostgREST for a single table
function createTestClient({ insertDelay = 0 } = {}) {
    const rows = new Map<string, any>();
    const log: string[] = [];
    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
        const method = init?.method || 'GET';
        const body = init?.body ? JSON.parse(init.body as string) : undefined;
        const id = url.searchParams.get('id')?.replace(/^eq\./, '');

        if (method === 'GET') {
            return json([...rows.values()]);
        }
        if (method === 'POST') {
            log.push('insert start');
            await promiseTimeout(insertDelay);
            const inserted = (Array.isArray(body) ? body : [body]).map((row) => ({
                ...row,
                created_at: 'c',
                updated_at: 'u1',
            }));
            inserted.forEach((row) => rows.set(row.id, row));
            log.push('insert done');
            return json(inserted, 201);
        }
        if (method === 'PATCH') {
            if (!id || !rows.has(id)) {
                // PostgREST answers 200 [] when the filter matches no row
                log.push('update 0 rows');
                return json([]);
            }
            rows.set(id, { ...rows.get(id), ...body, updated_at: 'u2' });
            log.push('update ok');
            return json([rows.get(id)]);
        }
        return json({ message: `unexpected ${method}` }, 500);
    };

    const supabase = createClient('http://localhost:54321', 'anon-key', {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch },
    });
    return { supabase, rows, log };
}

describe('syncedSupabase update', () => {
    test('edit made while the insert is in flight reaches the server', async () => {
        const { supabase, rows, log } = createTestClient({ insertDelay: 30 });
        const obs$: any = observable(
            syncedSupabase({
                supabase,
                collection: 'items' as any,
                as: 'object',
                fieldCreatedAt: 'created_at',
                fieldUpdatedAt: 'updated_at',
                retry: { infinite: true, delay: 5, backoff: 'constant' },
                onError: () => {},
            }) as any,
        );
        obs$.get();
        await promiseTimeout(0);

        obs$.id1.set({ id: 'id1', name: 'new' });
        await promiseTimeout(0);
        obs$.id1.note.set('edited while insert in flight');
        await promiseTimeout(200);

        expect(log[0]).toEqual('insert start');
        expect(log).toContain('update 0 rows');
        expect(log[log.length - 1]).toEqual('update ok');
        expect(rows.get('id1')?.note).toEqual('edited while insert in flight');
    });
    test('update matching 0 rows calls onError instead of reporting success', async () => {
        const { supabase } = createTestClient();
        const errors: { message: string; source?: string; hasRevert: boolean }[] = [];
        const obs$: any = observable(
            syncedSupabase({
                supabase,
                collection: 'items' as any,
                as: 'object',
                fieldCreatedAt: 'created_at',
                fieldUpdatedAt: 'updated_at',
                onError: (error: Error, params: any) => {
                    errors.push({ message: error.message, source: params?.source, hasRevert: !!params?.revert });
                },
            }) as any,
        );
        obs$.get();
        await promiseTimeout(0);

        // Has created_at, so it is sent as an update to a row the server does not have
        obs$.id1.set({ id: 'id1', name: 'x', created_at: '2026-01-01T00:00:00Z' });
        await promiseTimeout(50);

        expect(errors[0]).toEqual({
            message: 'update matched no rows in items (id=id1)',
            source: 'update',
            hasRevert: true,
        });
    });
});
