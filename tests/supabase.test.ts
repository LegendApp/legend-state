import { observable } from '../src/observable';
import { syncedSupabase } from '../src/sync-plugins/supabase';
import { syncState } from '../src/syncState';
import { promiseTimeout } from './testglobals';

type Item = {
    id: string;
    text: string;
};

function createRealtimeClient() {
    let onPostgresChange: ((payload: any) => void) | undefined;
    const channel = {
        on: (_type: string, _filter: object, callback: (payload: any) => void) => {
            onPostgresChange = callback;
            return channel;
        },
        subscribe: () => channel,
        unsubscribe: () => {},
    };
    const client = {
        channel: () => channel,
    };

    return {
        client,
        emit: (payload: any) => onPostgresChange!(payload),
    };
}

describe('syncedSupabase', () => {
    test('a child set activates sync without an existing observer', async () => {
        const created: Item[] = [];
        const obs$ = observable<Record<string, Item>>(
            syncedSupabase({
                supabase: {} as any,
                collection: 'items' as any,
                actions: ['create'],
                create: async (input) => {
                    created.push(input as Item);
                    return { data: input, error: null } as any;
                },
            }),
        );

        obs$.one.set({ id: 'one', text: 'created' });
        await promiseTimeout(1);

        expect(created).toEqual([{ id: 'one', text: 'created' }]);
        expect(syncState(obs$).numPendingSets.get()).toEqual(0);
    });

    test('changesSince all replaces rows omitted from a later full list', async () => {
        let rows: Item[] = [
            { id: '1', text: 'one' },
            { id: '2', text: 'two' },
        ];
        const obs$ = observable<Record<string, Item>>(
            syncedSupabase({
                supabase: {} as any,
                collection: 'items' as any,
                changesSince: 'all',
                actions: ['read'],
                list: async () => ({ data: rows, error: null }) as any,
            }),
        );
        const dispose = obs$.onChange(() => {});

        obs$.get();
        await promiseTimeout(1);
        expect(obs$.get()).toEqual({
            1: { id: '1', text: 'one' },
            2: { id: '2', text: 'two' },
        });

        rows = [{ id: '1', text: 'one' }];
        await syncState(obs$).sync();
        await promiseTimeout(1);

        expect(obs$.get()).toEqual({
            1: { id: '1', text: 'one' },
        });
        dispose();
    });

    test('realtime delete merges into changesSince all state', async () => {
        const realtime = createRealtimeClient();
        const rows: Item[] = [
            { id: '1', text: 'one' },
            { id: '2', text: 'two' },
        ];
        const obs$ = observable<Record<string, Item>>(
            syncedSupabase({
                supabase: realtime.client as any,
                collection: 'items' as any,
                changesSince: 'all',
                mode: 'set',
                actions: ['read'],
                realtime: true,
                list: async () => ({ data: rows, error: null }) as any,
            }),
        );

        obs$.get();
        await promiseTimeout(1);

        realtime.emit({
            eventType: 'DELETE',
            old: { id: '1', text: 'one' },
        });
        await promiseTimeout(1);

        expect(obs$.get()).toEqual({
            2: { id: '2', text: 'two' },
        });
    });

    test('realtime update applies to a local row without updated_at', async () => {
        const realtime = createRealtimeClient();
        type Row = Item & { created_at?: string; updated_at?: string };
        const obs$ = observable<Record<string, Row>>(
            syncedSupabase({
                supabase: realtime.client as any,
                collection: 'items' as any,
                actions: ['read'],
                realtime: true,
                fieldCreatedAt: 'created_at',
                fieldUpdatedAt: 'updated_at',
                list: async () =>
                    ({ data: [{ id: '1', text: 'one', created_at: '2024-01-01T00:00:00.000Z' }], error: null }) as any,
            }),
        );

        obs$.get();
        await promiseTimeout(1);

        realtime.emit({
            eventType: 'UPDATE',
            new: {
                id: '1',
                text: 'updated',
                created_at: '2024-01-01T00:00:00.000Z',
                updated_at: '2024-02-01T00:00:00.000Z',
            },
        });
        await promiseTimeout(1);

        expect(obs$['1'].text.get()).toEqual('updated');
    });
});
