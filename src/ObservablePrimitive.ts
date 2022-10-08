import { symbolGetNode } from './globals';
import { isFunction } from './is';
import { doNotify } from './notify';
import {
    ListenerFn,
    NodeValue,
    ObservableChild,
    ObservableListenerDispose,
    TrackingType,
} from './observableInterfaces';
import { onChange } from './onChange';
import { updateTracking } from './tracking';

export function ObservablePrimitiveClass(node: NodeValue) {
    this._node = node;
}
// Getters
ObservablePrimitiveClass.prototype[symbolGetNode] = function () {
    return this._node;
};
ObservablePrimitiveClass.prototype.peek = function () {
    const root = this._node.root;
    if (root.activate) {
        root.activate();
        root.activate = undefined;
    }
    return root._;
};
ObservablePrimitiveClass.prototype.get = function () {
    const node = this._node;
    updateTracking(node);

    return this.peek();
};
// Setters
ObservablePrimitiveClass.prototype.set = function <T>(value: T | ((prev: T) => T)): ObservableChild<T> {
    if (isFunction(value)) {
        value = value(this._node.root._);
    }
    if (this._node.root.locked) {
        throw new Error(
            process.env.NODE_ENV === 'development'
                ? '[legend-state] Cannot modify an observable while it is locked. Please make sure that you unlock the observable before making changes.'
                : '[legend-state] Modified locked observable'
        );
    }
    const root = this._node.root;
    const prev = root._;
    root._ = value;
    doNotify(this._node, value, [], value, prev, 0);
    return this as unknown as ObservableChild<T>;
};
// Listener
ObservablePrimitiveClass.prototype.onChange = function <T>(
    cb: ListenerFn<T>,
    track?: TrackingType,
    noArgs?: boolean
): ObservableListenerDispose {
    return onChange(this._node, cb, track, noArgs);
};
