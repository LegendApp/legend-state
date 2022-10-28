import { computeSelector, observe, Selector, symbolUndef, isPrimitive } from '@legendapp/state';
import { useReducer } from 'react';

const Update = (s: number) => s + 1;

export function useSelector<T>(
    selector: Selector<T>,
    options?: { forceRender?: () => void; shouldRender?: boolean | ((current: T, previous: T) => boolean) }
): T {
    let inRun = true;
    let ret: T = symbolUndef as unknown as T;
    const forceRender = options?.forceRender || useReducer(Update, 0)[1];
    const shouldRender = options?.shouldRender;

    observe(function update(e) {
        // If running, call selector and re-render if changed
        let cur = (inRun || shouldRender !== true) && computeSelector(selector);
        // Re-render if not currently rendering and value has changed
        if (
            !inRun &&
            (shouldRender === true || (shouldRender ? shouldRender(cur, ret) : cur !== ret || !isPrimitive(cur)))
        ) {
            forceRender();
            // Set cancel so that observe does not track
            e.cancel = true;
        }
        ret = cur;
        inRun = false;
    });

    // Note: This does not have a useEffect to cleanup listeners because it is ok
    // to call useReducer after unmounting. So it will lazily cleanup after unmount
    // because it will call fr() and return false to not track. Then since fr() does
    // not trigger re-render since it's unmounted, it does not set up tracking again.

    return ret;
}
