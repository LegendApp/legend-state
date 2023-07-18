import { FCReactive, FCReactiveObject, configureReactive } from '@legendapp/state/react';
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

export function enableReactNativeComponents() {
    configureReactive({
        components: {
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
        },
        binders: {
            TextInput: {
                value: {
                    handler: 'onChange',
                    getValue: (e) => e.nativeEvent.text,
                    defaultValue: '',
                },
            },
            Switch: {
                value: {
                    handler: 'onValueChange',
                    getValue: (e) => e,
                    defaultValue: false,
                },
            },
        },
    });
}

// Types:

import type { IReactive } from '@legendapp/state/react';

declare module '@legendapp/state/react' {
    interface IReactive extends FCReactiveObject<JSX.IntrinsicElements> {
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
    }
}
