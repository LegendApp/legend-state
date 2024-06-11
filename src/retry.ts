import { isPromise } from './is';
import type { RetryOptions } from './observableInterfaces';

function calculateRetryDelay(retryOptions: RetryOptions, retryNum: number): number | null {
    const { backoff, delay = 1000, infinite, times = 3, maxDelay = 30000 } = retryOptions;
    if (infinite || retryNum < times) {
        const delayTime = Math.min(delay * (backoff === 'constant' ? 1 : 2 ** retryNum), maxDelay);
        return delayTime;
    }
    return null;
}

function createRetryTimeout(retryOptions: RetryOptions, retryNum: number, fn: () => void) {
    const delayTime = calculateRetryDelay(retryOptions, retryNum);
    if (delayTime) {
        return setTimeout(fn, delayTime);
    }
}

export function runWithRetry<T>(
    state: { retryNum: number; retry: RetryOptions | undefined },
    fn: (e: { retryNum: number; cancelRetry: () => void }) => T | Promise<T>,
): T | Promise<T> {
    const { retry } = state;
    const e = Object.assign(state, { cancel: false, cancelRetry: () => (e.cancel = false) });
    let value = fn(e);

    if (isPromise(value) && retry) {
        let timeoutRetry: any;
        return new Promise<any>((resolve) => {
            const run = () => {
                (value as Promise<any>)
                    .then((val: any) => {
                        resolve(val);
                    })
                    .catch(() => {
                        state.retryNum++;
                        if (timeoutRetry) {
                            clearTimeout(timeoutRetry);
                        }
                        if (!e.cancel) {
                            timeoutRetry = createRetryTimeout(retry, state.retryNum, () => {
                                value = fn(e);
                                run();
                            });
                        }
                    });
            };
            run();
        });
    }

    return value;
}
