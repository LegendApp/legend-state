import { internal } from '@legendapp/state';
import type { SyncedOptions } from './syncTypes';
import { synced } from './synced';

const { deepMerge } = internal;

const dangerousKeys = ['__proto__', 'constructor', 'prototype'];

function sanitizeOptions(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    const sanitized: any = Array.isArray(obj) ? [] : {};
    for (const key of Object.keys(obj)) {
        if (dangerousKeys.includes(key)) continue;
        sanitized[key] = sanitizeOptions(obj[key]);
    }
    return sanitized;
}

export function configureSynced<T extends (...args: any[]) => any>(fn: T, origOptions: Partial<Parameters<T>[0]>): T;
export function configureSynced(origOptions: SyncedOptions): typeof synced;
export function configureSynced<T extends (...args: any[]) => any>(
    fnOrOrigOptions: T,
    origOptions?: Partial<Parameters<T>[0]>,
) {
    const fn = origOptions ? (fnOrOrigOptions as T) : synced;
    origOptions = origOptions ?? fnOrOrigOptions;

    return (options: SyncedOptions) => {
        const merged = deepMerge(origOptions as any, sanitizeOptions(options));
        return fn(merged);
    };
}
