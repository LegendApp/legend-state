import { whenReady } from './when';
import type { NodeValue, RetryOptions } from './observableInterfaces';
import { isPromise } from './is';

function calculateRetryDelay(retryOptions: RetryOptions, attemptNum: number): number | null {
    const { backoff, delay = 1000, infinite, times = 3, maxDelay = 30000 } = retryOptions;
    if (infinite || attemptNum < times) {
        const delayTime = Math.min(delay * (backoff === 'constant' ? 1 : 2 ** attemptNum), maxDelay);
        return delayTime;
    }
    return null;
}

function createRetryTimout(retryOptions: RetryOptions, attemptNum: number, fn: () => void) {
    const delayTime = calculateRetryDelay(retryOptions, attemptNum);
    if (delayTime) {
        return setTimeout(fn, delayTime);
    }
}

export function runWithRetry<T>(
    node: NodeValue,
    state: { attemptNum: number },
    fn: (e: { cancel?: boolean }) => T | Promise<T>,
): T | Promise<T> {
    const { retry, waitFor } = node.activationState!;

    const e = { cancel: false };
    let value: any = undefined;
    if (waitFor) {
        value = whenReady(waitFor, () => {
            node.activationState!.waitFor = undefined;
            return fn(e);
        });
    } else {
        value = fn(e);
    }

    if (isPromise(value) && retry) {
        let timeoutRetry: any;
        return new Promise<any>((resolve) => {
            const run = () => {
                value
                    .then((val: any) => {
                        node.activationState!.persistedRetry = false;
                        resolve(val);
                    })
                    .catch(() => {
                        node.activationState!.persistedRetry = true;
                        state.attemptNum++;
                        if (timeoutRetry) {
                            clearTimeout(timeoutRetry);
                        }
                        if (!e.cancel) {
                            timeoutRetry = createRetryTimout(retry, state.attemptNum, () => {
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
