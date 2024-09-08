import { internal } from '@legendapp/state';
import type { SyncedOptions } from './syncTypes';
import { synced } from './synced';

const { deepMerge } = internal;

export function configureSynced<T extends (...args: any[]) => any>(fn: T, origOptions: Partial<Parameters<T>[0]>): T;
export function configureSynced(origOptions: SyncedOptions): typeof synced;
export function configureSynced<T extends (...args: any[]) => any>(
    fnOrOrigOptions: T,
    origOptions?: Partial<Parameters<T>[0]>,
) {
    const fn = origOptions ? (fnOrOrigOptions as T) : synced;
    origOptions = origOptions ?? fnOrOrigOptions;

    return (options: SyncedOptions) => {
        const merged = deepMerge(origOptions as any, options);
        return fn(merged);
    };
}
