import { isFunction, isObservable, Selector } from '@legendapp/state';
import { ChangeEvent, FC, forwardRef, memo, useCallback } from 'react';
import { reactGlobals } from './react-globals';
import type { BindKeys } from './reactInterfaces';
import { useSelector } from './useSelector';

export type ShapeWith$<T, T2 extends keyof T = keyof T> = Partial<T> & {
    [K in T2 as K extends `$${string & K}` ? K : `$${string & K}`]?: Selector<T[K]>;
};

export type ObjectShapeWith$<T> = {
    [K in keyof T]: T[K] extends FC<infer P> ? FC<ShapeWith$<P>> : T[K];
};

// Extracting the forwardRef inspired by https://github.com/mobxjs/mobx/blob/main/packages/mobx-react-lite/src/observer.ts
export const hasSymbol = /* @__PURE__ */ typeof Symbol === 'function' && Symbol.for;

// TODOV2: Change bindKeys to an options object, where one of the options is "convertChildren" so that behavior can be optional
function createReactiveComponent<P = object>(
    component: FC<P>,
    observe: boolean,
    reactive?: boolean,
    bindKeys?: BindKeys<P>,
) {
    const ReactForwardRefSymbol = hasSymbol
        ? Symbol.for('react.forward_ref')
        : // eslint-disable-next-line react/display-name, @typescript-eslint/no-unused-vars
          typeof forwardRef === 'function' && forwardRef((props: any) => null)['$$typeof'];

    const ReactMemoSymbol = hasSymbol
        ? Symbol.for('react.memo')
        : // eslint-disable-next-line react/display-name, @typescript-eslint/no-unused-vars
          typeof forwardRef === 'function' && memo((props) => null)['$$typeof'];

    // If this component is already reactive bail out early
    // This can happen with Fast Refresh.
    if ((component as any)['__legend_proxied']) return component;

    let useForwardRef = false;
    let useMemo = false;
    let render = component;

    // Unwrap memo on the component
    if (ReactMemoSymbol && (render as any)['$$typeof'] === ReactMemoSymbol && (render as any)['type']) {
        useMemo = true;
        render = (render as any)['type'];
    }
    // Unwrap forwardRef on the component
    if (ReactForwardRefSymbol && (render as any)['$$typeof'] === ReactForwardRefSymbol) {
        useForwardRef = true;
        render = (render as any)['render'];
        if (process.env.NODE_ENV === 'development' && typeof render !== 'function') {
            throw new Error(`[legend-state] \`render\` property of ForwardRef was not a function`);
        }
    }

    const proxyHandler: ProxyHandler<any> = {
        apply(target, thisArg, argArray) {
            // If this is a reactive component, convert all props ending in $
            // to regular props and set up a useSelector listener
            if (reactive) {
                const props = argArray[0];
                const propsOut = {} as Record<string, any>;
                const keys = Object.keys(props);
                for (let i = 0; i < keys.length; i++) {
                    const key = keys[i];
                    const p = props[key];

                    // Convert children if it's a function
                    if (key === 'children' && (isFunction(p) || isObservable(p))) {
                        props[key] = useSelector(p);
                    }
                    // Convert reactive props
                    else if (key.startsWith('$') || key.endsWith('$')) {
                        // TODOV3 Add this warning and then remove the deprecated endsWith option
                        // if (
                        //     process.env.NODE_ENV === 'development' &&
                        //     !internal.globalState.noDepWarn &&
                        //     key.endsWith('$')
                        // ) {
                        //     console.warn(
                        //         `[legend-state] Reactive props will be changed to start with $ instead of end with $ in version 2.0. So please change ${key} to $${key.replace(
                        //             '$',
                        //             '',
                        //         )}. See https://legendapp.com/open-source/state/migrating for more details.`,
                        //     );
                        // }
                        const k = key.endsWith('$') ? key.slice(0, -1) : key.slice(1);
                        // Return raw value and listen to the selector for changes

                        const bind = bindKeys?.[k as keyof P];
                        const shouldBind = bind && isObservable(p);

                        propsOut[k] = shouldBind && bind?.selector ? bind.selector(propsOut, p) : useSelector(p);

                        // If this key is one of the bind keys set up a two-way binding
                        if (shouldBind) {
                            // Use the bind's defaultValue if value is undefined
                            if (bind.defaultValue !== undefined && propsOut[k] === undefined) {
                                propsOut[k] = bind.defaultValue;
                            }

                            if (bind.handler && bind.getValue) {
                                // Hook up the change lander
                                const handlerFn = (e: ChangeEvent) => {
                                    p.set(bind.getValue!(e));
                                    props[bind.handler!]?.(e);
                                };

                                (propsOut[bind.handler as string] as any) =
                                    // If in development mode, don't memoize the handler. fix fast refresh bug
                                    process.env.NODE_ENV === 'development'
                                        ? handlerFn
                                        : useCallback(handlerFn, [props[bind.handler], bindKeys]);
                            }
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
            if (observe) {
                return useSelector(() => {
                    reactGlobals.inObserver = true;
                    try {
                        return Reflect.apply(target, thisArg, argArray);
                    } finally {
                        reactGlobals.inObserver = false;
                    }
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
        (ret as any)['__legend_proxied'] = true;
    } else {
        ret = proxy;
    }

    return observe || useMemo ? memo(ret) : ret;
}

export function observer<P = object>(component: FC<P>): FC<P> {
    return createReactiveComponent(component, true);
}

export function reactive<P = object, P2 extends keyof P = keyof P>(component: FC<P>, bindKeys?: BindKeys<P>) {
    return createReactiveComponent(component, false, true, bindKeys) as FC<ShapeWith$<P, P2>>;
}

export function reactiveObserver<P = object>(component: FC<P>, bindKeys?: BindKeys<P>) {
    return createReactiveComponent(component, true, true, bindKeys) as FC<ShapeWith$<P>>;
}

export function reactiveComponents<P extends Record<string, FC>>(components: P): ObjectShapeWith$<P> {
    return new Proxy(
        {},
        {
            get(target: Record<string, any>, p: string) {
                if (!target[p]) {
                    target[p] = createReactiveComponent(components[p], false, true) as FC<ShapeWith$<P>>;
                }

                return target[p];
            },
        },
    ) as ObjectShapeWith$<P>;
}
