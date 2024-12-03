import { isEmpty, isFunction } from '@legendapp/state';
import { reactive, BindKeys, FCReactiveObject } from '@legendapp/state/react';
import { createElement, FC, forwardRef } from 'react';

type IReactive = FCReactiveObject<JSX.IntrinsicElements>;

const bindInfoOneWay: BindKeys = {
    value: { handler: 'onChange', getValue: (e: any) => e.target.value, defaultValue: '' },
};
const bindInfoInput: BindKeys = Object.assign(
    { checked: { handler: 'onChange', getValue: (e: { target: { checked: boolean } }) => e.target.checked } },
    bindInfoOneWay,
);
const binders = new Map([
    ['input', bindInfoInput],
    ['textarea', bindInfoOneWay],
    ['select', bindInfoOneWay],
]);

export const $React: IReactive = new Proxy(
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

                target[p] = reactive(render, [], binders.get(p));
            }
            return target[p];
        },
    },
) as unknown as IReactive;
