import type { ReactElement, ReactNode } from 'react';
import 'react-native';

declare module 'react-native' {
    interface FlatListProps<ItemT> extends VirtualizedListProps<ItemT> {
        isolate?: boolean;
        memo?: boolean;
    }

    interface ImagePropsBase {
        isolate?: boolean;
        memo?: boolean;
    }

    interface ViewProps {
        isolate?: boolean;
        memo?: boolean;
    }

    interface TextProps {
        isolate?: boolean;
        memo?: boolean;
    }

    interface SwitchProps {
        isolate?: boolean;
        memo?: boolean;
    }

    interface InputAccessoryViewProps {
        isolate?: boolean;
        memo?: boolean;
    }

    interface TouchableWithoutFeedbackProps {
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
