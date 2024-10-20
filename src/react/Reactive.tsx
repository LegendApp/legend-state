import { isEmpty, isFunction } from '@legendapp/state';
import { enableReactive } from '@legendapp/state/react-reactive/enableReactive';
import { FC, createElement, forwardRef } from 'react';
import { configureReactive, ReactiveFnBinders, ReactiveFns } from './configureReactive';
import { reactive } from './reactive-observer';

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

                target[p] = reactive(render, [], ReactiveFnBinders.get(p));
            }
            return target[p];
        },
    },
) as unknown as IReactive;

if (process.env.NODE_ENV !== 'test') {
    enableReactive(configureReactive);
}
