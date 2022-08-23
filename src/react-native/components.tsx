import { createElement, forwardRef, useCallback } from 'react';
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
import { ObservableChild, Primitive } from '../observableInterfaces';
import { observer } from '../react/observer';

interface Props<T, TStyle> {
    bind?: ObservableChild<T>;
    style?: StyleProp<TStyle> | ((value: T) => StyleProp<TStyle>);
}

export const Binder = function <
    TBind extends Primitive,
    TStyle,
    TProps extends { onChange?: any; style?: StyleProp<any> }
>(Component, getValue: (p: any) => TBind) {
    return observer(
        forwardRef(function Bound(
            { bind, onChange, style, ...props }: Props<TBind, TStyle> & Omit<TProps, 'style'>,
            ref
        ) {
            if (bind) {
                const _onChange = useCallback((e) => {
                    bind.set(getValue(e));
                    onChange?.(e);
                }, []);

                const value = bind.observe();

                if (isFunction(style)) {
                    style = style(value);
                }

                return createElement(Component, Object.assign({}, props, { onChange: _onChange, value, style, ref }));
            } else {
                return createElement(Component, ref ? { ...props, ref } : props);
            }
        })
    );
};

export namespace LS {
    export const TextInput = Binder<Primitive, TextStyle, TextInputProps>(
        RNTextInput,
        (e: NativeSyntheticEvent<TextInputChangeEventData>) => e.nativeEvent.text
    );
    export const Switch = Binder<Primitive, ViewStyle, SwitchProps>(RNSwitch, (e: SwitchChangeEvent) => e.value);
}
