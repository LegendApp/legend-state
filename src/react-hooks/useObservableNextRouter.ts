import { isEmpty, observable, Observable, setSilently } from '@legendapp/state';
import Router, { NextRouter, useRouter } from 'next/router';

type ParsedUrlQuery = { [key: string]: string | string[] | undefined };

interface TransitionOptions {
    shallow?: boolean;
    locale?: string | false;
    scroll?: boolean;
    unstable_skipClientCache?: boolean;
}
export interface ObservableNextRouterState {
    pathname: string;
    hash: string;
    query: ParsedUrlQuery;
}
type RouteInfo = Partial<ObservableNextRouterState>;
export interface ParamsUseObservableNextRouterBase {
    transitionOptions?: TransitionOptions;
    method?: 'push' | 'replace';
    subscribe?: boolean;
}
export interface ParamsUseObservableNextRouter<T extends object> extends ParamsUseObservableNextRouterBase {
    compute: (value: ObservableNextRouterState) => T;
    set: (
        value: T,
        previous: T,
        router: NextRouter,
    ) => RouteInfo & {
        transitionOptions?: TransitionOptions;
        method?: 'push' | 'replace';
    };
}

function isShallowEqual(query1: ParsedUrlQuery, query2: ParsedUrlQuery) {
    if (!query1 !== !query2) {
        return false;
    }
    const keys1 = Object.keys(query1);
    const keys2 = Object.keys(query2);

    if (keys1.length !== keys2.length) {
        return false;
    }

    for (const key of keys1) {
        if (query1[key] !== query2[key]) {
            return false;
        }
    }

    return true;
}

const routes$ = observable({});
let routeParams = {} as ParamsUseObservableNextRouter<any>;
let router: NextRouter;

routes$.onChange(({ value, getPrevious }) => {
    // Only run this if being manually changed by the user
    let setter = routeParams?.set;
    if (!setter) {
        if ((value as any).pathname) {
            setter = () => value;
        } else {
            console.error('[legend-state]: Must provide a set method to useObservableNextRouter');
        }
    }
    const setReturn = setter(value, getPrevious(), router);
    const { pathname, hash, query } = setReturn;
    let { transitionOptions, method } = setReturn;

    method = method || routeParams?.method;
    transitionOptions = transitionOptions || routeParams?.transitionOptions;

    const prevHash = router.asPath.split('#')[1] || '';

    const change: RouteInfo = {};
    // Only include changes that were meant to be changed. For example the user may have
    // only changed the hash so we don't need to push a pathname change.
    if (pathname !== undefined && pathname !== router.pathname) {
        change.pathname = pathname;
    }
    if (hash !== undefined && hash !== prevHash) {
        change.hash = hash;
    }
    if (query !== undefined && !isShallowEqual(query, router.query)) {
        change.query = query;
    }
    // Only push if there are changes
    if (!isEmpty(change)) {
        const fn = method === 'replace' ? 'replace' : 'push';
        router[fn](change, undefined, transitionOptions).catch((e) => {
            // workaround for https://github.com/vercel/next.js/issues/37362
            if (!e.cancelled) throw e;
        });
    }
});

export function useObservableNextRouter(): Observable<ObservableNextRouterState>;
export function useObservableNextRouter<T extends object>(params: ParamsUseObservableNextRouter<T>): Observable<T>;
export function useObservableNextRouter(
    params: ParamsUseObservableNextRouterBase,
): Observable<ObservableNextRouterState>;
export function useObservableNextRouter<T extends object>(
    params?: ParamsUseObservableNextRouter<T> | ParamsUseObservableNextRouterBase,
): Observable<T> | Observable<ObservableNextRouterState> {
    const { subscribe, compute } = (params as ParamsUseObservableNextRouter<T>) || {};

    try {
        // Use the useRouter hook if we're on the client side and want to subscribe to changes.
        // Otherwise use the Router object so that this does not subscribe to router changes.
        router = typeof window !== 'undefined' && !subscribe ? Router : useRouter();
    } finally {
        router = router || useRouter();
    }

    // Update the local state with the new functions and options. This can happen when being run
    // on a new page or if the user just changes it on the current page.
    // It's better for performance than creating new observables or hooks for every use, since there may be
    // many uses of useObservableRouter in the lifecycle of a page.
    routeParams = params as ParamsUseObservableNextRouter<T>;

    // Get the pathname and hash
    const { asPath, pathname, query } = router;
    const hash = asPath.split('#')[1] || '';

    // Run the compute function to get the value of the object
    const computeParams = { pathname, hash, query };
    const obj = compute ? compute(computeParams) : computeParams;

    // Set the object without triggering router.push
    setSilently(routes$, obj);

    // Return the observable with the computed values
    return routes$ as any;
}
