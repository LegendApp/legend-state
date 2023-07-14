import { isEmpty, isFunction } from '@legendapp/state';
import { BindKeys, ShapeWith$, reactive } from '@legendapp/state/react';
import { FC, LegacyRef, createElement, forwardRef } from 'react';
import {
    ActivityIndicator,
    ActivityIndicatorProps,
    Button,
    ButtonProps,
    FlatList,
    FlatListProps,
    Image,
    ImageProps,
    Pressable,
    PressableProps,
    ScrollView,
    ScrollViewProps,
    SectionList,
    SectionListProps,
    Switch,
    SwitchProps,
    Text,
    TextInput,
    TextInputProps,
    TextProps,
    TouchableWithoutFeedback,
    TouchableWithoutFeedbackProps,
    View,
    ViewProps,
} from 'react-native';

type FCReactive<P, P2> = P &
    FC<
        ShapeWith$<P2> & {
            ref?: LegacyRef<P> | undefined;
        }
    >;

const bindables: BindKeys = {
    TextInput: {
        handler: 'onChange',
        getValue: (e) => e.nativeEvent.text,
        defaultValue: '',
    },
    Switch: { handler: 'onValueChange', getValue: (e) => e, defaultValue: false },
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
        get(target: Record<string, FC>, p: keyof typeof Components) {
            if (!target[p]) {
                // Create a wrapper around createElement with the string so we can proxy it
                // eslint-disable-next-line react/display-name
                const render = forwardRef((props, ref) => {
                    const propsOut = { ...props } as any;
                    if (ref && (isFunction(ref) || !isEmpty(ref))) {
                        propsOut.ref = ref;
                    }
                    return createElement(Components[p], propsOut);
                });

                target[p] = reactive(
                    render,
                    bindables[p] &&
                        ({
                            value: bindables[p],
                        } as BindKeys)
                );
            }
            return target[p];
        },
    }
) as {
    ActivityIndicator: FCReactive<ActivityIndicator, ActivityIndicatorProps>;
    Button: FCReactive<Button, ButtonProps>;
    FlatList: FCReactive<FlatList, FlatListProps<any>>;
    Image: FCReactive<Image, ImageProps>;
    Pressable: FCReactive<typeof Pressable, PressableProps>;
    ScrollView: FCReactive<ScrollView, ScrollViewProps>;
    SectionList: FCReactive<SectionList, SectionListProps<any>>;
    Switch: FCReactive<Switch, SwitchProps>;
    Text: FCReactive<Text, TextProps>;
    TextInput: FCReactive<TextInput, TextInputProps>;
    TouchableWithoutFeedback: FCReactive<TouchableWithoutFeedback, TouchableWithoutFeedbackProps>;
    View: FCReactive<View, ViewProps>;
};
