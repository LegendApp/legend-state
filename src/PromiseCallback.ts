export class PromiseCallback<T = void> {
    public promise: Promise<T>;
    private _resolve: (value: T) => void;
    private _isResolved: boolean;
    public get isResolved() {
        return this._isResolved;
    }

    constructor() {
        this.promise = new Promise<T>((resolve) => (this._resolve = resolve));
    }
    resolve(value: T) {
        this._isResolved = true;
        this._resolve(value);
    }
}
