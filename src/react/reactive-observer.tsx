import { isObservable, Selector } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';
import { ChangeEvent, FC, forwardRef, memo, useCallback, useReducer } from 'react';

const Update = (s: number) => s + 1;

export type ShapeWith$<T> = Partial<T> & {
    [K in keyof T as K extends `${string & K}$` ? K : `${string & K}$`]?: Selector<T[K]>;
};

export type BindKeys<P = any> = Record<keyof P, { handler?: keyof P; getValue: (e) => any; defaultValue?: any }>;

// Extracting the forwardRef inspired by https://github.com/mobxjs/mobx/blob/main/packages/mobx-react-lite/src/observer.ts
const hasSymbol = typeof Symbol === 'function' && Symbol.for;
const ReactForwardRefSymbol = hasSymbol
    ? Symbol.for('react.forward_ref')
    : typeof forwardRef === 'function' && forwardRef((props: any) => null)['$$typeof'];

function createReactiveComponent<P>(component: FC<P>, observe: boolean, reactive?: boolean, bindKeys?: BindKeys<P>) {
    // If this component is already reactive bail out early
    // This can happen with Fast Refresh.
    if (component['__legend_proxied']) return component;

    let useForwardRef: boolean;
    let render = component;

    // Unwrap forwardRef on the component
    if (ReactForwardRefSymbol && component['$$typeof'] === ReactForwardRefSymbol) {
        useForwardRef = true;
        render = component['render'];
        if (process.env.NODE_ENV === 'development' && typeof render !== 'function') {
            throw new Error(`[legend-state] \`render\` property of ForwardRef was not a function`);
        }
    }

    const proxyHandler: ProxyHandler<any> = {
        apply(target, thisArg, argArray) {
            const fr = useReducer(Update, 0)[1];

            // If this is a reactive component, convert all props ending in $
            // to regular props and set up a useSelector listener
            if (reactive) {
                const props = argArray[0];
                const propsOut = {} as P & { ref: any };
                const keys = Object.keys(props);
                for (let i = 0; i < keys.length; i++) {
                    const key = keys[i];
                    const p = props[key];

                    // Convert reactive props
                    if (key.endsWith('$')) {
                        const k = key.slice(0, -1);
                        // Return raw value and Listen to the selector for changes
                        propsOut[k] = useSelector(p, { forceRender: fr });

                        // If this key is one of the bind keys set up a two-way binding
                        const bind = bindKeys?.[k as keyof P];
                        if (bind && isObservable(p)) {
                            // Use the bind's defaultValue if value is undefined
                            if (bind.defaultValue !== undefined && propsOut[k] === undefined) {
                                propsOut[k] = bind.defaultValue;
                            }
                            // Hook up the change lander
                            (propsOut[bind.handler] as any) = useCallback(
                                (e: ChangeEvent) => {
                                    p.set(bind.getValue(e));
                                    // @ts-ignore
                                    props[bind.handler]?.(e);
                                },
                                [props[bind.handler], bindKeys]
                            );
                        }

                        // Delete the reactive key
                        delete propsOut[key];
                    } else if (propsOut[key] === undefined) {
                        propsOut[key] = p;
                    }
                }
                argArray[0] = propsOut;
            }

            // If observing wrap the whole render in a useSelector to listen to it
            if (observe && fr) {
                return useSelector(() => Reflect.apply(target, thisArg, argArray), {
                    forceRender: fr,
                    shouldRender: true,
                });
            } else {
                return Reflect.apply(target, thisArg, argArray);
            }
        },
    };

    const proxy = new Proxy(render, proxyHandler);

    let ret;

    if (useForwardRef) {
        ret = forwardRef(proxy);
        ret['__legend_proxied'] = true;
    } else {
        ret = proxy;
    }

    return observe ? memo(ret) : ret;
}

export function observer<P>(component: FC<P>): FC<P> {
    return createReactiveComponent(component, true);
}

export function reactive<P>(component: FC<P>, bindKeys?: BindKeys<P>) {
    return createReactiveComponent(component, false, true, bindKeys) as FC<ShapeWith$<P>>;
}

export function reactiveObserver<P>(component: FC<P>, bindKeys?: BindKeys<P>) {
    return createReactiveComponent(component, true, true, bindKeys) as FC<ShapeWith$<P>>;
}
