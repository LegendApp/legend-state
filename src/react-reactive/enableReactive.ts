import type { configureReactive } from '@legendapp/state/react';
import { enableReactComponents_ } from './enableReactComponents';

export function enableReactive(config: typeof configureReactive) {
    enableReactComponents_(config);
}
