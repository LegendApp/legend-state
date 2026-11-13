import { observable, syncState, when } from '@legendapp/state';
import { createClient } from '@supabase/supabase-js';
import { syncedSupabase } from '../src/sync-plugins/supabase';
import { promiseTimeout } from './testglobals';

// Real supabase-js client with a fake fetch that answers like PostgREST for a single table
function createTestClient({ insertDelay = 0, rejectUpdates = false } = {}) {
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
            if (rejectUpdates) {
                log.push('update rejected');
                return json({ message: 'update denied by RLS', code: '42501' }, 403);
            }
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
        const { supabase, rows } = createTestClient();
        rows.set('id1', { id: 'id1', name: 'old', created_at: '2026-01-01T00:00:00Z' });
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

        // Delete the loaded row remotely, then edit it locally to send an UPDATE.
        rows.delete('id1');
        obs$.id1.name.set('x');
        await promiseTimeout(50);

        expect(errors[0]).toEqual({
            message: 'update matched no rows in items (id=id1)',
            source: 'update',
            hasRevert: true,
        });
    });

    for (const failure of ['missing', 'rls'] as const) {
        for (const retryMode of ['disabled', 'finite', 'infinite'] as const) {
            test(`${failure} update follows ${retryMode} retry policy and keeps the pending change`, async () => {
                const { supabase, rows, log } = createTestClient({ rejectUpdates: failure === 'rls' });
                rows.set('id1', { id: 'id1', name: 'old', created_at: '2026-01-01T00:00:00Z' });
                const attempts: number[] = [];
                const obs$: any = observable(
                    syncedSupabase({
                        supabase,
                        collection: 'items' as any,
                        as: 'object',
                        fieldCreatedAt: 'created_at',
                        retry:
                            retryMode === 'disabled'
                                ? undefined
                                : { times: 3, infinite: retryMode === 'infinite', delay: 5, backoff: 'constant' },
                        onError: (_error, params) => {
                            attempts.push(params.retry!.retryNum);
                            if (retryMode === 'infinite' && attempts.length === 3) {
                                params.retry!.cancelRetry = true;
                            }
                        },
                    }) as any,
                );
                obs$.get();
                await when(syncState(obs$).isLoaded);
                rows.delete('id1');
                obs$.id1.name.set('pending');
                const state = syncState(obs$);
                const expectedAttempts = retryMode === 'disabled' ? 1 : 3;
                await when(() => !state.isSetting.get() && attempts.length === expectedAttempts);

                expect(attempts).toEqual(retryMode === 'disabled' ? [0] : [0, 1, 2]);
                expect(log).toHaveLength(expectedAttempts);
                expect(state.numPendingSets.peek()).toBe(0);
                expect(state.getPendingChanges()).not.toEqual({});
                await promiseTimeout(20);
                expect(log).toHaveLength(expectedAttempts);
            });
        }
    }
});
