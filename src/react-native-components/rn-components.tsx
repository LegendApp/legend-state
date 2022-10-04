import { isFunction } from '@legendapp/state';
import { createElement, forwardRef, LegacyRef, ReactElement, useCallback } from 'react';
import { reactive } from '@legendapp/state/react';
import RN, {
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
import type { NotPrimitive, ObservableFns, Primitive } from '../observableInterfaces';

type Props<TValue, TStyle, TProps, TBind> = Omit<TProps, 'style'> & {
    bind?: ObservableFns<TValue> & NotPrimitive<TBind>;
    style?: StyleProp<TStyle> | ((value: TValue) => StyleProp<TStyle>);
};

let didWarnBindable = false;

const Binder = function <
    TValue extends Primitive,
    TElement,
    TStyle,
    TProps extends { onChange?: any; value?: any; style?: StyleProp<any> }
>(Component: TElement, getValue: (p: any) => TValue) {
    return forwardRef(function Bound<TBind extends ObservableFns<any>>(
        { bind, ...props }: Props<TValue, TStyle, TProps, TBind>,
        ref: LegacyRef<TElement>
    ) {
        if (!didWarnBindable) {
            didWarnBindable = true;
            console.warn(
                '[legend-state] Bindable components are deprecated and have been renamed to Legend components with a value$ prop, like <Legend.TextInput value$={obs}>'
            );
        }

        if (bind) {
            const { onChange, style } = props;

            // Set the bound value and forward onChange
            props.onChange = useCallback(
                (e) => {
                    bind.set(getValue(e));
                    onChange?.(e);
                },
                [onChange, bind]
            );

            // Get the bound value
            const value = (props.value = bind.get());

            // Call style if it's a function
            if (isFunction(style)) {
                props.style = style(value);
            }
        }

        return createElement(Component as any, ref ? { ...props, ref } : props);
        // TS hack because forwardRef messes with the types
    }) as any as <TBind extends ObservableFns<any>>(props: Props<TValue, TStyle, TProps, TBind>) => ReactElement | null;
};

export namespace Bindable {
    export const TextInput = Binder<Primitive, typeof RNTextInput, TextStyle, TextInputProps>(
        RNTextInput,
        (e: NativeSyntheticEvent<TextInputChangeEventData>) => e.nativeEvent.text
    );
    export const Switch = Binder<Primitive, typeof RNSwitch, ViewStyle, SwitchProps>(
        RNSwitch,
        (e: SwitchChangeEvent) => e.value
    );
}

const bindables = new Map([
    ['TextInput', (e) => e.nativeEvent.text],
    ['Switch', (e) => e.value],
]);

export const Legend = new Proxy(
    {},
    {
        get(target, p: string) {
            if (!target[p]) {
                target[p] = reactive(
                    RN[p],
                    bindables.has(p) && { keyValue: 'value', keyChange: 'onChange', getValue: bindables.get(p) }
                );
            }
            return target[p];
        },
    }
) as {
    ActivityIndicator: typeof RN.ActivityIndicator;
    Button: typeof RN.Button;
    FlatList: typeof RN.FlatList;
    Image: typeof RN.Image;
    Pressable: typeof RN.Pressable;
    ScrollView: typeof RN.ScrollView;
    SectionList: typeof RN.SectionList;
    Switch: typeof RN.Switch;
    Text: typeof RN.Text;
    TextInput: typeof RN.TextInput;
    TouchableWithoutFeedback: typeof RN.TouchableWithoutFeedback;
    View: typeof RN.View;
};
