import type { RetryOptions } from '@legendapp/state';
import { isPromise } from '../is';
import type { OnErrorRetryParams, SyncedGetSetBaseParams } from './syncTypes';

function calculateRetryDelay(retryOptions: RetryOptions, retryNum: number): number | null {
    const { backoff, delay = 1000, infinite, times = 3, maxDelay = 30000 } = retryOptions;
    if (infinite || retryNum < times) {
        const delayTime = Math.min(delay * (backoff === 'constant' ? 1 : 2 ** retryNum), maxDelay);
        return delayTime;
    }
    return null;
}

function createRetryTimeout(retryOptions: RetryOptions, retryNum: number, fn: () => void): number | false {
    const delayTime = calculateRetryDelay(retryOptions, retryNum);
    if (delayTime) {
        return setTimeout(fn, delayTime) as unknown as number;
    } else {
        return false;
    }
}

const mapRetryTimeouts = new Map<any, number>();

export function runWithRetry<T>(
    state: SyncedGetSetBaseParams<any>,
    retryOptions: RetryOptions | undefined,
    retryId: any,
    fn: (params: OnErrorRetryParams) => Promise<T>,
): Promise<T>;
export function runWithRetry<T>(
    state: SyncedGetSetBaseParams<any>,
    retryOptions: RetryOptions | undefined,
    retryId: any,
    fn: (params: OnErrorRetryParams) => T,
): T;
export function runWithRetry<T>(
    state: SyncedGetSetBaseParams<any>,
    retryOptions: RetryOptions | undefined,
    retryId: any,
    fn: (params: OnErrorRetryParams) => T | Promise<T>,
): T | Promise<T> {
    try {
        let value = fn(state);

        if (isPromise(value) && retryOptions) {
            let timeoutRetry: number;
            if (mapRetryTimeouts.has(retryId)) {
                clearTimeout(mapRetryTimeouts.get(retryId));
            }
            return new Promise<any>((resolve, reject) => {
                const run = () => {
                    (value as Promise<any>)
                        .then((val: any) => {
                            resolve(val);
                        })
                        .catch((error: Error) => {
                            state.retryNum++;
                            if (timeoutRetry) {
                                clearTimeout(timeoutRetry);
                            }
                            if (!state.cancelRetry) {
                                const timeout = createRetryTimeout(retryOptions, state.retryNum, () => {
                                    value = fn(state);
                                    run();
                                });

                                if (timeout === false) {
                                    state.cancelRetry = true;
                                    reject(error);
                                } else {
                                    mapRetryTimeouts.set(retryId, timeout);
                                    timeoutRetry = timeout;
                                }
                            }
                        });
                };
                run();
            });
        }

        return value;
    } catch (error) {
        return Promise.reject(error);
    }
}
