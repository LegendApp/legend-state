import { useRef } from 'react';
import type { Observable } from '@legendapp/state';
import { FCReactive, FCReactiveObject, configureReactive, useSelector } from '@legendapp/state/react';
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

// TODOV3 Remove this

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
                    getValue: (e: any) => e.nativeEvent.text,
                    defaultValue: '',
                },
            },
            Switch: {
                value: {
                    handler: 'onValueChange',
                    getValue: (e: any) => e,
                    defaultValue: false,
                },
            },
            FlatList: {
                data: {
                    selector: (propsOut: Record<string, any>, p: Observable<any>) => {
                        const state = useRef(0);
                        // Increment renderNum whenever the array changes shallowly
                        const [renderNum, value] = useSelector(() => [state.current++, p.get(true)]);

                        // Set extraData to renderNum so that it will re-render when renderNum changes.
                        // This is necessary because the observable array is mutable so changes to it
                        // won't trigger re-renders by default.
                        propsOut.extraData = renderNum;

                        return value;
                    },
                },
            },
        },
    });
}

// Types:

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
