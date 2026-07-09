import * as React from 'react';
import { computeSelector, isFunction, isObservable, Selector } from '@legendapp/state';
import { ChangeEvent, ComponentClass, FC, forwardRef, memo, useRef } from 'react';
import { reactGlobals } from './react-globals';
import type { BindKeys, KeysOfUnion } from './reactInterfaces';
import { useSelector } from './useSelector';

type WithSelectorChildren<T> = T extends any
    ? T extends { children?: infer C }
        ? Omit<T, 'children'> & { children?: C | Selector<C> }
        : T extends { children: infer C }
          ? Omit<T, 'children'> & { children: C | Selector<C> }
          : T
    : never;

export type ShapeWith$<T> = WithSelectorChildren<Partial<T>> & {
    [K in keyof T as K extends `$${string & K}` ? K : `$${string & K}`]?: Selector<T[K]>;
};

export type ObjectShapeWith$<T> = {
    [K in keyof T]: T[K] extends FC<infer P> ? FC<ShapeWith$<P>> : T[K];
};

type ValueOfUnionKey<T, K extends PropertyKey> = T extends any ? (K extends keyof T ? T[K] : never) : never;

export type ReactifyProps<T, K extends KeysOfUnion<T>> = T & {
    [P in K as `$${string & P}`]?: Selector<ValueOfUnionKey<T, P>>;
};

// Extracting the forwardRef inspired by https://github.com/mobxjs/mobx/blob/main/packages/mobx-react-lite/src/observer.ts
export const hasSymbol = /* @__PURE__ */ typeof Symbol === 'function' && Symbol.for;

let didWarnProps = false;

interface BindHandlerCache {
    bind: any;
    observable: any;
    originalHandler: any;
    handler: (event: ChangeEvent) => void;
}

// TODOV2: Change bindKeys to an options object, where one of the options is "convertChildren" so that behavior can be optional
function createReactiveComponent<P = object>(
    component: FC<P> | ComponentClass<P>,
    observe: boolean,
    reactive?: boolean,
    keysReactive?: (string | number | symbol)[] | undefined | null,
    // TODO: I don't like this any type but not sure how to fix it. It's internal so not a big deal.
    bindKeys?: BindKeys<any>,
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

    const keysReactiveSet = keysReactive ? new Set(keysReactive) : undefined;

    const proxyHandler: ProxyHandler<any> = {
        apply(target, thisArg, argArray) {
            // If this is a reactive component, convert all props ending in $
            // to regular props and track all reactive reads in one stable hook.
            if (reactive) {
                const props = argArray[0];
                const bindHandlersRef = useRef<Record<string, BindHandlerCache>>({});
                argArray[0] = useSelector(
                    () => {
                        const propsOut = {} as Record<string, any>;
                        const keys = Object.keys(props);
                        for (let i = 0; i < keys.length; i++) {
                            const key = keys[i];
                            const p = props[key];

                            const isReactiveKey = keysReactiveSet && keysReactiveSet.has(key);

                            // Convert children if it's a function or observable
                            if (key === 'children' && (isFunction(p) || isObservable(p))) {
                                propsOut[key] = computeSelector(p);
                            }
                            // Convert reactive props
                            else if (isReactiveKey || key.startsWith('$') || key.endsWith('$')) {
                                // TODOV3 Add this warning
                                // TODOV4 Remove the deprecated endsWith option
                                if (process.env.NODE_ENV === 'development' && !didWarnProps && key.endsWith('$')) {
                                    didWarnProps = true;
                                    console.warn(
                                        `[legend-state] Reactive props were changed to start with $ instead of end with $ in version 2.0. So please change ${key} to $${key.replace(
                                            '$',
                                            '',
                                        )}. See https://legendapp.com/open-source/state/migrating for more details.`,
                                    );
                                }
                                const k = isReactiveKey ? key : key.endsWith('$') ? key.slice(0, -1) : key.slice(1);

                                const bind = bindKeys?.[k as keyof P];
                                const shouldBind = bind && isObservable(p);

                                propsOut[k] =
                                    shouldBind && bind?.selector ? bind.selector(propsOut, p) : computeSelector(p);

                                // If this key is one of the bind keys set up a two-way binding
                                if (shouldBind) {
                                    // Use the bind's defaultValue if value is undefined
                                    if (bind.defaultValue !== undefined && propsOut[k] === undefined) {
                                        propsOut[k] = bind.defaultValue;
                                    }

                                    if (bind.handler && bind.getValue) {
                                        // Hook up the change handler
                                        const handlerKey = bind.handler as string;
                                        const originalHandler = props[handlerKey];
                                        let cached = bindHandlersRef.current[k];

                                        if (
                                            !cached ||
                                            cached.bind !== bind ||
                                            cached.observable !== p ||
                                            cached.originalHandler !== originalHandler
                                        ) {
                                            cached = bindHandlersRef.current[k] = {
                                                bind,
                                                observable: p,
                                                originalHandler,
                                                handler: (event: ChangeEvent) => {
                                                    p.set(bind.getValue!(event));
                                                    originalHandler?.(event);
                                                },
                                            };
                                        }

                                        propsOut[handlerKey] = cached.handler;
                                    }
                                }

                                if (!isReactiveKey) {
                                    // Delete the reactive key
                                    delete propsOut[key];
                                }
                            } else if (propsOut[key] === undefined) {
                                propsOut[key] = p;
                            }
                        }
                        return propsOut;
                    },
                    { skipCheck: true },
                );
            }

            // If observing wrap the whole render in a useSelector to listen to it
            if (observe) {
                return useSelector(
                    () => {
                        reactGlobals.inObserver = true;
                        try {
                            return Reflect.apply(target, thisArg, argArray);
                        } finally {
                            reactGlobals.inObserver = false;
                        }
                    },
                    { skipCheck: true },
                );
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

export function observer<P extends FC<any>>(component: P): P {
    return createReactiveComponent(component, true);
}

// With empty keys
export function reactive<T extends object>(
    component: React.ComponentClass<T>,
    keys: undefined | null,
    bindKeys?: BindKeys<T>,
): React.FC<ShapeWith$<T>>;
export function reactive<T extends object>(
    component: React.FC<T>,
    keys: undefined | null,
    bindKeys?: BindKeys<T>,
): React.FC<ShapeWith$<T>>;
export function reactive<T extends object>(
    component: React.ForwardRefExoticComponent<T>,
    keys: undefined | null,
    bindKeys?: BindKeys<T>,
): React.ForwardRefExoticComponent<ShapeWith$<T>>;
// With keys
export function reactive<T extends object, K extends KeysOfUnion<T>>(
    component: React.FC<T>,
    keys: K[] | KeysOfUnion<T>[],
    bindKeys?: BindKeys<T, K>,
): React.FC<ReactifyProps<T, K>>;
export function reactive<T extends object, K extends KeysOfUnion<T>>(
    component: React.ForwardRefExoticComponent<T>,
    keys: K[] | KeysOfUnion<T>[],
    bindKeys?: BindKeys<T, K>,
): React.ForwardRefExoticComponent<ReactifyProps<T, K>>;
// Without keys
export function reactive<T extends object>(component: React.ComponentClass<T>): React.ComponentClass<ShapeWith$<T>>;
export function reactive<T extends object>(component: React.FC<T>): React.FC<ShapeWith$<T>>;
export function reactive<T extends object>(
    component: React.ForwardRefExoticComponent<T>,
): React.ForwardRefExoticComponent<ShapeWith$<T>>;
// Implementation
export function reactive<T extends object, K extends KeysOfUnion<T>>(
    component: React.FC<T> | React.ForwardRefExoticComponent<T> | React.ComponentClass<T>,
    keys?: K[] | undefined | null,
    bindKeys?: BindKeys<T, K>,
): React.FC<ReactifyProps<T, K>> | React.ForwardRefExoticComponent<ReactifyProps<T, K>> | React.ComponentClass<T> {
    return createReactiveComponent(component, false, true, keys, bindKeys);
}

// With empty keys
export function reactiveObserver<T extends object>(
    component: React.FC<T>,
    keys: undefined | null,
    bindKeys?: BindKeys<T>,
): React.FC<ShapeWith$<T>>;
export function reactiveObserver<T extends object>(
    component: React.ForwardRefExoticComponent<T>,
    keys: undefined | null,
    bindKeys?: BindKeys<T>,
): React.ForwardRefExoticComponent<ShapeWith$<T>>;
// With keys
export function reactiveObserver<T extends object, K extends KeysOfUnion<T>>(
    component: React.FC<T>,
    keys: K[] | KeysOfUnion<T>[],
    bindKeys?: BindKeys<T, K>,
): React.FC<ReactifyProps<T, K>>;
export function reactiveObserver<T extends object, K extends KeysOfUnion<T>>(
    component: React.ForwardRefExoticComponent<T>,
    keys: K[] | KeysOfUnion<T>[],
    bindKeys?: BindKeys<T, K>,
): React.ForwardRefExoticComponent<ReactifyProps<T, K>>;
// Without keys
export function reactiveObserver<T extends object>(component: React.FC<T>): React.FC<ShapeWith$<T>>;
export function reactiveObserver<T extends object>(
    component: React.ForwardRefExoticComponent<T>,
): React.ForwardRefExoticComponent<ShapeWith$<T>>;
// Implementation
export function reactiveObserver<T extends object, K extends KeysOfUnion<T>>(
    component: React.FC<T> | React.ForwardRefExoticComponent<T>,
    keys?: K[] | undefined | null,
    bindKeys?: BindKeys<T, K>,
): React.FC<ReactifyProps<T, K>> | React.ForwardRefExoticComponent<ReactifyProps<T, K>> {
    return createReactiveComponent(component, true, true, keys, bindKeys);
}

export function reactiveComponents<P extends Record<string, any>>(components: P): ObjectShapeWith$<P> {
    return new Proxy(
        {},
        {
            get(target: Record<string, any>, p: string) {
                if (!target[p] && components[p]) {
                    target[p] = createReactiveComponent(components[p], false, true) as FC<ShapeWith$<P>>;
                }

                return target[p];
            },
        },
    ) as ObjectShapeWith$<P>;
}
