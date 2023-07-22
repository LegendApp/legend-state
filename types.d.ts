// TODOV2 deprecate and delete this file
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ReactNode } from 'react';
import type { ObservableReadable } from '@legendapp/state';
import type { Computed, Memo } from '@legendapp/state/react';
declare module '@legendapp/state/react' {
    export declare const Computed: (props: {
        children: ObservableReadable | (() => ReactNode) | ReactNode;
    }) => React.ReactElement;
    export declare const Memo: (props: {
        children: ObservableReadable | (() => ReactNode) | ReactNode;
    }) => React.ReactElement;
}
