import { ComponentProps, memo, NamedExoticComponent, ReactElement } from 'react';
import { Computed } from './Computed';
import { isEmpty, isFunction } from '@legendapp/state';
import { createElement, FC, forwardRef } from 'react';
import { ReactiveFnBinders, ReactiveFns } from './configureReactive';
import { reactive } from './reactive-observer';
import { IReactive } from '@legendapp/state/react';

type ComputedWithMemo = (params: {
    children: ComponentProps<typeof Computed>['children'];
    scoped?: boolean;
}) => ReactElement;

const Memo = memo(Computed as ComputedWithMemo, (prev, next) =>
    next.scoped ? prev.children === next.children : true,
) as NamedExoticComponent<{
    children: any;
    scoped?: boolean;
}>;

type ReactiveProxy = typeof Memo & IReactive;

const setReactProps = new Set([
    '$$typeof',
    'defaultProps',
    'propTypes',
    'tag',
    'PropTypes',
    'displayName',
    'getDefaultProps',
    'type',
    'compare',
]);

const reactives: Record<string, FC> = {};

export const $: ReactiveProxy = new Proxy(Memo as any, {
    get(target: Record<string, FC>, p: string) {
        if (Object.hasOwn(target, p) || setReactProps.has(p)) {
            return target[p];
        }
        if (!reactives[p]) {
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

            reactives[p] = reactive(render, [], ReactiveFnBinders.get(p));
        }
        return reactives[p];
    },
}) as unknown as ReactiveProxy;
