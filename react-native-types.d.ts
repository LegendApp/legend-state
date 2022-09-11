/// <reference types="@legendapp/state/state-types" />
import 'react-native';

declare module 'react-native' {
    interface FlatListProps<ItemT> extends VirtualizedListProps<ItemT> {
        computed?: boolean;
        memo?: boolean;
    }

    interface ImagePropsBase {
        computed?: boolean;
        memo?: boolean;
    }

    interface ViewProps {
        computed?: boolean;
        memo?: boolean;
    }

    interface TextProps {
        computed?: boolean;
        memo?: boolean;
    }

    interface SwitchProps {
        computed?: boolean;
        memo?: boolean;
    }

    interface InputAccessoryViewProps {
        computed?: boolean;
        memo?: boolean;
    }

    interface TouchableWithoutFeedbackProps {
        computed?: boolean;
        memo?: boolean;
    }
}
