import { symbolActivated } from './globals';
import { ActivateParams2, ActivateParams2WithLookup } from './observableInterfaces';

export function activated<T>(params: ActivateParams2WithLookup<Record<string, T>>): Record<string, T>;
export function activated<T>(params: ActivateParams2<T>): T;
export function activated<T>(params: ActivateParams2<T>): T {
    return (() => ({
        [symbolActivated]: params,
    })) as any;
}
