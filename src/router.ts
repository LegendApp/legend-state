import { observable, Observable } from '@legendapp/state';
import { onChangeRemote } from '@legendapp/state/sync';
import { useRouter } from 'next/router';
import { ReactNode } from 'react';

// Helper types for parsing options and defaults
type ParseDefault<T extends string> = T extends `${infer Options}=${infer Default}`
    ? Default extends Options
        ? Default
        : never
    : never;

type ParseOptions<T extends string> = T extends `${infer Options}=${string}`
    ? Options extends `${string}|${string}`
        ? Split<Options, '|'>
        : Options
    : T extends `${string}|${string}`
      ? Split<T, '|'>
      : T;

type Split<S extends string, D extends string> = string extends S
    ? string
    : S extends ''
      ? never
      : S extends `${infer T}${D}${infer U}`
        ? T | Split<U, D>
        : S;

type WithDefault<T extends string> = ParseDefault<T> extends never ? never : ParseDefault<T>;

// Types for parsing all parameters
type ExtractParams<T extends string> = T extends `${infer Path}?${infer Query}#${infer Hash}`
    ? ExtractPathParams<Path> & ExtractQueryParams<Query> & ExtractHashParams<Hash>
    : T extends `${infer Path}?${infer Query}`
      ? ExtractPathParams<Path> & ExtractQueryParams<Query>
      : T extends `${infer Path}#${infer Hash}`
        ? ExtractPathParams<Path> & ExtractHashParams<Hash>
        : ExtractPathParams<T>;

type ExtractPathParams<T extends string> = T extends `${string}:${infer Param}(${infer Options})/${infer Rest}`
    ? {
          [K in Param]?: ParseOptions<Options>;
      } & {
          [K in Param as WithDefault<Options> extends never ? never : K]?: ParseOptions<Options>;
      } & ExtractPathParams<`/${Rest}`>
    : T extends `${string}:${infer Param}/${infer Rest}`
      ? { [K in Param]: string } & ExtractPathParams<`/${Rest}`>
      : T extends `${string}:${infer Param}(${infer Options})`
        ? {
              [K in Param]?: ParseOptions<Options>;
          } & {
              [K in Param as WithDefault<Options> extends never ? never : K]?: ParseOptions<Options>;
          }
        : T extends `${string}:${infer Param}`
          ? { [K in Param]: string }
          : {};

type ExtractQueryParams<T extends string> = T extends `${infer Param}(${infer Options})&${infer Rest}`
    ? Param extends `${infer Q}&${infer Rest2}`
        ? { [K in Q]: string } & ExtractQueryParams<`${Rest2}(${Options})&${Rest}`>
        : {
              [K in Param]?: ParseOptions<Options>;
          } & {
              [K in Param as WithDefault<Options> extends never ? never : K]?: ParseOptions<Options>;
          } & ExtractQueryParams<Rest>
    : T extends `${infer Param}&${infer Rest}`
      ? { [K in Param]: string } & ExtractQueryParams<Rest>
      : T extends `${infer Param}(${infer Options})`
        ? {
              [K in Param]?: ParseOptions<Options>;
          } & {
              [K in Param as WithDefault<Options> extends never ? never : K]?: ParseOptions<Options>;
          }
        : T extends `${infer Param}`
          ? { [K in Param]?: string }
          : {};

type ExtractHashParams<T extends string> = T extends `${infer Param}&${infer Rest}`
    ? { [K in Param]: string } & ExtractHashParams<Rest>
    : T extends `${infer Param}`
      ? { [K in Param]: string }
      : {};

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

type CombineUnionTypes<T> = {
    [K in keyof UnionToIntersection<T>]: T extends { [P in K]: infer U } ? U : K extends keyof T ? T[K] : never;
};

type Simplify<T> = { -readonly [K in keyof T]: T[K] } & {};

interface RouteInfo {
    pattern: string;
    defaults: Map<string, string>;
    // options: Map<string, Set<string>>;
    allParams: string[];
    pathParams: string[];
    queryParams: string[];
    hashParams: string[];
    pathPattern: string;
    queryPattern: string;
    hashPattern: string;
}

export function urlMatchesRoute(url: string, route: RouteInfo): boolean {
    // Parse the URL
    const [pathAndQuery, hash] = url.split('#');
    const [path, query] = pathAndQuery.split('?');

    // Create a regex pattern from the route pattern
    const pathPattern = route.pattern
        .split('?')[0]
        .replace(/:[a-zA-Z]+(?:\([^)]+\))?/g, '([^/]+)')
        .replace(/\//g, '\\/');
    const pathRegex = new RegExp(`^${pathPattern}$`);

    // Check if the path matches
    if (!pathRegex.test(path)) {
        return false;
    }

    // Check query parameters
    if (query) {
        const queryParams = new URLSearchParams(query);
        for (const param of route.queryParams) {
            if (!queryParams.has(param) && !route.defaults.has(param)) {
                return false;
            }
        }
    }

    // Check hash parameters
    if (hash) {
        const hashParams = new URLSearchParams(hash);
        for (const param of route.hashParams) {
            if (!hashParams.has(param) && !route.defaults.has(param)) {
                return false;
            }
        }
    }

    return true;
}

export function parseUrlForRouteInfo(url: string, routeInfo: RouteInfo): Record<string, string> | undefined {
    const result: Record<string, string> = {};

    // Parse the URL
    const [pathAndQuery, hash] = url.split('#');
    const [path, query] = pathAndQuery.split('?');

    // Parse path parameters
    const pathPatterns = path.split('/');
    const routePathPatterns = routeInfo.pathPattern.split('/');

    if (pathPatterns.length !== routePathPatterns.length) {
        return undefined;
    }

    for (let i = 0; i < routePathPatterns.length; i++) {
        const routePathPattern = routePathPatterns[i];
        const pathPattern = pathPatterns[i];
        if (routePathPattern.startsWith(':')) {
            const paramName = routePathPattern.slice(1).split('(')[0];
            const value = pathPattern;
            if (value !== undefined) {
                // const options = routeInfo.options.get(paramName);
                // if (!options || options.has(value)) {
                result[paramName] = value;
                // } else {
                //     // Invalid value for parameter
                //     return undefined;
                // }
            } else {
                // Fail out if the value is undefined
                return undefined;
            }
        } else if (routePathPattern !== pathPattern) {
            // Fail out if the path patterns don't match
            return undefined;
        }
    }

    // Parse query parameters
    if (query) {
        const queryParams = new URLSearchParams(query);
        for (const param of routeInfo.queryParams) {
            if (queryParams.has(param)) {
                result[param] = queryParams.get(param)!;
            }
        }
    }

    // Parse hash parameters
    if (hash) {
        const hashParams = new URLSearchParams(hash);
        for (const param of routeInfo.hashParams) {
            if (hashParams.has(param)) {
                result[param] = hashParams.get(param)!;
            }
        }
    }

    // Add default values for missing parameters
    for (const [param, defaultValue] of routeInfo.defaults) {
        if (!(param in result)) {
            result[param] = defaultValue;
        }
    }

    return result;
}

export function parseUrlToRoutes<T extends Record<string, [string, object]>>(routes: Routes<T>, url: string) {
    const { routeInfos } = routes;
    const routesData: RoutesData<any> = {
        named: {},
        params: {},
    };
    Object.keys(routeInfos).forEach((key: keyof T) => {
        const routeData = parseUrlForRouteInfo(url, routeInfos[key]);
        if (routeData) {
            routesData.named[key] = routeData;
            Object.assign(routesData.params, routeData);
        }
    });
    return routesData;
}

export function routeInfoToUrl(routeInfo: RouteInfo, params: Record<string, string>): string {
    let url = routeInfo.pathPattern;

    // Replace path parameters
    url = url.replace(/:[a-zA-Z]+(?:\([^)]+\))?/g, (match) => {
        const paramName = match.slice(1).split('(')[0];
        const paramValue = params[paramName] || routeInfo.defaults.get(paramName);
        if (paramValue === undefined) {
            throw new Error(`Missing required parameter: ${paramName}`);
        }
        // const options = routeInfo.options.get(paramName);
        // if (options && !options.has(paramValue)) {
        //     throw new Error(`Invalid value for ${paramName}: ${paramValue}`);
        // }
        return encodeURIComponent(paramValue);
    });

    // Add query parameters
    const queryParams: string[] = [];
    for (const param of routeInfo.queryParams) {
        const value = params[param];
        if (value !== undefined) {
            queryParams.push(`${encodeURIComponent(param)}=${encodeURIComponent(value)}`);
        }
    }
    if (queryParams.length > 0) {
        url += `?${queryParams.join('&')}`;
    }

    // Add hash parameters
    const hashParams: string[] = [];
    for (const param of routeInfo.hashParams) {
        const value = params[param];
        if (value !== undefined) {
            hashParams.push(`${encodeURIComponent(param)}=${encodeURIComponent(value)}`);
        }
    }
    if (hashParams.length > 0) {
        url += `#${hashParams.join('&')}`;
    }

    return url;
}

function createRoute<T extends string>(param: T | [T, Record<string, string>]): RouteInfo {
    // Parse pattern to extract defaults
    const options = new Map<string, Set<string>>();
    const pattern = typeof param === 'string' ? param : param[0];
    const params = typeof param === 'string' ? {} : param[1];
    const defaults = new Map<string, string>(params ? Object.entries(params) : []);

    // Split pattern into components
    const [pathAndQuery, hashPattern = ''] = pattern.split('#');
    const [pathPattern, queryPattern = ''] = pathAndQuery.split('?');

    const pathParams: string[] = [];
    const queryParams: string[] = [];
    const hashParams: string[] = [];
    const allParams: string[] = [];

    // Parse path parameter defaults
    pathPattern.replace(/:[a-zA-Z]+(\([^)]+\))?/g, (match) => {
        // Trim ( and ) from match, split by |
        const [before, after] = match.split('(');
        const paramName = before.slice(1);
        pathParams.push(paramName);
        allParams.push(paramName);
        if (after) {
            const optionsArr = after.slice(0, -1).split('|');
            options.set(paramName, new Set(optionsArr));
        }
        return match;
    });

    // Parse query parameter
    queryPattern.split('&').forEach((param) => {
        const match = param.match(/([^(]+)(\(([^)]+)\))?/);
        if (match) {
            const [, paramName, opts] = match;
            queryParams.push(paramName);
            allParams.push(paramName);
            if (opts) {
                const optionsArr = opts.slice(1, -1).split('=')[0].split('|');
                options.set(paramName, new Set(optionsArr));
                const defaultMatch = opts.match(/([^|]+)=([^|)]+)/);
                if (defaultMatch) {
                    defaults.set(paramName, defaultMatch[2]);
                }
            }
        }
    });

    // Parse hash parameters
    hashPattern.split('&').forEach((param) => {
        const match = param.match(/([^(]+)(\(([^)]+)\))?/);
        if (match) {
            const [, paramName, , opts] = match;
            hashParams.push(paramName);
            allParams.push(paramName);
            if (opts) {
                const optionsArr = opts.split('=')[0].split('|');
                options.set(paramName, new Set(optionsArr));
                const defaultMatch = opts.match(/([^|]+)=([^|)]+)/);
                if (defaultMatch) {
                    defaults.set(paramName, defaultMatch[2]);
                }
            }
        }
    });

    return {
        pattern,
        // options,
        defaults,
        pathParams,
        queryParams,
        hashParams,
        allParams,
        pathPattern,
        queryPattern,
        hashPattern,
    };
}

type RoutesData<T extends Record<string, readonly [string, object]>> = Simplify<{
    currentRoute?: keyof T & string;
    named: {
        // TODO: CHange this & to a merge because it's turning number in T[K][1] into never
        -readonly [K in keyof T]: Simplify<ExtractParams<T[K][0]> & Simplify<T[K][1]>>;
    };
    params: CombineUnionTypes<
        {
            [K in keyof T]: ExtractParams<T[K][0]> & Simplify<T[K][1]>;
        }[keyof T]
    >;
}>;

type Routes<T extends Record<string, readonly [string, object]>> = {
    routes$: Observable<RoutesData<T>>;
    routeInfos: Record<keyof T, RouteInfo>;
};

type PartialRecursive<T> = {
    [K in keyof T]?: PartialRecursive<T[K]>;
};

export type RoutePattern<T extends string> = readonly [
    T,
    {
        [K in keyof ExtractParams<T>]?: any;
    },
];

type RoutesPatternType<T extends Record<string, any>> = {
    [K in keyof T]: T[K] extends string
        ? T[K]
        : T[K] extends RoutePattern<infer U>
          ? RoutePattern<U>
          : {
                [K2 in keyof ExtractParams<T[K][0]>]?: any;
            };
};

export function createRoutes<T extends Record<string, any>>(routes: RoutesPatternType<T>): Routes<T> {
    const routeInfos: Record<string, RouteInfo> = {};
    const routesOut = {
        named: {} as Record<string, Record<string, string | undefined>>,
        params: {} as Record<string, string | undefined>,
    };

    Object.keys(routes).forEach((key) => {
        const routeInfo = createRoute(routes[key] as any);
        routeInfos[key] = routeInfo;
        routesOut.named[key] = {};
        routeInfo.allParams.forEach((param) => {
            routesOut.params[param] = undefined;
            routesOut.named[key][param] = undefined;
        });
    });

    const routes$ = observable(routesOut);

    return { routes$, routeInfos } as any;
}

const syncedRoutes = new Map<Routes<any>, Observable<string>>();
export function getUrlForRoutes$(routes: Routes<any>) {
    if (!syncedRoutes.has(routes)) {
        const { routes$, routeInfos } = routes;
        const url$ = observable('');

        url$.onChange(({ value: url }) => {
            onChangeRemote(() => {
                let currentRoute = routes$.currentRoute.peek();
                // Parse the url to get the routes data
                const routesData = parseUrlToRoutes(routes, url);
                // Get the keys of the named routes
                const matchingKeys = Object.keys(routesData.named);
                // If the current route is not in the new routes data, set it to the first matching route
                if (!currentRoute || !matchingKeys.includes(currentRoute)) {
                    currentRoute = matchingKeys[0];
                }
                // Update the routes data
                routes$.set({ ...routesData, currentRoute });
            });
        });

        routes$.onChange(({ value: routesData, isFromSync, changes }) => {
            // Only update the url if the change does not come from setting it above
            if (!isFromSync) {
                const changedName = changes.find(({ path }) => path.length >= 2 && path[0] === 'named')?.path[1];
                let url: string | undefined;
                const currentRoute = routes$.currentRoute.peek();
                // If user updated a named route, update the url
                if (changedName) {
                    // Get the data for the changed named route
                    const data = routesData.named[changedName] as Record<string, string>;
                    // Convert the data to a url
                    url = routeInfoToUrl(routeInfos[changedName], data);
                } else if (currentRoute) {
                    // If user updated a param, update the url with the current route
                    url = routeInfoToUrl(routeInfos[currentRoute], routesData.params as Record<string, string>);
                } else if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
                    console.warn(
                        `[legend-state] No current route and no named route changed: ${JSON.stringify(routesData)}`,
                    );
                }
                if (url) {
                    url$.set(url);
                }
            }
        });

        syncedRoutes.set(routes, url$);
    }
    return syncedRoutes.get(routes)!;
}

export function createRoutesHook<T extends Record<string, any>>(
    routes: RoutesPatternType<T>,
): {
    <K extends keyof T>(
        key: K,
    ): {
        params$: Observable<RoutesData<T>['named'][K]>;
        url$: Observable<string>;
    };
    (): {
        routes$: Observable<RoutesData<T>>;
        url$: Observable<string>;
    };
} {
    const routesCreated = createRoutes(routes);

    return (key?: keyof T) => {
        if (key) {
            return {
                params$: (routesCreated.routes$ as any).named[key],
                url$: getUrlForRoutes$(routesCreated),
            };
        } else {
            return {
                routes$: routesCreated.routes$,
                url$: getUrlForRoutes$(routesCreated),
            } as any;
        }
    };
}

export function createRoutesHookNext<T extends Record<string, any>>(
    routes: RoutesPatternType<T>,
): {
    useRoutes: {
        <K extends keyof T>(key: K): Observable<RoutesData<T>['named'][K]>;
        (): Observable<RoutesData<T>>;
    };
    Link: (props: { to: PartialRecursive<RoutesData<T>['named']> | Partial<RoutesData<T>['params']> }) => ReactNode;
} {
    const useHook = createRoutesHook(routes);
    return {
        useRoutes: (key?: keyof T) => {
            const router = useRouter();
            const { url$, routes$, params$ } = useHook(key!) as {
                params$?: Observable<RoutesData<T>['named'][keyof T]>;
                routes$?: Observable<RoutesData<T>>;
                url$: Observable<string>;
            };
            url$.set(router.asPath);
            return key ? params$ : (routes$ as Observable<RoutesData<T>> as any);
        },
        Link: (props) => {
            const router = useRouter();
            router.push(props.to);

            return null;
        },
    };
}
