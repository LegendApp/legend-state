import { isEmpty, isFunction, isObservable, isString, Selector } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';
import { ChangeEvent, createElement, FC, forwardRef, memo, useCallback, useReducer } from 'react';

// Extracting the forwardRef inspired by https://github.com/mobxjs/mobx/blob/main/packages/mobx-react-lite/src/observer.ts
const hasSymbol = typeof Symbol === 'function' && Symbol.for;
const ReactForwardRefSymbol = hasSymbol
    ? Symbol.for('react.forward_ref')
    : typeof forwardRef === 'function' && forwardRef((props: any) => null)['$$typeof'];

const Update = (s: number) => s + 1;

export type ShapeWith$<T> = Partial<T> & {
    [K in keyof T as K extends `${string & K}$` ? K : `${string & K}$`]?: Selector<T[K]>;
};

export type BindKeys<P = any> = Record<keyof P, { handler?: keyof P; getValue: (e) => any }>;

function createReactiveComponent<P>(
    component: FC<P> | string,
    observe: boolean,
    reactive?: boolean,
    bindKeys?: BindKeys<P>
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

        if (isStr && ref && (isFunction(ref) || !isEmpty(ref))) {
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

                    const bind = bindKeys?.[k as keyof P];
                    if (bind && isObservable(p)) {
                        (propsOut[bind.handler] as any) = useCallback(
                            (e: ChangeEvent) => {
                                p.set(bind.getValue(e));
                                // @ts-ignore
                                props[bind.handler]?.(e);
                            },
                            [props[bind.handler], bindKeys]
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
                  shouldRender: true,
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

export function reactive<P>(component: FC<P> | string, bindKeys?: BindKeys<P>) {
    return createReactiveComponent(component, false, true, bindKeys) as FC<ShapeWith$<P>>;
}

export function reactiveObserver<P>(component: FC<P> | string, bindKeys?: BindKeys<P>) {
    return createReactiveComponent(component, true, true, bindKeys) as FC<ShapeWith$<P>>;
}
