import { symbolActivator } from './globals';
import { ActivateParams2, ActivateParams2WithProxy, ActivatorFunction } from './observableInterfaces';

export function activator<T extends Record<string, K>, K>(params: ActivateParams2WithProxy<T>): ActivatorFunction<T>;
export function activator<T>(params: ActivateParams2<T>): ActivatorFunction<T>;
export function activator<T>(params: ActivateParams2<T>): ActivatorFunction<T> {
    return () => ({
        [symbolActivator]: params,
    });
}
