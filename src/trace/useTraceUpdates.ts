import { ListenerParams, internal } from '@legendapp/state';
const { tracking } = internal;

export function useTraceUpdates(name?: string) {
    if ((process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') && tracking.current) {
        tracking.current.traceUpdates = replaceUpdateFn.bind(undefined, name);
    }
}

function replaceUpdateFn(name: string | undefined, updateFn: Function) {
    return onChange.bind(undefined, name, updateFn);
}

function onChange(name: string | undefined, updateFn: Function, params: ListenerParams<any>) {
    const { changes } = params;
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
        changes.forEach(({ path, valueAtPath, prevAtPath }) => {
            console.log(`[legend-state] Rendering ${name ? name + ' ' : ''}because "${path}" changed:
from: ${JSON.stringify(prevAtPath)}
to: ${JSON.stringify(valueAtPath)}`);
        });
        return updateFn(params);
    }
}
