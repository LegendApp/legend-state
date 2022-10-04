import { isEmpty, isFunction, isString, isObservable } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';
import { ChangeEvent, createElement, FC, forwardRef, memo, useCallback, useReducer } from 'react';
import type { Observable, Selector } from '../observableInterfaces';

// Extracting the forwardRef inspired by https://github.com/mobxjs/mobx/blob/main/packages/mobx-react-lite/src/observer.ts
const hasSymbol = typeof Symbol === 'function' && Symbol.for;
const ReactForwardRefSymbol = hasSymbol
    ? Symbol.for('react.forward_ref')
    : typeof forwardRef === 'function' && forwardRef((props: any) => null)['$$typeof'];

const Update = (s) => s + 1;

/** @internal */
export type ShapeWith$<T> = Partial<T> & {
    [K in keyof T as K extends `${string & K}$` ? K : `${string & K}$`]?: Selector<T[K]>;
};

function createReactiveComponent<P>(
    component: FC<P> | string,
    observe: boolean,
    reactive?: boolean,
    bindOptions?: { keyValue: keyof P; keyChange?: keyof P; getValue: (e) => any }
) {
    const isStr = isString(component);
    // Unwrap forwardRef on the component
    let useForwardRef: boolean;
    if (!isStr && ReactForwardRefSymbol && component['$$typeof'] === ReactForwardRefSymbol) {
        useForwardRef = true;
        component = component['render'];
        if (process.env.NODE_ENV === 'development' && typeof component !== 'function') {
            throw new Error(`[legend-state] \`render\` property of ForwardRef was not a function`);
        }
    }
    const componentName = !isStr && ((component as FC<P>).displayName || (component as FC<P>).name);

    let ret = function ReactiveComponent(props: P, ref) {
        const fr = useReducer(Update, 0)[1];
        const propsOut = {} as P & { ref: any };

        if (isStr && ref && !isEmpty(ref)) {
            propsOut.ref = ref;
        }
        if (reactive) {
            const keys = Object.keys(props);
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                const p = props[key];
                if (key.endsWith('$') && (isFunction(p) || isObservable(p))) {
                    const k = key.slice(0, -1);
                    propsOut[k] = useSelector(p, { forceRender: fr });

                    if (bindOptions && k === bindOptions.keyValue) {
                        (propsOut[bindOptions.keyChange] as any) = useCallback(
                            (e: ChangeEvent) => {
                                p.set(bindOptions.getValue(e));
                                // @ts-ignore
                                props.onChange?.(e);
                            },
                            [(props as any).onChange, bindOptions]
                        );
                    }

                    delete propsOut[key];
                } else if (propsOut[key] === undefined) {
                    propsOut[key] = p;
                }
            }
        } else {
            Object.assign(propsOut, props);
        }

        return observe
            ? useSelector(() => (isStr ? createElement(component, propsOut) : (component as FC)(propsOut, ref)), {
                  forceRender: fr,
                  skipCompare: true,
              })
            : createElement(component, propsOut);
    };

    if (componentName) {
        (ret as FC).displayName = componentName;
    }

    // Wrap back in forwardRef if necessary
    if (isStr || useForwardRef) {
        ret = forwardRef(ret) as any;
    }

    return observe ? memo(ret) : ret;
}

export function observer<P>(component: FC<P>): FC<P> {
    return createReactiveComponent(component, true);
}

export function reactive<P>(
    component: FC<P> | string,
    bindOptions?: { keyValue: keyof P; keyChange?: keyof P; getValue: (e) => any }
) {
    return createReactiveComponent(component, false, true, bindOptions) as FC<ShapeWith$<P>>;
}

export function reactiveObserver<P>(
    component: FC<P> | string,
    bindOptions?: { keyValue: keyof P; keyChange?: keyof P; getValue: (e) => any }
) {
    return createReactiveComponent(component, true, true, bindOptions) as FC<ShapeWith$<P>>;
}
