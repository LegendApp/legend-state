import type { RetryOptions } from './observableInterfaces';

export function setupRetry(retryOptions: RetryOptions, refresh: () => void, attemptNum: { current: number }) {
    const timeout: { current?: any } = {};
    // let didGiveUp = false;
    const { backoff, delay = 1000, infinite, times = 3, maxDelay = 30000 } = retryOptions;
    let handleError: () => void;
    attemptNum.current++;
    if (infinite || attemptNum.current < times) {
        const delayTime = Math.min(delay * (backoff === 'constant' ? 1 : 2 ** attemptNum.current), maxDelay);
        handleError = () => {
            timeout.current = setTimeout(refresh, delayTime);
        };
    } else {
        handleError = () => {
            // didGiveUp = true;
        };
    }
    // TODO: Make an easy way to opt into this if
    // if (typeof window !== 'undefined') {
    //     window.addEventListener('online', () => {
    //         if (didGiveUp || timeout) {
    //             if (timeout) {
    //                 clearTimeout(timeout.current);
    //                 timeout.current = undefined;
    //             }
    //             // Restart the backoff when coming back online
    //             attemptNum.current = 0;
    //             didGiveUp = false;
    //             refresh();
    //         }
    //     });
    // }

    return { handleError, timeout };
}
