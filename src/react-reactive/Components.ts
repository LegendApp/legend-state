import type { Observable } from '@legendapp/state';
import { reactive } from '@legendapp/state/react';
import {
    ActivityIndicator,
    Button,
    FlatList,
    Image,
    Pressable,
    ScrollView,
    SectionList,
    Switch,
    Text,
    TextInput,
    TouchableWithoutFeedback,
    View,
} from 'react-native';

const $ActivityIndicator = reactive(ActivityIndicator);
const $Button = reactive(Button);
const $FlatList = reactive(FlatList, undefined, {
    data: {
        selector: (propsOut: Record<string, any>, p: Observable<any>) => {
            const value = p.get(true);

            // Set extraData to a new object so that it will re-render when data changes.
            // This is necessary because the observable array is mutable so changes to it
            // won't trigger re-renders by default.
            propsOut.extraData = {};

            return value;
        },
    },
});
const $Image = reactive(Image);
const $Pressable = reactive(Pressable);
const $ScrollView = reactive(ScrollView);
const $SectionList = reactive(SectionList);
const $Switch = reactive(Switch, undefined, {
    value: {
        handler: 'onValueChange',
        getValue: (e: any) => e,
        defaultValue: false,
    },
});
const $Text = reactive(Text);
const $TextInput = reactive(TextInput, undefined, {
    value: {
        handler: 'onChange',
        getValue: (e: any) => e.nativeEvent.text,
        defaultValue: '',
    },
});
const $TouchableWithoutFeedback = reactive(TouchableWithoutFeedback);
const $View = reactive(View);

export {
    $ActivityIndicator,
    $Button,
    $FlatList,
    $Image,
    $Pressable,
    $ScrollView,
    $SectionList,
    $Switch,
    $Text,
    $TextInput,
    $TouchableWithoutFeedback,
    $View,
};
