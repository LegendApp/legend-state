import { ListenerParams, tracking } from '@legendapp/state';

export function useTraceUpdates(name?: string) {
    if (process.env.NODE_ENV === 'development' && tracking.current) {
        tracking.current.traceUpdates = replaceUpdateFn.bind(undefined, name);
    }
}

// eslint-disable-next-line @typescript-eslint/ban-types
function replaceUpdateFn(name: string | undefined, updateFn: Function) {
    return onChange.bind(undefined, name, updateFn);
}

// eslint-disable-next-line @typescript-eslint/ban-types
function onChange(name: string | undefined, updateFn: Function, params: ListenerParams<any>) {
    const { changes } = params;
    if (process.env.NODE_ENV === 'development') {
        changes.forEach(({ path, valueAtPath, prevAtPath }) => {
            console.log(`[legend-state] Rendering ${name ? name + ' ' : ''}because "${path}" changed:
from: ${JSON.stringify(prevAtPath)}
to: ${JSON.stringify(valueAtPath)}`);
        });
        return updateFn();
    }
}
