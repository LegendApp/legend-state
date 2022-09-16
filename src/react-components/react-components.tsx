import { isFunction } from '@legendapp/state';
import {
    ChangeEvent,
    createElement,
    CSSProperties,
    DetailedHTMLProps,
    forwardRef,
    InputHTMLAttributes,
    LegacyRef,
    ReactElement,
    SelectHTMLAttributes,
    TextareaHTMLAttributes,
    useCallback,
} from 'react';
import type { NotPrimitive, ObservableFns, Primitive } from '../observableInterfaces';

type Props<TValue, TProps, TBind> = Omit<TProps, 'className' | 'style'> & {
    className?: string | ((value: TValue) => string);
    style?: CSSProperties | ((value: TValue) => CSSProperties);
    bind?: ObservableFns<TValue> & NotPrimitive<TBind>;
};

const Binder = function <
    TValue extends Primitive,
    TElement,
    TProps extends { onChange?: any; value?: any; className?: string; style?: CSSProperties }
>(Component) {
    return forwardRef(function Bound<TBind extends ObservableFns<any>>(
        { bind, ...props }: Props<TValue, TProps, TBind>,
        ref: LegacyRef<TElement>
    ) {
        if (bind) {
            const { onChange, className, style } = props;

            // Set the bound value and forward onChange
            props.onChange = useCallback(
                (e: ChangeEvent<HTMLInputElement>) => {
                    bind.set(e.target.value as any);
                    onChange?.(e);
                },
                [onChange]
            );

            // Get the bound value
            const value = (props.value = bind.get());

            // Call className if it's a function
            if (isFunction(className)) {
                props.className = className(value);
            }
            // Call style if it's a function
            if (isFunction(style)) {
                props.style = style(value);
            }
        }

        return createElement(Component as any, ref ? { ...props, ref } : props);
        // TS hack because forwardRef messes with the types
    }) as any as <TBind extends ObservableFns<any>>(props: Props<TValue, TProps, TBind>) => ReactElement | null;
};

export namespace Bindable {
    export const input = Binder<
        Primitive,
        HTMLInputElement,
        DetailedHTMLProps<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement>
    >('input');
    export const textarea = Binder<
        string,
        HTMLTextAreaElement,
        DetailedHTMLProps<TextareaHTMLAttributes<HTMLTextAreaElement>, HTMLTextAreaElement>
    >('textarea');
    export const select = Binder<
        string,
        HTMLSelectElement,
        DetailedHTMLProps<SelectHTMLAttributes<HTMLSelectElement>, HTMLSelectElement>
    >('select');
}
