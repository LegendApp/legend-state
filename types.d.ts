declare namespace React {
    interface DOMAttributes<T> {
        isolate?: boolean;
        memo?: boolean;
    }
}

declare module 'react-native' {
    interface ViewProps {
        isolate?: boolean;
        memo?: boolean;
    }
}
