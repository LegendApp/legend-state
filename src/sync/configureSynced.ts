import { internal } from '@legendapp/state';
import type { SyncedOptions } from './syncTypes';

const { deepMerge } = internal;

export function configureSynced<T extends (...args: any[]) => any>(fn: T, origOptions: Parameters<T>[0]): T {
    return ((options: SyncedOptions) => {
        const merged = deepMerge(origOptions as any, options);
        return fn ? fn(merged) : merged;
    }) as any;
}
