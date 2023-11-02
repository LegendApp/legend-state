import { symbolActivator } from './globals';
import { ActivateParams2, ActivateParams2WithLookup } from './observableInterfaces';

export function activator<T extends Record<string, K>, K>(params: ActivateParams2WithLookup<T>): T;
export function activator<T>(params: ActivateParams2<T>): T;
export function activator<T>(params: ActivateParams2<T>): T {
    return (() => ({
        [symbolActivator]: params,
    })) as unknown as T;
}
