import { internal } from '@legendapp/state';
import type { SyncedOptions } from './syncTypes';

const { deepMerge } = internal;

type RecursivePartial<T> = {
    [K in keyof T]?: T extends object ? RecursivePartial<T[K]> : T[K];
};

export function configureSynced<T extends (...args: any[]) => any>(
    fn: T,
    origOptions: RecursivePartial<Parameters<T>[0]>,
): T {
    return ((options: SyncedOptions) => {
        const merged = deepMerge(origOptions as any, options);
        return fn ? fn(merged) : merged;
    }) as any;
}
