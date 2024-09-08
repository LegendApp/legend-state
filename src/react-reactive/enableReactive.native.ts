import { configureReactive } from '@legendapp/state/react';
import { enableReactNativeComponents } from './enableReactNativeComponents';

export function enableReactive(configure: typeof configureReactive) {
    enableReactNativeComponents(configure);
}
