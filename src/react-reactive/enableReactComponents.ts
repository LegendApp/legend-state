import { BindKeys, configureReactive } from '@legendapp/state/react';

let isEnabled = false;

export function enableReactComponents_(config: typeof configureReactive) {
    if (isEnabled) {
        return;
    }
    isEnabled = true;

    const bindInfo: BindKeys = {
        value: { handler: 'onChange', getValue: (e: any) => e.target.value, defaultValue: '' },
    };
    const bindInfoInput: BindKeys = Object.assign(
        { checked: { handler: 'onChange', getValue: (e: { target: { checked: boolean } }) => e.target.checked } },
        bindInfo,
    );
    config({
        binders: {
            input: bindInfoInput,
            textarea: bindInfo,
            select: bindInfo,
        },
    });
}

// TODOV3 Remove this in favor of importing from /types/reactive-web

// Types:

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { FCReactiveObject, IReactive } from '@legendapp/state/react';

declare module '@legendapp/state/react' {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface IReactive extends FCReactiveObject<JSX.IntrinsicElements> {}
}
