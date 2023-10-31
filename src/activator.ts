import { ActivateParams2, ActivateParams2WithProxy, Activator } from './observableInterfaces';
import { symbolActivator } from './globals';

export function activator<T extends Record<string, K>, K>(params: ActivateParams2WithProxy<T>): () => Activator<T>;
export function activator<T>(params: ActivateParams2<T>): () => Activator<T>;
export function activator<T>(params: ActivateParams2<T>): () => Activator<T> {
    return () => ({
        [symbolActivator]: params,
    });
}
