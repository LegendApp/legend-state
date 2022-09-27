import '@legendapp/state/react';
declare module '@legendapp/state/react' {
    export declare const Computed: (props: {
        children: React.ReactNode | (() => React.ReactNode);
    }) => React.ReactElement;
    export declare const Memo: (props: { children: React.ReactNode | (() => React.ReactNode) }) => React.ReactElement;
}
