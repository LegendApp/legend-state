import { isEmpty, observable, Observable } from '@legendapp/state';
import Router, { NextRouter, useRouter } from 'next/router';

type ParsedUrlQuery = { [key: string]: string | string[] | undefined };
interface RouteInfo {
    pathname?: string;
    hash?: string;
    query?: ParsedUrlQuery;
}
interface TransitionOptions {
    shallow?: boolean;
    locale?: string | false;
    scroll?: boolean;
    unstable_skipClientCache?: boolean;
}
export interface ParamsUseObservableRouter<T extends object> {
    compute: (value: { pathname: string; hash: string; query: ParsedUrlQuery }) => T;
    set: (value: T, router: NextRouter) => { pathname?: string; hash?: string; query?: ParsedUrlQuery };
    pushOptions?: TransitionOptions;
    subscribe?: boolean;
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

let isSettingRoutes = false;
const routes$ = observable({});
let routeParams = {} as ParamsUseObservableRouter<any>;
let router: NextRouter;

routes$.onChange(({ value }) => {
    // Only run this if being manually changed by the user
    if (!isSettingRoutes) {
        const { pathname, hash, query } = routeParams.set(value, router);

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
            router.push(change, undefined, routeParams.pushOptions);
        }
    }
});

export function useObservableRouter<T extends object>(params: ParamsUseObservableRouter<T>): Observable<T> {
    const { subscribe, compute } = params;

    // Use the useRouter hook if we're on the client side and want to subscribe to changes.
    // Otherwise use the Router object so that this does not subscribe to router changes.
    router = typeof window !== 'undefined' && !subscribe ? Router : useRouter();

    try {
        if (!subscribe) {
            // Try getting a property of Router to see if it works. If it throws an error
            //  we're on the server so fallback to the hook.
            Router.asPath;
            router = Router;
        }
    } finally {
        router = router || useRouter();
    }

    // Update the local state with the new functions and options. This can happen when being run
    // on a new page or if the user just changes it on the current page.
    // It's better for performance than creating new observables or hooks for every use, since there may be
    // many uses of useObservableRouter in the lifecycle of a page.
    routeParams = params;

    // Get the pathname and hash
    const { asPath, pathname, query } = router;
    const hash = asPath.split('#')[1] || '';

    // Run the compute function to get the value of the object
    const obj = compute({ pathname, hash, query });

    // Set the object without triggering router.push
    try {
        isSettingRoutes = true;
        routes$.set(obj);
    } finally {
        isSettingRoutes = false;
    }

    // Return the observable with the computed values
    return routes$ as Observable<T>;
}
