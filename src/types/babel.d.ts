// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { Computed, Memo } from '@legendapp/state/react';
declare module '@legendapp/state/react' {
    export declare const Computed: (props: {
        children: React.ReactNode | (() => React.ReactNode);
    }) => React.ReactElement;
    export declare const Memo: (props: { children: React.ReactNode | (() => React.ReactNode) }) => React.ReactElement;
}
