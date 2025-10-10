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
            let timeoutRetry: number | undefined;
            if (mapRetryTimeouts.has(retryId)) {
                clearTimeout(mapRetryTimeouts.get(retryId));
                mapRetryTimeouts.delete(retryId);
            }
            const clearRetryState = () => {
                if (timeoutRetry !== undefined) {
                    clearTimeout(timeoutRetry);
                    timeoutRetry = undefined;
                }
                mapRetryTimeouts.delete(retryId);
            };
            return new Promise<any>((resolve, reject) => {
                const run = () => {
                    (value as Promise<any>)
                        .then((val: any) => {
                            state.retryNum = 0;
                            clearRetryState();
                            resolve(val);
                        })
                        .catch((error: Error) => {
                            if (timeoutRetry !== undefined) {
                                clearTimeout(timeoutRetry);
                                timeoutRetry = undefined;
                            }
                            state.retryNum++;
                            if (state.cancelRetry) {
                                clearRetryState();
                                reject(error);
                                return;
                            }
                            const timeout = createRetryTimeout(retryOptions, state.retryNum, () => {
                                value = fn(state);
                                run();
                            });

                            if (timeout === false) {
                                state.cancelRetry = true;
                                clearRetryState();
                                reject(error);
                            } else {
                                timeoutRetry = timeout;
                                mapRetryTimeouts.set(retryId, timeout);
                            }
                        });
                };
                run();
            });
        }

        return value;
    } catch (error) {
        mapRetryTimeouts.delete(retryId);
        return Promise.reject(error);
    }
}
