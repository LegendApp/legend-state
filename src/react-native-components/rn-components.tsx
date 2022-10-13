import { BindKeys, reactive, ShapeWith$ } from '@legendapp/state/react';
import { FC } from 'react';
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

type FCReactive<P, P2> = P & FC<ShapeWith$<P2>>;

const bindables = {
    TextInput: {
        getValue: (e) => e.nativeEvent.text,
        defaultValue: '',
    },
    Switch: { getValue: (e) => e.value, defaultValue: false },
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
                    bindables[p] &&
                        ({
                            value: { handler: 'onChange', ...bindables[p] },
                        } as BindKeys)
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
