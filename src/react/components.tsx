import {
    ChangeEvent,
    createElement,
    CSSProperties,
    forwardRef,
    ForwardRefExoticComponent,
    LegacyRef,
    useCallback,
} from 'react';
import { isFunction } from '@legendapp/state';
import { ObservableChild, Primitive } from '../observableInterfaces';
import { observer } from './observer';

type Props<T, TProps> = Omit<TProps, 'className' | 'style'> & {
    bind?: ObservableChild<T>;
    className?: string | ((value: T) => string);
    style?: CSSProperties | ((value: T) => CSSProperties);
};

export const Binder = function <
    TBind extends Primitive,
    TElement,
    TProps extends { onChange?: any; className?: string; style?: CSSProperties }
>(Component) {
    return observer(
        forwardRef(function Bound(
            { bind, onChange, className, style, ...props }: Props<TBind, TProps>,
            ref: LegacyRef<TElement>
        ) {
            if (bind) {
                const _onChange = useCallback(
                    (e: ChangeEvent<HTMLInputElement>) => {
                        bind.set(e.target.value as any);
                        onChange?.(e);
                    },
                    [onChange]
                );

                const value = bind.observe();

                if (isFunction(className)) {
                    className = className(value);
                }
                if (isFunction(style)) {
                    style = style(value);
                }

                return createElement(
                    Component,
                    Object.assign({}, props, { onChange: _onChange, value, className, style, ref })
                );
            } else {
                return createElement(Component, ref ? { ...props, ref } : props);
            }
        })
    ) as any as ForwardRefExoticComponent<Props<TBind, TProps>>;
};

export namespace LS {
    export const input = Binder<
        Primitive,
        HTMLInputElement,
        React.DetailedHTMLProps<React.InputHTMLAttributes<HTMLInputElement>, HTMLInputElement>
    >('input');
    export const textarea = Binder<
        string,
        HTMLTextAreaElement,
        React.DetailedHTMLProps<React.TextareaHTMLAttributes<HTMLTextAreaElement>, HTMLTextAreaElement>
    >('textarea');
    export const select = Binder<
        string,
        HTMLSelectElement,
        React.DetailedHTMLProps<React.SelectHTMLAttributes<HTMLSelectElement>, HTMLSelectElement>
    >('select');
}
