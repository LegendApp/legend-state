import type { Observable } from '@legendapp/state';
import type { configureReactive } from '@legendapp/state/react';
import { useSelector } from '@legendapp/state/react';
import { useRef } from 'react';
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

let isEnabled = false;

export function enableReactNativeComponents_(configure: typeof configureReactive) {
    if (isEnabled) {
        return;
    }
    isEnabled = true;

    configure({
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
