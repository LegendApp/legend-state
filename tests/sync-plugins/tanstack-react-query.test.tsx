import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { createElement } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { syncState } from '@legendapp/state';
import { observer } from '../../src/react/reactive-observer';
import { useObservableSyncedQuery } from '../../src/sync-plugins/tanstack-react-query';
import { promiseTimeout } from '../testglobals';

if (typeof document === 'undefined') {
    GlobalRegistrator.register();
}

describe('useObservableSyncedQuery with QueryClientProvider', () => {
    let client: QueryClient;

    beforeEach(() => {
        client = new QueryClient({
            defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
        });
    });

    afterEach(() => {
        cleanup();
        client.clear();
    });

    test('renders cached data, receives cache updates, and does not refetch on remount', async () => {
        client.setQueryData(['render'], 'cached');
        const queryFn = jest.fn(async () => 'fetched');
        const Component = observer(function Component() {
            const data$ = useObservableSyncedQuery({ query: { queryKey: ['render'], queryFn } });
            return createElement('div', { 'data-testid': 'value' }, data$.get());
        });
        const element = createElement(QueryClientProvider, { client }, createElement(Component));
        const first = render(element);
        await waitFor(() => expect(first.getByTestId('value').textContent).toBe('cached'));

        await act(async () => {
            client.setQueryData(['render'], 'updated');
            await promiseTimeout(5);
        });
        expect(first.getByTestId('value').textContent).toBe('updated');
        first.unmount();
        const second = render(element);
        await waitFor(() => expect(second.getByTestId('value').textContent).toBe('updated'));
        expect(queryFn).not.toHaveBeenCalled();
    });

    test('re-renders do not refetch but explicit sync does', async () => {
        client.setQueryData(['manual'], 'cached');
        const queryFn = jest.fn(async () => 'fetched');
        let state$: ReturnType<typeof syncState>;
        const Component = observer(function Component({ tick }: { tick: number }) {
            const data$ = useObservableSyncedQuery({ query: { queryKey: ['manual'], queryFn } });
            state$ = syncState(data$);
            return createElement('div', { 'data-testid': 'value' }, `${tick}:${data$.get()}`);
        });
        const element = (tick: number) =>
            createElement(QueryClientProvider, { client }, createElement(Component, { tick }));
        const view = render(element(0));
        await waitFor(() => expect(view.getByTestId('value').textContent).toBe('0:cached'));
        for (let tick = 1; tick <= 3; tick++) view.rerender(element(tick));
        expect(queryFn).not.toHaveBeenCalled();

        await act(async () => {
            await state$.sync();
            await promiseTimeout(5);
        });
        expect(view.getByTestId('value').textContent).toBe('3:fetched');
        expect(queryFn).toHaveBeenCalledTimes(1);
    });
});
