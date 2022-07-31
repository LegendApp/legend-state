import { useForceRender } from '@legendapp/tools/react';
import { useEffect, useRef } from 'react';
import { getObservableRawValue, symbolEqualityFn, symbolShallow } from '../globals';
import { EqualityFn, Observable2, ObservableChecker3, ObservableListener3 } from '../observableInterfaces';

interface SavedRef {
    listeners: ObservableListener3[];
    cmpValue?: any[];
}

// export function useObservable3<T extends Observable2>(obs: T, equalityFn?: (state: T) => any) {
//     const fr = useForceRender();
//     useEffect(() => {
//         let cb = fr as ListenerFn3<T>;
//         if (equalityFn) {
//             let prev = equalityFn(obs);
//             cb = (value: T) => {
//                 const cur = equalityFn(value);
//                 if (cur !== prev) {
//                     prev = cur;
//                     fr();
//                 }
//             };
//         }
//         let shallow = false;
//         if (obs[symbolShallow as any]) {
//             shallow = true;
//             obs = obs[symbolShallow as any];
//         }

//         // Listen to the observable and by `changeShallow` if the argument was shallow(...)
//         const listener = (shallow ? obs._.onChangeShallow : obs._.onChange)(cb);
//         return () => listener.dispose();
//     }, []);
//     return obs;
// }

/**
 * A React hook that listens to observables and returns their values.
 *
 * @param fn A function that returns a single observable, an array of observables, or a flat object of observables
 *
 * @see https://www.legendapp.com/dev/state/react/#useobservables
 */
export function useObservables3<T extends ObservableChecker3<T>[]>(...args: T): T {
    const forceRender = useForceRender();
    const ref = useRef<SavedRef>();
    if (!ref.current) {
        ref.current = {
            listeners: [],
        };
    }

    const saved = ref.current;
    const listeners = saved.listeners;
    for (let i = 0; i < args.length; i++) {
        let obs = args[i];
        if (obs) {
            // Listen if not already listening
            if (!listeners[i]) {
                // Check if this parameter is a shallow
                let shallow = false;
                if (obs[symbolShallow as any]) {
                    shallow = true;
                    obs = obs[symbolShallow as any];
                }
                // Check if this parameter is an equality function
                let comparator = undefined;
                if (obs[symbolEqualityFn as any]) {
                    const o = (obs as unknown as EqualityFn)[symbolEqualityFn];
                    obs = o.obs;
                    if (saved.cmpValue === undefined) {
                        saved.cmpValue = [];
                    }
                    saved.cmpValue[i] = o.fn(obs);
                    comparator = (value) => {
                        const cmpValue = o.fn(value);
                        if (cmpValue !== ref.current.cmpValue[i]) {
                            ref.current.cmpValue[i] = cmpValue;
                            forceRender();
                        }
                    };
                }
                // Listen to the observable and by `changeShallow` if the argument was shallow(...)
                const listener = (shallow ? (obs as Observable2)._.onChangeShallow : (obs as Observable2)._.onChange)(
                    comparator || forceRender
                );

                listeners[i] = listener;
            }
        } else if (listeners[i]) {
            // This parameter become undefined so dispose the old listener
            listeners[i].dispose();
            listeners[i] = undefined;
        }
    }

    // Dispose listeners on unmount
    useEffect(
        () => () => {
            if (ref.current.listeners) {
                ref.current.listeners.forEach((p) => p?.dispose());
                ref.current.listeners = [];
            }
        },
        []
    ); // eslint-disable-line react-hooks/exhaustive-deps

    // TODO Support single obs and object
    return args.map(getObservableRawValue) as T;
}
