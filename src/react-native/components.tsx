import { createElement, forwardRef, ForwardRefExoticComponent, LegacyRef, ReactElement, useCallback } from 'react';
import { isFunction } from '@legendapp/state';
import {
    NativeSyntheticEvent,
    StyleProp,
    Switch as RNSwitch,
    SwitchChangeEvent,
    SwitchProps,
    TextInput as RNTextInput,
    TextInputChangeEventData,
    TextInputProps,
    TextStyle,
    ViewStyle,
} from 'react-native';
import { NotPrimitive, ObservableChild, ObservableFns, Primitive } from '../observableInterfaces';
import { observer } from '../react/observer';

type Props<TValue, TStyle, TProps, TBind> = Omit<TProps, 'style'> & {
    bind?: ObservableFns<TValue> & NotPrimitive<TBind>;
    style?: StyleProp<TStyle> | ((value: TValue) => StyleProp<TStyle>);
};

export const Binder = function <
    TValue extends Primitive,
    TElement,
    TStyle,
    TProps extends { onChange?: any; style?: StyleProp<any> }
>(Component: TElement, getValue: (p: any) => TValue) {
    return observer(
        forwardRef(function Bound<TBind extends ObservableFns<any>>(
            { bind, onChange, style, ...props }: Props<TValue, TStyle, TProps, TBind>,
            ref: LegacyRef<TElement>
        ) {
            if (bind) {
                const _onChange = useCallback((e) => {
                    bind.set(getValue(e));
                    onChange?.(e);
                }, []);

                const value = bind.get();

                if (isFunction(style)) {
                    style = style(value);
                }

                return createElement(
                    Component as any,
                    Object.assign({}, props, { onChange: _onChange, value, style, ref })
                );
            } else {
                return createElement(Component as any, ref ? { ...props, ref } : props);
            }
        })
    ) as any as <TBind extends ObservableFns<any>>(props: Props<TValue, TStyle, TProps, TBind>) => ReactElement | null;
};

export namespace LS {
    export const TextInput = Binder<Primitive, typeof RNTextInput, TextStyle, TextInputProps>(
        RNTextInput,
        (e: NativeSyntheticEvent<TextInputChangeEventData>) => e.nativeEvent.text
    );
    export const Switch = Binder<Primitive, typeof RNSwitch, ViewStyle, SwitchProps>(
        RNSwitch,
        (e: SwitchChangeEvent) => e.value
    );
}
