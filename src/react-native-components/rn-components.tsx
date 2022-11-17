import { BindKeys, reactive, ShapeWith$ } from '@legendapp/state/react';
import { FC, LegacyRef } from 'react';
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
            if (!target[p] && Components[p]) {
                target[p] = reactive(
                    Components[p] as FC,
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
