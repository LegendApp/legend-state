import { GlobalRegistrator } from '@happy-dom/global-registrator';

if (typeof document === 'undefined') {
    GlobalRegistrator.register();
}

import { createQueryCoreMock } from './tanstack-query.mock';

jest.mock('@tanstack/query-core', () => createQueryCoreMock());

jest.mock('@tanstack/react-query', () => {
    const { QueryClient } = jest.requireMock('@tanstack/query-core');
    const defaultClient = new QueryClient();
    return {
        __esModule: true,
        useQueryClient: () => defaultClient,
    };
});

import { createElement, useState } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { syncState } from '@legendapp/state';
import { observer } from '../../src/react/reactive-observer';
import { useObservableSyncedQuery } from '../../src/sync-plugins/tanstack-react-query';
import { QueryClient } from '@tanstack/query-core';

const { refetchMock, getSubscriberCallback } = jest.requireMock('@tanstack/query-core') as {
    refetchMock: jest.Mock;
    getSubscriberCallback: () => ((result: any) => void) | undefined;
};

const promiseTimeout = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('useObservableSyncedQuery', () => {
    beforeEach(() => {
        refetchMock.mockClear();
        refetchMock.mockImplementation(() => Promise.resolve({ data: 'fresh', status: 'success' }));
    });

    test('renders initial cached data without refetching', async () => {
        const Test = observer(function Test() {
            const data$ = useObservableSyncedQuery<string>({
                queryClient: new QueryClient(),
                query: { queryKey: ['cached-render'] },
            });
            return createElement('div', { 'data-testid': 'value' }, String(data$.get()));
        });

        const { getByTestId } = render(createElement(Test));
        await waitFor(() => promiseTimeout(0));

        expect(getByTestId('value').textContent).toBe('initial');
        expect(refetchMock).not.toHaveBeenCalled();
    });

    test('component remount does not trigger refetch when data is fresh', async () => {
        const queryClient = new QueryClient();

        const Test = observer(function Test() {
            const data$ = useObservableSyncedQuery<string>({
                queryClient,
                query: { queryKey: ['remount-fresh'] },
            });
            return createElement('div', { 'data-testid': 'value' }, String(data$.get()));
        });

        const { unmount, getByTestId } = render(createElement(Test));
        await waitFor(() => promiseTimeout(0));
        expect(getByTestId('value').textContent).toBe('initial');

        refetchMock.mockClear();
        unmount();

        // Remount the same component with the same queryClient
        const { getByTestId: getByTestId2 } = render(createElement(Test));
        await waitFor(() => promiseTimeout(0));

        expect(getByTestId2('value').textContent).toBe('initial');
        expect(refetchMock).not.toHaveBeenCalled();
    });

    test('observer subscription pushes new data into the component', async () => {
        const queryClient = new QueryClient();

        const Test = observer(function Test() {
            const data$ = useObservableSyncedQuery<string>({
                queryClient,
                query: { queryKey: ['subscription-push'] },
            });
            return createElement('div', { 'data-testid': 'value' }, String(data$.get()));
        });

        const { getByTestId } = render(createElement(Test));
        await waitFor(() => promiseTimeout(0));
        expect(getByTestId('value').textContent).toBe('initial');

        // Simulate TQ observer pushing a background refetch result
        const cb = getSubscriberCallback();
        expect(cb).toBeDefined();

        act(() => {
            cb!({
                status: 'success',
                data: 'background-update',
                error: null,
                isLoading: false,
                isFetching: false,
                isStale: false,
                fetchStatus: 'idle',
            });
        });

        await waitFor(() => promiseTimeout(0));
        expect(getByTestId('value').textContent).toBe('background-update');
    });

    test('onQueryStateChange receives state updates in component context', async () => {
        const queryClient = new QueryClient();
        const stateChanges: any[] = [];

        const Test = observer(function Test() {
            const data$ = useObservableSyncedQuery<string>({
                queryClient,
                query: { queryKey: ['state-change'] },
                onQueryStateChange: (state) => {
                    stateChanges.push({ ...state });
                },
            });
            return createElement('div', { 'data-testid': 'value' }, String(data$.get()));
        });

        render(createElement(Test));
        await waitFor(() => promiseTimeout(0));

        const cb = getSubscriberCallback();
        act(() => {
            cb!({
                status: 'success',
                data: 'updated',
                error: null,
                isLoading: false,
                isFetching: true,
                isStale: false,
                fetchStatus: 'fetching',
            });
        });

        await waitFor(() => promiseTimeout(0));

        expect(stateChanges.length).toBeGreaterThanOrEqual(1);
        const lastState = stateChanges[stateChanges.length - 1];
        expect(lastState.isFetching).toBe(true);
        expect(lastState.fetchStatus).toBe('fetching');
    });

    test('error from observer is reflected via onQueryStateChange', async () => {
        const queryClient = new QueryClient();
        const stateChanges: any[] = [];

        const Test = observer(function Test() {
            const data$ = useObservableSyncedQuery<string>({
                queryClient,
                query: { queryKey: ['error-component'] },
                onQueryStateChange: (state) => {
                    stateChanges.push({ ...state });
                },
            });
            return createElement('div', { 'data-testid': 'value' }, String(data$.get() ?? 'loading'));
        });

        render(createElement(Test));
        await waitFor(() => promiseTimeout(0));

        const cb = getSubscriberCallback();
        const testError = new Error('Network failure');

        // The sync infrastructure's onGetError re-throws errors, so we need to catch it
        try {
            act(() => {
                cb!({
                    status: 'error',
                    data: undefined,
                    error: testError,
                    isLoading: false,
                    isFetching: false,
                    isStale: false,
                    fetchStatus: 'idle',
                });
            });
        } catch {
            // sync infrastructure re-throws errors from subscribe
        }

        await waitFor(() => promiseTimeout(0));

        const errorState = stateChanges.find((s) => s.status === 'error');
        expect(errorState).toBeDefined();
        expect(errorState!.error.message).toBe('Network failure');
    });

    test('manual .sync() forces refetch even when data is not stale', async () => {
        const queryClient = new QueryClient();
        let data$Ref: any;

        const Test = observer(function Test() {
            const data$ = useObservableSyncedQuery<string>({
                queryClient,
                query: { queryKey: ['manual-sync'] },
            });
            data$Ref = data$;
            return createElement('div', { 'data-testid': 'value' }, String(data$.get()));
        });

        const { getByTestId } = render(createElement(Test));
        await waitFor(() => promiseTimeout(0));

        expect(getByTestId('value').textContent).toBe('initial');
        expect(refetchMock).toHaveBeenCalledTimes(0);

        // Data is not stale (mock returns isStale: false), but manual sync should force refetch
        await act(async () => {
            await syncState(data$Ref).sync();
        });

        await waitFor(() => promiseTimeout(0));
        expect(refetchMock).toHaveBeenCalledTimes(1);
    });

    test('multiple re-renders do not refetch, but sync() does', async () => {
        const queryClient = new QueryClient();
        let data$Ref: any;
        let triggerRerender: () => void;

        const Child = observer(function Child() {
            const data$ = useObservableSyncedQuery<string>({
                queryClient,
                query: { queryKey: ['multi-rerender-sync'] },
            });
            data$Ref = data$;
            return createElement('div', { 'data-testid': 'value' }, String(data$.get()));
        });

        function Parent() {
            const [count, setCount] = useState(0);
            triggerRerender = () => setCount((c) => c + 1);
            return createElement('div', null, createElement('span', null, `render-${count}`), createElement(Child));
        }

        const { getByTestId } = render(createElement(Parent));
        await waitFor(() => promiseTimeout(0));
        expect(getByTestId('value').textContent).toBe('initial');
        expect(refetchMock).toHaveBeenCalledTimes(0);

        // Re-render #1
        act(() => triggerRerender());
        await waitFor(() => promiseTimeout(0));
        expect(refetchMock).toHaveBeenCalledTimes(0);

        // Re-render #2
        act(() => triggerRerender());
        await waitFor(() => promiseTimeout(0));
        expect(refetchMock).toHaveBeenCalledTimes(0);

        // Re-render #3
        act(() => triggerRerender());
        await waitFor(() => promiseTimeout(0));
        expect(refetchMock).toHaveBeenCalledTimes(0);

        // Now explicit sync() — should force refetch
        await act(async () => {
            await syncState(data$Ref).sync();
        });
        await waitFor(() => promiseTimeout(0));
        expect(refetchMock).toHaveBeenCalledTimes(1);

        await act(async () => {
            await syncState(data$Ref).sync();
        });
        await waitFor(() => promiseTimeout(0));
        expect(refetchMock).toHaveBeenCalledTimes(2);
    });
});
