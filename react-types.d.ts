/// <reference types="@legendapp/state/state-types" />

declare namespace React {
    interface DOMAttributes<T> {
        isolate?: boolean;
        memo?: boolean;
    }
}
