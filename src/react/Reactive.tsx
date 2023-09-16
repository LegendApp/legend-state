import { isEmpty, isFunction } from '@legendapp/state';
import { ComponentClass, FC, createElement, forwardRef } from 'react';
import { BindKeys } from './reactInterfaces';
import { reactive } from './reactive-observer';

const ReactiveFns = new Map<string, FC | ComponentClass>();
const ReactiveFnBinders = new Map<string, BindKeys>();

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IReactive {}

export const Reactive: IReactive = new Proxy(
    {},
    {
        get(target: Record<string, FC>, p: string) {
            if (!target[p]) {
                const Component = ReactiveFns.get(p) || p;

                // Create a wrapper around createElement with the string so we can proxy it
                // eslint-disable-next-line react/display-name
                const render = forwardRef((props, ref) => {
                    const propsOut = { ...props } as any;
                    if (ref && (isFunction(ref) || !isEmpty(ref))) {
                        propsOut.ref = ref;
                    }
                    return createElement(Component, propsOut);
                });

                target[p] = reactive(render, ReactiveFnBinders.get(p));
            }
            return target[p];
        },
    },
) as unknown as IReactive;

export function configureReactive({
    components,
    binders,
}: {
    components?: Record<string, FC | ComponentClass<any>>;
    binders?: Record<string, BindKeys>;
}) {
    if (components) {
        for (const key in components) {
            ReactiveFns.set(key, components[key]);
        }
    }
    if (binders) {
        for (const key in binders) {
            ReactiveFnBinders.set(key, binders[key]);
        }
    }
}
