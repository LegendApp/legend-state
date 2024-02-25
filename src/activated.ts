import { symbolActivated } from './globals';
import { Activated, ActivatedParams } from './observableInterfaces';

export function activated<T>(params: ActivatedParams<T>): Activated<T> {
    return (() => ({
        [symbolActivated]: params,
    })) as any;
}
