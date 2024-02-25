import { symbolActivated } from './globals';
import { Activated, ActivatedLookupParams, ActivatedParams } from './observableInterfaces';

export function activated<T>(params: ActivatedLookupParams<Record<string, T>>): Activated<Record<string, T>>;
export function activated<T>(params: ActivatedParams<T>): Activated<T>;
export function activated<T>(params: ActivatedParams<T>): Activated<T> {
    return (() => ({
        [symbolActivated]: params,
    })) as any;
}
