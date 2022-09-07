import type { ReactElement, ReactNode } from 'react';

declare namespace React {
    interface DOMAttributes<T> {
        isolate?: boolean;
        memo?: boolean;
    }
}
declare module '@legendapp/state/react' {
    export declare const Isolate: ({ children }: { children: ReactNode | (() => ReactNode) }) => ReactElement;
    export declare const Memo: ({ children }: { children: ReactNode | (() => ReactNode) }) => ReactElement;
    export declare const Show: ({
        if: if_,
        else: else_,
        children,
        memo,
    }: {
        if: any;
        else?: ReactNode | (() => ReactNode);
        memo?: boolean;
        children: ReactNode | (() => ReactNode);
    }) => ReactElement;
}
