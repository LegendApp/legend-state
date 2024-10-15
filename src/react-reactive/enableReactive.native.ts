import { configureReactive } from '@legendapp/state/react';
import { enableReactNativeComponents_ } from './enableReactNativeComponents';

export function enableReactive(configure: typeof configureReactive) {
    enableReactNativeComponents_(configure);
}
