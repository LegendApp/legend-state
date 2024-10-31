(function routerzzz() {
    // Helper types for parsing options and defaults
    type ParseDefault<T extends string> = T extends `${infer Options}=${infer Default}`
        ? Default extends Options
            ? Default
            : never
        : never;

    type ParseOptions<T extends string> = T extends `${infer Options}=${infer Default}`
        ? Options extends `${infer U}|${infer V}`
            ? Split<Options, '|'>
            : Options
        : T extends `${infer U}|${infer V}`
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

    type ExtractPathParams<T extends string> = T extends `${infer Start}:${infer Param}(${infer Options})/${infer Rest}`
        ? {
              [K in Param]?: ParseOptions<Options>;
          } & {
              [K in Param as WithDefault<Options> extends never ? never : K]?: ParseOptions<Options>;
          } & ExtractPathParams<`/${Rest}`>
        : T extends `${infer Start}:${infer Param}/${infer Rest}`
          ? { [K in Param]: string } & ExtractPathParams<`/${Rest}`>
          : T extends `${infer Start}:${infer Param}(${infer Options})`
            ? {
                  [K in Param]?: ParseOptions<Options>;
              } & {
                  [K in Param as WithDefault<Options> extends never ? never : K]?: ParseOptions<Options>;
              }
            : T extends `${infer Start}:${infer Param}`
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

    type ExtractHashParams<T extends string> = T extends `${infer Param}(${infer Options})`
        ? {
              [K in Param]?: ParseOptions<Options>;
          } & {
              [K in Param as WithDefault<Options> extends never ? never : K]?: ParseOptions<Options>;
          }
        : T extends `${infer Param}`
          ? { [K in Param]: string }
          : {};

    // Function to create typed routes from pattern strings
    function createRoute<T extends string>(pattern: T) {
        // Parse pattern to extract defaults
        const defaults = new Map<string, string>();

        // Split pattern into components
        const [pathPart, ...rest] = pattern.split('?');
        const [queryPart = '', hashPart = ''] = rest.join('?').split('#');

        // Parse path parameter defaults
        pathPart.replace(/:[a-zA-Z]+\([^)]+\)/g, (match) => {
            const paramName = match.slice(1).split('(')[0];
            const defaultMatch = match.match(/\(([^)]+)\)/)?.[1]?.match(/([^|]+)=([^|]+)/);
            if (defaultMatch) {
                defaults.set(paramName, defaultMatch[2]);
            }
            return match;
        });

        // Parse query parameter defaults
        queryPart.split('&').forEach((param) => {
            const match = param.match(/([^(]+)\(([^)]+)\)/);
            if (match) {
                const [, paramName, options] = match;
                const defaultMatch = options.match(/([^|]+)=([^|]+)/);
                if (defaultMatch) {
                    defaults.set(paramName, defaultMatch[2]);
                }
            }
        });

        // Parse hash parameter defaults
        if (hashPart) {
            const match = hashPart.match(/([^(]+)\(([^)]+)\)/);
            if (match) {
                const [, paramName, options] = match;
                const defaultMatch = options.match(/([^|]+)=([^|]+)/);
                if (defaultMatch) {
                    defaults.set(paramName, defaultMatch[2]);
                }
            }
        }

        return (params: ExtractParams<T>) => {
            // Combine provided params with defaults
            const finalParams = { ...Object.fromEntries(defaults), ...params };

            // Build the path
            let url = pathPart.replace(/:[a-zA-Z]+(?:\([^)]+\))?/g, (match) => {
                const paramName = match.slice(1).split('(')[0];
                const paramValue = finalParams[paramName];

                const constraintsMatch = match.match(/\(([^)]+)\)/)?.[1];
                if (constraintsMatch) {
                    const options = constraintsMatch.split('|').map((opt) => opt.split('=')[0]);
                    if (!options.includes(paramValue as string)) {
                        throw new Error(`Invalid value for ${paramName}: ${paramValue}`);
                    }
                }

                return String(paramValue);
            });

            // Extract query and hash parameters from the pattern
            const queryParams = new Set(
                queryPart
                    .split('&')
                    .map((p) => p.split('(')[0])
                    .filter(Boolean),
            );
            const hashParams = new Set(
                hashPart
                    .split('&')
                    .map((p) => p.split('(')[0])
                    .filter(Boolean),
            );

            // Add query parameters
            const queryString = Object.entries(finalParams)
                .filter(([key]) => queryParams.has(key))
                .map(([key, value]) => `${key}=${value}`)
                .join('&');

            if (queryString) {
                url += `?${queryString}`;
            }

            // Add hash parameters
            const hashString = Object.entries(finalParams)
                .filter(([key]) => hashParams.has(key))
                .map(([key, value]) => `${key}=${value}`)
                .join('&');

            if (hashString) {
                url += `#${hashString}`;
            }

            return url;
        };
    }

    // Example usage:
    const routes = {
        // All parameter types with defaults
        // userProfile: createRoute(
        //     '/users/:userId/:mode(view|edit=view)?tab(info|settings=info)#section(main|details=main)',
        // ),

        // // Query parameters with defaults
        // search: createRoute('/search?q&sort(asc|desc=asc)&filter(all|active|archived=all)'),

        // // Mix of parameters
        // dashboard: createRoute('/dashboard/:view(grid|list=grid)?period(day|week|month=week)#panel(main|side=main)'),

        viewForm: createRoute(`/forms/view/:assignmentId`),
        editForm: createRoute(`/forms/edit/:formId#mode(m1|m2=m1)`),
    } as const;

    // Clean usage with flattened parameters
    const profile = routes.userProfile({
        userId: '123',
        // mode defaults to 'view'
        tab: 'settings',
        section: 'details',
    });
    // Result: '/users/123/view?tab=settings#section=details'

    const search = routes.search({
        q: 'test',
        // sort defaults to 'asc'
        filter: 'active',
    });
    // Result: '/search?q=test&sort=asc&filter=active'

    const dashboardView = routes.dashboard({
        view: 'list',
        // period defaults to 'week'
        panel: 'side',
    });
    // Result: '/dashboard/list?period=week#panel=side'
})();

const routes$ = useRoutes();
routes$.client.set({
    userId: '123',
    tab: 'settings',
    section: 'details',
});

routes$.set({
    root: 'client',
    userId: '123',
    tab: 'settings',
    section: 'details',
});

routes$.url.set('/client/123/view?tab=settings#section=details');

/*
If a component is rendered by two different routes like tools vs spaces then it wouldn't
make sense to get a route by name. Like setting data on the tools route would break spaces.
So need to go with just everything at root? But then it's really confusing how to use it if all
properties are in one object...

Is the ideal a combination where it's
{
    named: {
        client: {},
        search: {},
        dashboard: {}
    },
    params: {
        userId: string;
        tab: string;
        section: string;
        q: string;
        sort: string;
        filter: string;
        view: string;
        period: string;
        panel: string;
    }
}

*/
