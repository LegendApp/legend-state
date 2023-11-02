import { symbolActivator } from './globals';
import { ActivateParams2, ActivateParams2WithLookup } from './observableInterfaces';

export function activator<T>(params: ActivateParams2WithLookup<Record<string, T>>): Record<string, T>;
export function activator<T>(params: ActivateParams2<T>): T;
export function activator<T>(params: ActivateParams2<T>): T {
    return (() => ({
        [symbolActivator]: params,
    })) as any;
}
