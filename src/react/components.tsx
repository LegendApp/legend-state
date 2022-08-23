import { ChangeEvent, createElement, forwardRef, LegacyRef, useCallback } from 'react';
import { ObservableChild, Primitive } from '../observableInterfaces';
import { observer } from './observer';

interface Props<T> {
    bind?: ObservableChild<T>;
}

export const Binder = function <TBind extends Primitive, TElement, TProps extends { onChange?: any }>(Component) {
    return observer(
        forwardRef(function Bound({ bind, onChange, ...props }: Props<TBind> & TProps, ref: LegacyRef<TElement>) {
            const _onChange = useCallback(
                (e: ChangeEvent<HTMLInputElement>) => {
                    bind.set(e.target.value as any);
                    onChange?.(e);
                },
                [onChange]
            );

            return createElement(
                Component,
                Object.assign({}, props, { onChange: _onChange, value: bind.observe(), ref })
            );
        })
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
