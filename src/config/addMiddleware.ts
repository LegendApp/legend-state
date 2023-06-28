import { configureLegendState, ListenerFn } from '@legendapp/state';

export function addMiddleware(middleware: ListenerFn) {
    configureLegendState({
        middleware,
    });
}
