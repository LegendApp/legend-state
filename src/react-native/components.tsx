import { createElement, forwardRef, useCallback } from 'react';
import {
    NativeSyntheticEvent,
    Switch as RNSwitch,
    SwitchChangeEvent,
    SwitchProps,
    TextInput as RNTextInput,
    TextInputChangeEventData,
    TextInputProps,
} from 'react-native';
import { ObservableChild, Primitive } from '../observableInterfaces';
import { observer } from '../react/observer';

interface Props<T> {
    bind?: ObservableChild<T>;
}

export const Binder = function <TBind extends Primitive, TProps extends { onChange?: any }>(
    Component,
    getValue: (p: any) => TBind
) {
    return observer(
        forwardRef(function Bound({ bind, onChange, ...props }: Props<TBind> & TProps, ref) {
            if (bind) {
                const _onChange = useCallback((e) => {
                    bind.set(getValue(e));
                    onChange?.(e);
                }, []);

                return createElement(
                    Component,
                    Object.assign({}, props, { onChange: _onChange, value: bind.observe(), ref })
                );
            } else {
                return createElement(Component, ref ? { ...props, ref } : props);
            }
        })
    );
};

export namespace LS {
    export const TextInput = Binder<Primitive, TextInputProps>(
        RNTextInput,
        (e: NativeSyntheticEvent<TextInputChangeEventData>) => e.nativeEvent.text
    );
    export const Switch = Binder<Primitive, SwitchProps>(RNSwitch, (e: SwitchChangeEvent) => e.value);
}
