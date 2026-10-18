import { observable } from '@legendapp/state';
import type { SupabaseClient } from '@supabase/supabase-js';
import { syncedSupabase } from '../src/sync-plugins/supabase';
import { promiseTimeout } from './testglobals';

test('realtime DELETE preserves other rows in set mode', async () => {
    let emit!: (payload: { eventType: 'DELETE'; old: { id: string } }) => void;
    const channel = {
        on(_event: string, _filter: unknown, callback: typeof emit) {
            emit = callback;
            return channel;
        },
        subscribe: () => channel,
        unsubscribe: () => {},
    };
    const rows = [{ id: 'a' }, { id: 'b' }];
    const obs$ = observable(
        syncedSupabase({
            supabase: { channel: () => channel } as unknown as SupabaseClient,
            collection: 'items',
            actions: ['read'],
            mode: 'set',
            changesSince: 'all',
            realtime: true,
            list: async () => ({ data: rows, error: null }),
        }),
    );

    obs$.get();
    await promiseTimeout(0);
    expect(obs$.get()).toEqual({ a: rows[0], b: rows[1] });

    emit({ eventType: 'DELETE', old: { id: 'a' } });
    await promiseTimeout(0);
    expect(obs$.get()).toEqual({ b: rows[1] });
});
