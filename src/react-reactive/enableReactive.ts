import type { configureReactive } from '@legendapp/state/react';
import { enableReactComponents } from './enableReactComponents';

export function enableReactive(config: typeof configureReactive) {
    enableReactComponents(config);
}
