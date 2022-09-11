/// <reference types="@legendapp/state/state-types" />

declare namespace React {
    interface DOMAttributes<T> {
        computed?: boolean;
        memo?: boolean;
    }
}
