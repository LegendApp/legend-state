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
