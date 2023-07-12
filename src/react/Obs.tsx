import { isEmpty, isFunction } from '@legendapp/state';
import { BindKeys, reactive } from '@legendapp/state/react';
import { ComponentClass, FC, ReactElement, ReactNode, createElement, forwardRef } from 'react';
import type { Selector } from '../observableInterfaces';
import { useSelector } from './useSelector';

function Obs$({ children }: { children: Selector<ReactNode> }): ReactElement {
    return useSelector(children) as ReactElement;
}

const ObsFns = new Map<string, FC | ComponentClass>();
const ObsFnBinders = new Map<string, BindKeys>();

export interface IObs {
    $: typeof Obs$;
}

export const Obs: IObs = new Proxy(
    {
        $: Obs$,
    },
    {
        get(target: Record<string, FC>, p: string) {
            if (!target[p]) {
                const Component = ObsFns.get(p) || p;

                // Create a wrapper around createElement with the string so we can proxy it
                // eslint-disable-next-line react/display-name
                const render = forwardRef((props, ref) => {
                    const propsOut = { ...props } as any;
                    if (ref && (isFunction(ref) || !isEmpty(ref))) {
                        propsOut.ref = ref;
                    }
                    return createElement(Component, propsOut);
                });

                target[p] = reactive(render, ObsFnBinders.get(p));
            }
            return target[p];
        },
    }
) as unknown as IObs;

export function configureObs({
    components,
    binders,
}: {
    components?: Record<string, FC | ComponentClass>;
    binders?: Record<string, BindKeys>;
}) {
    if (components) {
        for (const key in components) {
            ObsFns.set(key, components[key]);
        }
    }
    if (binders) {
        for (const key in binders) {
            ObsFnBinders.set(key, binders[key]);
        }
    }
}
