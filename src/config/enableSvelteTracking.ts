import { internal } from '@legendapp/state';
import { configureLegendState } from '@legendapp/state/config';
import { SvelteMap } from 'svelte/reactivity';

export function enableSvelteTracking() {
    const { get, set } = internal;
    const map = new SvelteMap();
    let version = 0;

    configureLegendState({
        observableFunctions: {
            get: (node, options) => {
                map.get(node);
                return get(node, options);
            },
            set: (node, newValue) => {
                map.set(node, version++);
                set(node, newValue);
            },
        },
    });
}
