import { extraPrimitiveProps, Observable } from '@legendapp/state';
import { ComponentProps, createElement, FC, forwardRef, memo } from 'react';
import { useComputed } from './useComputed';

const hasSymbol = typeof Symbol === 'function' && Symbol.for;
export const returnTrue = function () {
    return true;
};

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
        return useComputed(() => component(props, ref));
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

// Memoized component to wrap the observable value
const Text = memo(function Text({ data }: { data: Observable }) {
    const get = data?.get;
    return get ? useComputed(get) : null;
}, returnTrue);

const ReactTypeofSymbol = hasSymbol ? Symbol.for('react.element') : (createElement('a') as any).$$typeof;

// Set extra props for the proxyHandler to return on primitives
extraPrimitiveProps.set('$$typeof', ReactTypeofSymbol);
extraPrimitiveProps.set('type', Text);
extraPrimitiveProps.set('props', {
    __fn: (obs) => ({ data: obs }),
});
extraPrimitiveProps.set('ref', null);
