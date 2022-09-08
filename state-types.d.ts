import '@legendapp/state/reactivity';
declare module '@legendapp/state/reactivity' {
    export declare const Isolate: ({
        children,
    }: {
        children: React.ReactNode | (() => React.ReactNode);
    }) => React.ReactElement;
    export declare const Memo: ({
        children,
    }: {
        children: React.ReactNode | (() => React.ReactNode);
    }) => React.ReactElement;
    export declare const Show: <T>({
        if: if_,
        else: else_,
        children,
        memo,
    }: {
        if: any;
        else?: React.ReactNode | (() => React.ReactNode);
        memo?: boolean;
        children: React.ReactNode | (() => React.ReactNode);
    }) => React.ReactElement;
}
