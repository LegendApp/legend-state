import { isPromise } from '../is';
import type { NodeInfo, RetryOptions } from '../observableInterfaces';
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

const mapRetryTimeouts = new Map<NodeInfo, number>();

export function runWithRetry<T>(
    state: SyncedGetSetBaseParams<any>,
    retryOptions: RetryOptions | undefined,
    fn: (params: OnErrorRetryParams) => T | Promise<T>,
    onError: (error: Error) => void,
): T | Promise<T> {
    let value = fn(state);

    if (isPromise(value) && retryOptions) {
        let timeoutRetry: number;
        if (mapRetryTimeouts.has(state.node)) {
            clearTimeout(mapRetryTimeouts.get(state.node));
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
                        if (onError) {
                            onError(error);
                        }
                        if (!state.cancelRetry) {
                            const timeout = createRetryTimeout(retryOptions, state.retryNum, () => {
                                value = fn(state);
                                run();
                            });

                            if (timeout === false) {
                                state.cancelRetry = true;
                                reject();
                            } else {
                                mapRetryTimeouts.set(state.node, timeout);
                                timeoutRetry = timeout;
                            }
                        }
                    });
            };
            run();
        });
    }

    return value;
}
