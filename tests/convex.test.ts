import { observable } from '@legendapp/state';
import { syncedConvex } from '../src/sync-plugins/convex';
import { promiseTimeout } from './testglobals';

type Row = { _id: string; _creationTime?: number | string; test?: string };

// Minimal FunctionReference shims
const queryRef = { _type: 'query', _visibility: 'public', _args: {}, _returnType: [] as Row[] } as any;
const mutationRef = { _type: 'mutation', _visibility: 'public', _args: {}, _returnType: undefined as any } as any;

describe('convex plugin', () => {
    test('list (one-shot, realtime disabled)', async () => {
        const rows: Row[] = [{ _id: 'id1', _creationTime: 1, test: 'hi' }];

        const client: any = {
            query: jest.fn(async () => rows),
            // Unused in this test
            mutation: jest.fn(),
        };

        const obs = observable(
            syncedConvex({
                convex: client,
                query: queryRef,
                queryArgs: {},
                as: 'object',
                realtime: false,
            }),
        );

        expect(obs.get()).toEqual(undefined);

        await promiseTimeout(10);

        expect(client.query).toHaveBeenCalledTimes(1);
        expect(obs.get()).toEqual({ id1: { _id: 'id1', _creationTime: 1, test: 'hi' } });
    });

    // Note: Realtime path exercised in integration; here we focus on one-shot and writes

    test('mutations: update path calls convex.mutation and reconciles', async () => {
        const initial: Row[] = [{ _id: 'id1', _creationTime: 1, test: 'hi' }];
        const mutation = jest.fn(async (_ref: any, _input: any) => ({ _id: 'id1', _creationTime: 1, test: 'hello' }));
        const client: any = {
            query: jest.fn(async () => initial),
            mutation,
            watchQuery: jest.fn((_q: any, _args: any) => ({
                onUpdate: (_fn: () => void) => {},
                localQueryResult: () => initial,
            })),
        };

        const obs: any = observable(
            syncedConvex({
                convex: client,
                query: queryRef,
                as: 'object',
                update: mutationRef,
                realtime: false,
            }),
        );

        await promiseTimeout(1);

        // Update one field
        obs.id1.test.set('hello');
        await promiseTimeout(10);

        expect(mutation).toHaveBeenCalled();
        const [calledRef, calledInput] = mutation.mock.calls[0];
        expect(calledRef).toBe(mutationRef);
        expect(calledInput._id).toBe('id1');
        // Final observable state reflects update
        expect(obs.id1.get()).toEqual({ _id: 'id1', _creationTime: 1, test: 'hello' });
    });
});
