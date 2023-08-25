import { internal, isEmpty, isFunction } from '@legendapp/state';
import { BindKeys, ShapeWith$, reactive } from '@legendapp/state/react';
import { FC, createElement, forwardRef } from 'react';

if (process.env.NODE_ENV === 'development' && !internal.globalState.noDepWarn) {
    console.warn(
        '[legend-state]: react-components are deprecated and will be removed in version 2.0. Please use the new Reactive components instead: http://www.legendapp.com/open-source/state/fine-grained-reactivity/#reactive-components.',
    );
}

type FCReactiveObject<T> = {
    [K in keyof T]: FC<ShapeWith$<T[K]>>;
};

const bindables = new Set(['input', 'textarea', 'select']);

const bindInfo: BindKeys = { value: { handler: 'onChange', getValue: (e) => e.target.value, defaultValue: '' } };
const bindInfoInput: BindKeys = Object.assign(
    { checked: { handler: 'onChange', getValue: (e: { target: { checked: boolean } }) => e.target.checked } },
    bindInfo,
);

export const Legend = new Proxy(
    {},
    {
        get(target: Record<string, FC>, p: string) {
            if (!target[p]) {
                // Create a wrapper around createElement with the string so we can proxy it
                // eslint-disable-next-line react/display-name
                const render = forwardRef((props, ref) => {
                    const propsOut = { ...props } as any;
                    if (ref && (isFunction(ref) || !isEmpty(ref))) {
                        propsOut.ref = ref;
                    }
                    return createElement(p, propsOut);
                });

                target[p] = reactive(render, bindables.has(p) ? (p === 'input' ? bindInfoInput : bindInfo) : undefined);
            }
            return target[p];
        },
    },
) as FCReactiveObject<JSX.IntrinsicElements>;
