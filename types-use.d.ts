declare module '@legendapp/state' {
    interface ObservableBaseFns<T> {
        use: () => T;
    }
}
