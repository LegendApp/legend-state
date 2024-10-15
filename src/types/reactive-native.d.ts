// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { IReactive } from '@legendapp/state/react';

declare module '@legendapp/state/react' {
    interface IReactive {
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
