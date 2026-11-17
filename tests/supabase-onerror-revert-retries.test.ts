import { observable } from '@legendapp/state';
import { createClient } from '@supabase/supabase-js';
import { syncedSupabase } from '../src/sync-plugins/supabase';
import { promiseTimeout } from './testglobals';

// Real supabase-js client with a fake fetch that refuses every update, like an RLS policy would.
function createRejectingClient() {
    const rows = new Map<string, any>([['id1', { id: 'id1', name: 'server', created_at: 'c1', updated_at: 'u1' }]]);
    const log: string[] = [];
    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const method = init?.method || 'GET';
        if (method === 'GET') return json([...rows.values()]);
        log.push(`${method} rejected`);
        return json({ message: 'update denied by RLS', code: '42501' }, 403);
    };

    const supabase = createClient('http://localhost:54321', 'anon-key', {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch },
    });
    return { supabase, log };
}

describe('supabase onError revert retries', () => {
    test.failing('revert() in onError cancels the retries for that update', 1000, async () => {
        // repro supabase onError revert retries
        const { supabase, log } = createRejectingClient();
        let numErrors = 0;
        const obs$: any = observable(
            syncedSupabase({
                supabase,
                collection: 'items' as any,
                as: 'object',
                fieldCreatedAt: 'created_at',
                fieldUpdatedAt: 'updated_at',
                fieldDeleted: 'deleted',
                retry: { times: 3, delay: 1, backoff: 'constant' },
                onError: (_error: Error, params: any) => {
                    numErrors++;
                    params.revert();
                },
            }) as any,
        );

        obs$.get();
        await promiseTimeout(20);

        obs$.id1.name.set('local edit');
        await promiseTimeout(200);

        // The local edit is undone...
        expect(obs$.id1.name.peek()).toEqual('server');
        // ...so the rejected write should be attempted once instead of retried.
        expect(numErrors).toEqual(1);
        expect(log).toEqual(['PATCH rejected']);
    });
});
