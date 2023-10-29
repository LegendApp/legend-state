import type { RetryOptions } from './observableInterfaces';

export function setupRetry(retryOptions: RetryOptions, refresh: () => void) {
    let attemptNum = 0;
    const timeout: { current?: any } = {};
    let didGiveUp = false;
    const { backoff, delay = 1000, infinite, times = 3, maxDelay = 30000 } = retryOptions;
    let handleError: () => void;
    if (infinite || attemptNum++ < times) {
        const delayTime = Math.min(delay * (backoff === 'constant' ? 1 : 2 ** attemptNum), maxDelay);
        handleError = () => {
            timeout.current = setTimeout(refresh, delayTime);
        };
    } else {
        handleError = () => {
            didGiveUp = true;
        };
    }
    if (typeof window !== 'undefined') {
        window.addEventListener('online', () => {
            if (didGiveUp || timeout) {
                if (timeout) {
                    clearTimeout(timeout.current);
                    timeout.current = undefined;
                }
                didGiveUp = false;
                refresh();
            }
        });
    }

    return { handleError, timeout };
}
