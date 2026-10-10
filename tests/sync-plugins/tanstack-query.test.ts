import { observable, syncState, when } from '@legendapp/state';
import { QueryClient } from '@tanstack/query-core';
import { syncedQuery } from '../../src/sync-plugins/tanstack-query';

type Todo = {
    id: number;
    title: string;
};

describe('syncedQuery', () => {
    test('applies selected data from fetches and cache updates', async () => {
        const queryClient = new QueryClient();
        const queryKey = ['todos'] as const;
        let todos: Todo[] = [
            { id: 1, title: 'First' },
            { id: 2, title: 'Second' },
        ];
        const todos$ = observable(
            syncedQuery({
                queryClient,
                query: {
                    queryKey,
                    queryFn: async () => todos,
                    select: (data) => data.length,
                },
            }),
        );
        const state$ = syncState(todos$);
        const unsubscribe = todos$.onChange(() => {});

        try {
            expect(todos$.get()).toBeUndefined();
            await when(() => todos$.get() === 2);
            await when(() => !state$.isGetting.get());
            expect(todos$.get()).toBe(2);

            todos = [{ id: 1, title: 'First' }];
            state$.sync();

            expect(state$.isGetting.get()).toBe(true);
            await when(() => !state$.isGetting.get());
            expect(todos$.get()).toBe(1);

            queryClient.setQueryData<Todo[]>(queryKey, [
                ...todos,
                { id: 2, title: 'Second' },
                { id: 3, title: 'Third' },
            ]);

            await when(() => todos$.get() === 3);
            expect(todos$.get()).toBe(3);
        } finally {
            unsubscribe();
            queryClient.clear();
        }
    });
});
