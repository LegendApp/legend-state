import { isFunction, observable } from '@legendapp/state';
import { BindKeys, reactive, useSelector, ShapeWith$ } from '@legendapp/state/react';
import { createElement, FC, forwardRef, LegacyRef, ReactElement, useCallback } from 'react';
import {
    ActivityIndicator,
    ActivityIndicatorProps,
    Button,
    ButtonProps,
    FlatList,
    FlatListProps,
    Image,
    ImageProps,
    NativeSyntheticEvent,
    Pressable,
    PressableProps,
    ScrollView,
    ScrollViewProps,
    SectionList,
    SectionListProps,
    StyleProp,
    Switch as RNSwitch,
    Switch,
    SwitchChangeEvent,
    SwitchProps,
    Text,
    TextInput as RNTextInput,
    TextInput,
    TextInputChangeEventData,
    TextInputProps,
    TextProps,
    TextStyle,
    TouchableWithoutFeedback,
    TouchableWithoutFeedbackProps,
    View,
    ViewProps,
    ViewStyle,
} from 'react-native';
import type { ObservableFns, Primitive } from '../observableInterfaces';

type Props<TValue, TStyle, TProps, TBind> = Omit<TProps, 'style'> & {
    bind?: ObservableFns<TValue>;
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
            const value = (props.value = useSelector(bind.get() as any));

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

type FCReactive<P, P2> = P & FC<ShapeWith$<P2>>;

const bindables = {
    TextInput: (e) => e.nativeEvent.text,
    Switch: (e) => e.value,
};

const Components = {
    ActivityIndicator: ActivityIndicator,
    Button: Button,
    FlatList: FlatList,
    Image: Image,
    Pressable: Pressable,
    ScrollView: ScrollView,
    SectionList: SectionList,
    Switch: Switch,
    Text: Text,
    TextInput: TextInput,
    TouchableWithoutFeedback: TouchableWithoutFeedback,
    View: View,
};

export const Legend = new Proxy(
    {},
    {
        get(target, p: string) {
            if (!target[p] && Components[p]) {
                target[p] = reactive(
                    Components[p],
                    bindables[p] && ({ value: { handler: 'onChange', getValue: bindables[p] } } as BindKeys)
                );
            }
            return target[p];
        },
    }
) as {
    ActivityIndicator: FCReactive<typeof ActivityIndicator, ActivityIndicatorProps>;
    Button: FCReactive<typeof Button, ButtonProps>;
    FlatList: FCReactive<typeof FlatList, FlatListProps<any>>;
    Image: FCReactive<typeof Image, ImageProps>;
    Pressable: FCReactive<typeof Pressable, PressableProps>;
    ScrollView: FCReactive<typeof ScrollView, ScrollViewProps>;
    SectionList: FCReactive<typeof SectionList, SectionListProps<any>>;
    Switch: FCReactive<typeof Switch, SwitchProps>;
    Text: FCReactive<typeof Text, TextProps>;
    TextInput: FCReactive<TextInput, TextInputProps>;
    TouchableWithoutFeedback: FCReactive<typeof TouchableWithoutFeedback, TouchableWithoutFeedbackProps>;
    View: FCReactive<typeof View, ViewProps>;
};
