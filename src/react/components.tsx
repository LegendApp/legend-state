import { isFunction } from '@legendapp/state';
import { ChangeEvent, createElement, CSSProperties, forwardRef, LegacyRef, ReactElement, useCallback } from 'react';
import { NotPrimitive, ObservableFns, Primitive } from '../observableInterfaces';
import { observer } from './observer';

type Props<TValue, TProps, TBind> = Omit<TProps, 'className' | 'style'> & {
    className?: string | ((value: TValue) => string);
    style?: CSSProperties | ((value: TValue) => CSSProperties);
    bind?: ObservableFns<TValue> & NotPrimitive<TBind>;
};

export const Binder = function <
    TValue extends Primitive,
    TElement,
    TProps extends { onChange?: any; className?: string; style?: CSSProperties }
>(Component) {
    return observer(
        forwardRef(function Bound<TBind extends ObservableFns<any>>(
            { bind, onChange, className, style, ...props }: Props<TValue, TProps, TBind>,
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

                const value = bind.get();

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
        }) as any as <TBind extends ObservableFns<any>>(props: Props<TValue, TProps, TBind>) => ReactElement | null
    );
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
