import { configureReactive } from '@legendapp/state/react';
import { enableReactNativeComponents_ } from './enableReactNativeComponents';

// Enable React Native Web Components
export function enableReactive(configure: typeof configureReactive) {
    enableReactNativeComponents_(configure);
}
