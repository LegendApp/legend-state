import { observe, symbolUndef, Selector, computeSelector } from '@legendapp/state';
import { useReducer } from 'react';

const Update = (s) => s + 1;

export function useSelector<T>(selector: Selector<T>): T {
    let inRun = true;
    let ret: T = symbolUndef as unknown as T;
    const fr = useReducer(Update, 0)[1];

    observe(function update() {
        // If running, call selector and re-render if changed
        let cur = computeSelector(selector);
        // Re-render if not currently rendering and value has changed
        if (!inRun && cur !== ret) {
            fr();
            // Return false so that observe does not track
            return false;
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
