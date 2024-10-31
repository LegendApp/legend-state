import {
    createRoutesHook,
    createRoutes,
    getUrlForRoutes$,
    parseUrlForRouteInfo,
    parseUrlToRoutes,
    routeInfoToUrl,
} from '../src/router';

const routePaths = {
    // All parameter types with defaults
    userProfile: [
        '/users/:userId/:mode?tab#section&order&other',
        {
            tab: 'info',
            section: 'main',
        } as {
            mode: 'view' | 'edit';
            tab: 'info' | 'settings';
            section: 'main' | 'details';
            order: 'asc' | 'desc';
        },
    ],
    // userProfileSmall: [
    //     '/users/:userId/view?tab',
    //     {
    //         tab: 'info',
    //     } as {
    //         tab: 'info' | 'settings';
    //     },
    // ],
    // userProfileSmallCreate: createRoute<{
    //     tab: 'info' | 'settings';
    // }>('/users/:userId/view?tab', {
    //     tab: 'info',
    // }),
    // userProfileSmallCreate2: createRoute('/users/:userId/view?tab', {
    //     tab: 'info',
    // }),
    // NOTES:
    // - I think I'm happy with this, at least for a first version. We don't really need options because
    // that should be handled by the router. Types are all we really need. And supporting type coercion
    // would be cool but is out of scope. We could expose ways to throw zod/valibot on top? Or do it for
    // a more complex version?
    // - Should support a version with no second element in the array to just make everything a string
    // with no defaults?
    // - Is making this an array silly? Should it just be createRoute so it could have a generic type?
    // I don't think I love that...

    // userProfile2: [
    //     '/users/:userId/:mode?tab#section&order&other',
    //     {
    //         mode: ['view', 'edit'],
    //         tab: ['info', 'settings'],
    //         section: ['main', 'details'],
    //         order: ['asc', 'desc'],
    //         other: 0,
    //     },
    //     {
    //         tab: 'info',
    //         section: 'main',
    //     },
    // ],
    // userProfile3: {
    //     pattern: '/users/:userId/:mode?tab#section&order&other',
    //     options: {
    //         mode: ['view', 'edit'],
    //         tab: ['info', 'settings'],
    //         section: ['main', 'details'],
    //         order: ['asc', 'desc'],
    //         other: RouteOptions.number,
    //     },
    //     defaults: {
    //         tab: 'info',
    //         section: 'main',
    //     },
    // },
    // userProfileSmall: {
    //     pattern: '/users/:userId/view?tab',
    //     options: {
    //         tab: ['info', 'settings'],
    //     },
    //     defaults: {
    //         tab: 'info',
    //     },
    // },
    // userProfileSmall2: {
    //     pattern: '/users/:userId/view?tab',
    //     tab: ['info', 'settings'],
    //     tabDefault: 'info',
    // },
    // userProfileSmall3: {
    //     pattern: '/users/:userId/view?tab',
    //     tab: {
    //         options: ['info', 'settings'],
    //         default: 'info',
    //     },
    // },
    // userProfileSmallAlt: {
    //     pattern: '/users/:userId/view',
    //     query: {
    //         tab: {
    //             options: ['info', 'settings'],
    //             default: 'info',
    //         },
    //     },
    // },
    // userProfileStr:
    //     '/users/:userId/:mode(view|edit)?tab(info|settings=info)#section(main|details=main)&order(asc|desc)&other',
    // Query parameters with defaults
    search: [
        '/search?q&sort&filter',
        {
            sort: 'asc',
            filter: 'all',
        } as {
            sort: 'asc' | 'desc';
            filter: 'all' | 'active' | 'archived';
        },
    ],
    // Mix of parameters
    dashboard: [
        '/dashboard/:view?period#panel',
        {
            period: 'week',
            panel: 'main',
        } as {
            view: 'grid' | 'list';
            period: 'day' | 'week' | 'month';
            panel: 'main' | 'side';
        },
    ],
    queryTester: [
        '/queryTester?q&sort&filter&orderz&otherz',
        {
            sort: 'asc' as 'asc' | 'desc',
            filter: 'all' as 'all' | 'active' | 'archived',
        },
    ],
    // Bravely tests
    viewForm: ['/forms/view/:assignmentId', {}],
    editForm: [
        '/forms/edit/:formId#mode',
        {
            mode: 'm1' as 'm1' | 'm2',
        },
    ],
    messages: [
        '/messages/:groupId/:messageMode?messageTab',
        {
            messageMode: 'view',
            messageTab: 'info',
        } as {
            groupId: string;
            messageMode: 'view' | 'edit';
            messageTab: 'info' | 'settings';
        },
    ],
} as const;

describe('router', () => {
    test('Creates route info correctly', () => {
        const { routes$, routeInfos } = createRoutes(routePaths);

        const value = routes$.get();

        expect(value.params).toStrictEqual({
            assignmentId: undefined,
            filter: undefined,
            formId: undefined,
            mode: undefined,
            order: undefined,
            orderz: undefined,
            other: undefined,
            otherz: undefined,
            panel: undefined,
            period: undefined,
            q: undefined,
            section: undefined,
            sort: undefined,
            tab: undefined,
            userId: undefined,
            view: undefined,
            groupId: undefined,
            messageMode: undefined,
            messageTab: undefined,
        });

        expect(routeInfos.userProfile).toStrictEqual({
            allParams: ['userId', 'mode', 'tab', 'section', 'order', 'other'],
            defaults: new Map([
                ['tab', 'info'],
                ['section', 'main'],
            ]),
            hashParams: ['section', 'order', 'other'],
            pathParams: ['userId', 'mode'],
            pattern: '/users/:userId/:mode?tab#section&order&other',
            queryParams: ['tab'],
            pathPattern: '/users/:userId/:mode',
            queryPattern: 'tab',
            hashPattern: 'section&order&other',
        });

        expect(value.named.userProfile).toStrictEqual({
            userId: undefined,
            mode: undefined,
            section: undefined,
            tab: undefined,
            order: undefined,
            other: undefined,
        });

        expect(routeInfos.search).toStrictEqual({
            allParams: ['q', 'sort', 'filter'],
            defaults: new Map([
                ['sort', 'asc'],
                ['filter', 'all'],
            ]),
            hashParams: [],
            pathParams: [],
            pattern: '/search?q&sort&filter',
            queryParams: ['q', 'sort', 'filter'],
            pathPattern: '/search',
            queryPattern: 'q&sort&filter',
            hashPattern: '',
        });

        expect(value.named.search).toStrictEqual({
            q: undefined,
            sort: undefined,
            filter: undefined,
        });

        expect(routeInfos.dashboard).toStrictEqual({
            allParams: ['view', 'period', 'panel'],
            defaults: new Map([
                ['period', 'week'],
                ['panel', 'main'],
            ]),
            hashParams: ['panel'],
            pathParams: ['view'],
            pattern: '/dashboard/:view?period#panel',
            queryParams: ['period'],
            pathPattern: '/dashboard/:view',
            queryPattern: 'period',
            hashPattern: 'panel',
        });

        expect(value.named.dashboard).toStrictEqual({
            view: undefined,
            period: undefined,
            panel: undefined,
        });

        expect(routeInfos.queryTester).toStrictEqual({
            allParams: ['q', 'sort', 'filter', 'orderz', 'otherz'],
            defaults: new Map([
                ['sort', 'asc'],
                ['filter', 'all'],
            ]),
            hashParams: [],
            pathParams: [],
            pattern: '/queryTester?q&sort&filter&orderz&otherz',
            queryParams: ['q', 'sort', 'filter', 'orderz', 'otherz'],
            pathPattern: '/queryTester',
            queryPattern: 'q&sort&filter&orderz&otherz',
            hashPattern: '',
        });

        expect(value.named.queryTester).toStrictEqual({
            q: undefined,
            sort: undefined,
            filter: undefined,
            orderz: undefined,
            otherz: undefined,
        });

        expect(routeInfos.viewForm).toStrictEqual({
            allParams: ['assignmentId'],
            defaults: new Map([]),
            hashParams: [],
            pathParams: ['assignmentId'],
            pattern: '/forms/view/:assignmentId',
            queryParams: [],
            pathPattern: '/forms/view/:assignmentId',
            queryPattern: '',
            hashPattern: '',
        });

        expect(value.named.viewForm).toStrictEqual({
            assignmentId: undefined,
        });

        expect(routeInfos.editForm).toStrictEqual({
            allParams: ['formId', 'mode'],
            defaults: new Map([['mode', 'm1']]),
            hashParams: ['mode'],
            pathParams: ['formId'],
            pattern: '/forms/edit/:formId#mode',
            queryParams: [],
            pathPattern: '/forms/edit/:formId',
            queryPattern: '',
            hashPattern: 'mode',
        });

        expect(value.named.editForm).toStrictEqual({
            formId: undefined,
            mode: undefined,
        });

        expect(routeInfos.messages).toStrictEqual({
            allParams: ['groupId', 'messageMode', 'messageTab'],
            defaults: new Map([
                ['messageMode', 'view'],
                ['messageTab', 'info'],
            ]),
            hashParams: [],
            pathParams: ['groupId', 'messageMode'],
            pattern: '/messages/:groupId/:messageMode?messageTab',
            queryParams: ['messageTab'],
            pathPattern: '/messages/:groupId/:messageMode',
            queryPattern: 'messageTab',
            hashPattern: '',
        });
    });
    test('parseUrlForRouteInfo', () => {
        const { routeInfos } = createRoutes(routePaths);

        // userProfile
        expect(parseUrlForRouteInfo('/users/123/view?tab=info#section=main', routeInfos.userProfile)).toStrictEqual({
            userId: '123',
            mode: 'view',
            section: 'main',
            tab: 'info',
        });
        expect(
            parseUrlForRouteInfo('/users/123/edit?tab=settings#section=details', routeInfos.userProfile),
        ).toStrictEqual({
            userId: '123',
            mode: 'edit',
            section: 'details',
            tab: 'settings',
        });
        // Incorrect parameter does not fail
        expect(
            parseUrlForRouteInfo('/users/123/iew?tab=settings#section=details', routeInfos.userProfile),
        ).toStrictEqual({ mode: 'iew', section: 'details', tab: 'settings', userId: '123' });
        expect(
            parseUrlForRouteInfo('/users/123/edit?tab=INCORRECT#section=details', routeInfos.userProfile),
        ).toStrictEqual({
            userId: '123',
            mode: 'edit',
            section: 'details',
            tab: 'INCORRECT',
        });
        expect(
            parseUrlForRouteInfo('/users/123/edit?tab=settings#section=INCORRECT', routeInfos.userProfile),
        ).toStrictEqual({
            userId: '123',
            mode: 'edit',
            section: 'INCORRECT',
            tab: 'settings',
        });
        // Takes default for query parameter if not provided
        expect(parseUrlForRouteInfo('/users/123/view#section=details', routeInfos.userProfile)).toStrictEqual({
            mode: 'view',
            section: 'details',
            tab: 'info',
            userId: '123',
        });
        // Takes default for hash parameter if not provided
        expect(parseUrlForRouteInfo('/users/123/view', routeInfos.userProfile)).toStrictEqual({
            mode: 'view',
            section: 'main',
            tab: 'info',
            userId: '123',
        });

        // search
        expect(parseUrlForRouteInfo('/search?q=test&sort=asc&filter=all', routeInfos.search)).toStrictEqual({
            q: 'test',
            sort: 'asc',
            filter: 'all',
        });

        // dashboard
        expect(parseUrlForRouteInfo('/dashboard/grid?period=day#panel=main', routeInfos.dashboard)).toStrictEqual({
            view: 'grid',
            period: 'day',
            panel: 'main',
        });
        expect(parseUrlForRouteInfo('/dashboard/list?period=week#panel=side', routeInfos.dashboard)).toStrictEqual({
            view: 'list',
            period: 'week',
            panel: 'side',
        });
        // Invalid view
        expect(parseUrlForRouteInfo('/dashboard?period=day#panel=main', routeInfos.dashboard)).toStrictEqual(undefined);

        // viewForm
        expect(parseUrlForRouteInfo('/forms/view/123', routeInfos.viewForm)).toStrictEqual({
            assignmentId: '123',
        });

        // editForm
        expect(parseUrlForRouteInfo('/forms/edit/123#mode=m2', routeInfos.editForm)).toStrictEqual({
            formId: '123',
            mode: 'm2',
        });

        // Invalid paths
        expect(parseUrlForRouteInfo('/z/edit/123#mode=m2', routeInfos.editForm)).toStrictEqual(undefined);
        expect(parseUrlForRouteInfo('/forms/edit/123#mode=m2', routeInfos.viewForm)).toStrictEqual(undefined);
        expect(parseUrlForRouteInfo('/forms/edit/123/qwe#mode=m2', routeInfos.editForm)).toStrictEqual(undefined);
    });

    test('routeInfoToUrl', () => {
        const { routeInfos } = createRoutes(routePaths);

        // userProfile
        expect(
            routeInfoToUrl(routeInfos.userProfile, {
                userId: '123',
                mode: 'view',
                section: 'main',
                tab: 'info',
            }),
        ).toStrictEqual('/users/123/view?tab=info#section=main');

        expect(
            routeInfoToUrl(routeInfos.userProfile, {
                userId: '123',
                mode: 'edit',
                section: 'details',
                tab: 'settings',
            }),
        ).toStrictEqual('/users/123/edit?tab=settings#section=details');

        // Incorrect parameters are included as-is
        expect(
            routeInfoToUrl(routeInfos.userProfile, {
                userId: '123',
                mode: 'edit',
                section: 'details',
                tab: 'INCORRECT',
            }),
        ).toStrictEqual('/users/123/edit?tab=INCORRECT#section=details');

        expect(
            routeInfoToUrl(routeInfos.userProfile, {
                userId: '123',
                mode: 'edit',
                section: 'INCORRECT',
                tab: 'settings',
            }),
        ).toStrictEqual('/users/123/edit?tab=settings#section=INCORRECT');

        // Default values are not included in the URL
        expect(
            routeInfoToUrl(routeInfos.userProfile, {
                userId: '123',
                mode: 'view',
                section: 'details',
            }),
        ).toStrictEqual('/users/123/view#section=details');
        expect(
            routeInfoToUrl(routeInfos.userProfile, {
                userId: '123',
                mode: 'view',
                tab: 'settings',
                section: 'details',
            }),
        ).toStrictEqual('/users/123/view?tab=settings#section=details');

        expect(
            routeInfoToUrl(routeInfos.userProfile, {
                userId: '123',
                mode: 'view',
            }),
        ).toStrictEqual('/users/123/view');

        // search
        expect(
            routeInfoToUrl(routeInfos.search, {
                q: 'test',
                sort: 'asc',
                filter: 'all',
            }),
        ).toStrictEqual('/search?q=test&sort=asc&filter=all');

        // dashboard
        expect(
            routeInfoToUrl(routeInfos.dashboard, {
                view: 'grid',
                period: 'day',
                panel: 'main',
            }),
        ).toStrictEqual('/dashboard/grid?period=day#panel=main');

        expect(
            routeInfoToUrl(routeInfos.dashboard, {
                view: 'list',
                period: 'week',
                panel: 'side',
            }),
        ).toStrictEqual('/dashboard/list?period=week#panel=side');

        // viewForm
        expect(
            routeInfoToUrl(routeInfos.viewForm, {
                assignmentId: '123',
            }),
        ).toStrictEqual('/forms/view/123');

        // editForm
        expect(
            routeInfoToUrl(routeInfos.editForm, {
                formId: '123',
                mode: 'm2',
            }),
        ).toStrictEqual('/forms/edit/123#mode=m2');
    });

    test('parseUrlToRoutes', () => {
        const routes = createRoutes(routePaths);

        expect(parseUrlToRoutes(routes, '/users/123/view?tab=info#section=main')).toStrictEqual({
            named: { userProfile: { userId: '123', mode: 'view', section: 'main', tab: 'info' } },
            params: { userId: '123', mode: 'view', section: 'main', tab: 'info' },
        });

        expect(parseUrlToRoutes(routes, '/search?q=test&sort=asc&filter=all')).toStrictEqual({
            named: { search: { q: 'test', sort: 'asc', filter: 'all' } },
            params: { q: 'test', sort: 'asc', filter: 'all' },
        });

        expect(parseUrlToRoutes(routes, '/dashboard/grid?period=day#panel=main')).toStrictEqual({
            named: { dashboard: { view: 'grid', period: 'day', panel: 'main' } },
            params: { view: 'grid', period: 'day', panel: 'main' },
        });

        expect(parseUrlToRoutes(routes, '/forms/view/123')).toStrictEqual({
            named: { viewForm: { assignmentId: '123' } },
            params: { assignmentId: '123' },
        });

        expect(parseUrlToRoutes(routes, '/forms/edit/123#mode=m2')).toStrictEqual({
            named: { editForm: { formId: '123', mode: 'm2' } },
            params: { formId: '123', mode: 'm2' },
        });

        // Invalid paths
        expect(parseUrlToRoutes(routes, '/z/edit/123#mode=m2')).toStrictEqual({ named: {}, params: {} });
        expect(parseUrlToRoutes(routes, '/forms/edit/123/qwe#mode=m2')).toStrictEqual({ named: {}, params: {} });
    });

    test('getUrlForRoutes$', () => {
        const routes = createRoutes(routePaths);
        const url$ = getUrlForRoutes$(routes);
        const { routes$ } = routes;

        // Setting url updates the routes data
        url$.set('/users/123/view?tab=info#section=main');
        expect(routes$.get()).toStrictEqual({
            currentRoute: 'userProfile',
            named: { userProfile: { userId: '123', mode: 'view', section: 'main', tab: 'info' } },
            params: { userId: '123', mode: 'view', section: 'main', tab: 'info' },
        });

        // Setting a named param updates the url
        routes$.named.userProfile.userId.set('124');
        expect(url$.get()).toStrictEqual('/users/124/view?tab=info#section=main');
        expect(routes$.currentRoute.get()).toEqual('userProfile');

        // Setting a named route updates the url
        routes$.named.viewForm.set({
            assignmentId: '125',
        });
        expect(url$.get()).toStrictEqual('/forms/view/125');
        // It should also update the full routes data
        expect(routes$.get()).toStrictEqual({
            currentRoute: 'viewForm',
            named: { viewForm: { assignmentId: '125' } },
            params: { assignmentId: '125' },
        });

        // Setting a param updates the url in the current route
        routes$.params.assignmentId.set('126');
        expect(url$.get()).toStrictEqual('/forms/view/126');
        expect(routes$.get()).toStrictEqual({
            currentRoute: 'viewForm',
            named: { viewForm: { assignmentId: '126' } },
            params: { assignmentId: '126' },
        });

        // Setting a param in a different route does not update the url
        routes$.params.userId.set('127');
        expect(url$.get()).toStrictEqual('/forms/view/126');
        expect(routes$.get()).toStrictEqual({
            currentRoute: 'viewForm',
            named: { viewForm: { assignmentId: '126' } },
            params: { assignmentId: '126', userId: '127' },
        });
    });

    test('createRouterHook with no params', () => {
        const useRoutes = createRoutesHook(routePaths);
        const { routes$, url$ } = useRoutes();

        // Setting url updates the routes data
        url$.set('/users/123/view?tab=info#section=main');
        expect(routes$.get()).toStrictEqual({
            currentRoute: 'userProfile',
            named: { userProfile: { userId: '123', mode: 'view', section: 'main', tab: 'info' } },
            params: { userId: '123', mode: 'view', section: 'main', tab: 'info' },
        });
    });

    test('createRouterHook with params', () => {
        const useRoutes = createRoutesHook(routePaths);
        const { params$, url$ } = useRoutes('userProfile');

        // Setting url updates the routes data
        url$.set('/users/123/view?tab=info#section=main');
        expect(params$.get()).toStrictEqual({
            userId: '123',
            mode: 'view',
            section: 'main',
            tab: 'info',
        });
    });
});
