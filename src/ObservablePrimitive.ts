import { checkActivate, symbolGetNode, symbolIsEvent, symbolIsObservable } from './globals';
import { isBoolean } from './is';
import { set } from './observable';
import {
    ListenerFn,
    NodeValue,
    ObservableChild,
    ObservableListenerDispose,
    ObservablePrimitive,
    TrackingType,
} from './observableInterfaces';
import { onChange } from './onChange';
import { updateTracking } from './tracking';

interface ObservablePrimitiveState {
    _node: NodeValue;
    toggle: () => void;
}

export function ObservablePrimitiveClass<T>(this: ObservablePrimitive<T> & ObservablePrimitiveState, node: NodeValue) {
    this._node = node;
    this.set = this.set.bind(this);
    this.toggle = this.toggle.bind(this);
}
// Getters
Object.defineProperty(ObservablePrimitiveClass.prototype, symbolGetNode, {
    configurable: true,
    get() {
        return this._node;
    },
});
Object.defineProperty(ObservablePrimitiveClass.prototype, symbolIsObservable, {
    configurable: true,
    value: true,
});
Object.defineProperty(ObservablePrimitiveClass.prototype, symbolIsEvent, {
    configurable: true,
    value: false,
});
ObservablePrimitiveClass.prototype.peek = function () {
    checkActivate(this._node);
    return this._node.root._;
};
ObservablePrimitiveClass.prototype.get = function () {
    const node = this._node;
    updateTracking(node);

    return this.peek();
};
// Setters
ObservablePrimitiveClass.prototype.set = function <T>(value: T | ((prev: T) => T)): ObservableChild<T> {
    return set(this._node, value);
};
ObservablePrimitiveClass.prototype.toggle = function (): boolean {
    const value = this.peek();
    if (value === undefined || isBoolean(value)) {
        this.set(!value);
    } else if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
        throw new Error('[legend-state] Cannot toggle a non-boolean value');
    }

    return !value;
};
ObservablePrimitiveClass.prototype.delete = function () {
    this.set(undefined);

    return this;
};
// Listener
ObservablePrimitiveClass.prototype.onChange = function <T>(
    cb: ListenerFn<T>,
    options?: { trackingType?: TrackingType; initial?: boolean; noArgs?: boolean }
): ObservableListenerDispose {
    return onChange(this._node, cb, options);
};
