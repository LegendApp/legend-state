import { symbolActivated } from './globals';
import { ActivateParams, ActivateParamsWithLookup, Activated } from './observableInterfaces';

export function activated<T>(params: ActivateParamsWithLookup<Record<string, T>>): Activated<Record<string, T>>;
export function activated<T>(params: ActivateParams<T>): Activated<T>;
export function activated<T>(params: ActivateParams<T>): Activated<T> {
    return (() => ({
        [symbolActivated]: params,
    })) as any;
}
