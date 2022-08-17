import { ObservableListenerDispose } from '@legendapp/state';
import { ComponentProps, FC, forwardRef, memo, useEffect, useRef } from 'react';
import { listenWhileCalling } from './listenWhileCalling';
import { useForceRender } from './useForceRender';

const hasSymbol = typeof Symbol === 'function' && Symbol.for;

// Extracting the forwardRef inspired by https://github.com/mobxjs/mobx/blob/main/packages/mobx-react-lite/src/observer.ts
const ReactForwardRefSymbol = hasSymbol
    ? Symbol.for('react.forward_ref')
    : typeof forwardRef === 'function' && forwardRef((props: any) => null)['$$typeof'];

export function observer<T extends FC<any>>(
    component: T,
    propsAreEqual?: (prevProps: Readonly<ComponentProps<T>>, nextProps: Readonly<ComponentProps<T>>) => boolean
): T {
    // Unwrap forwardRef on the component
    let useForwardRef: boolean;
    if (ReactForwardRefSymbol && component['$$typeof'] === ReactForwardRefSymbol) {
        useForwardRef = true;
        component = component['render'];
        if (process.env.NODE_ENV === 'development' && typeof component !== 'function') {
            throw new Error(`[legend-state] \`render\` property of ForwardRef was not a function`);
        }
    }

    const componentName = component.displayName || component.name;

    // Create a wrapper observer component
    let observer = function (props, ref) {
        const refListeners = useRef<Set<ObservableListenerDispose>>();
        if (!refListeners.current) refListeners.current = new Set();

        const forceRender = useForceRender();

        // Clean up listeners on the way out
        useEffect(() => () => refListeners.current.forEach((dispose) => dispose()), []);

        // Set up all the listeners while rendering the component
        return listenWhileCalling(() => component(props, ref), refListeners.current, forceRender);
    };

    if (componentName !== '') {
        (observer as FC).displayName = componentName;
    }

    // Wrap back in forwardRef if necessary
    if (useForwardRef) {
        observer = forwardRef(observer);
    }

    return memo(observer, propsAreEqual) as unknown as T;
}
