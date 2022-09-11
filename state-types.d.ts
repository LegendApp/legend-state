import '@legendapp/state/react';
declare module '@legendapp/state/react' {
    type Primitive = boolean | string | number | Date;
    type NotPrimitive<T> = T extends Primitive ? never : T;
    export declare const Computed: (props: {
        children: React.ReactElement | (() => React.ReactElement);
    }) => React.ReactElement;
    export declare const Memo: (props: {
        children: React.ReactElement | (() => React.ReactElement);
    }) => React.ReactElement;
    export declare const Show: <T>(props: {
        if: NotPrimitive<T>;
        else?: React.ReactElement | (() => React.ReactElement);
        memo?: boolean;
        children: React.ReactElement | ((value?: T) => React.ReactElement);
    }) => React.ReactElement;
}
