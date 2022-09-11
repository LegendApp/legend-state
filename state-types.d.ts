import '@legendapp/state/react';
declare module '@legendapp/state/react' {
    type Primitive = boolean | string | number | Date;
    type NotPrimitive<T> = T extends Primitive ? never : T;
    export declare const Computed: (props: {
        children: React.ReactNode | (() => React.ReactNode);
    }) => React.ReactElement;
    export declare const Memo: (props: { children: React.ReactNode | (() => React.ReactNode) }) => React.ReactElement;
    export declare const Show: <T>(props: {
        if: NotPrimitive<T>;
        else?: React.ReactNode | (() => React.ReactNode);
        memo?: boolean;
        children: React.ReactNode | ((value?: T) => React.ReactNode);
    }) => React.ReactElement;
}
