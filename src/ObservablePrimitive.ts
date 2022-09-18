import { doNotify } from './notify';
import { isFunction } from './is';
import {
    ListenerFn,
    NodeValue,
    ObservableChild,
    ObservableListenerDispose,
    ObservablePrimitiveFns,
} from './observableInterfaces';
import { onChange } from './onChange';
import { updateTracking } from './tracking';

export class ObservablePrimitiveClass<T = any> implements ObservablePrimitiveFns<T> {
    #node: NodeValue;
    [Symbol.iterator];

    constructor(node: NodeValue) {
        this.#node = node;
        this.set = this.set.bind(this);
    }
    get value() {
        const node = this.#node;
        updateTracking(node);
        return node.root._;
    }
    set value(value: T) {
        if (this.#node.root.locked) {
            throw new Error(
                process.env.NODE_ENV === 'development'
                    ? '[legend-state] Cannot modify an observable while it is locked. Please make sure that you unlock the observable before making changes.'
                    : '[legend-state] Modified locked observable'
            );
        }
        const prev = this.#node.root._;
        this.#node.root._ = value;
        doNotify(this.#node, value, [], value, prev, 0);
    }
    peek(): T {
        return this.#node.root._;
    }
    get(track?: boolean | 'optimize'): T {
        return track !== false ? this.value : this.#node.root._;
    }
    set(value: T | ((prev: T) => T)): ObservableChild<T> {
        if (isFunction(value)) {
            value = value(this.#node.root._);
        }
        this.value = value;
        return this as unknown as ObservableChild<T>;
    }
    onChange(cb: ListenerFn<T>, track?: boolean | 'optimize', noArgs?: boolean): ObservableListenerDispose {
        return onChange(this.#node, cb, track, noArgs);
    }
    obs() {
        return this;
    }
    /** @internal */
    getNode() {
        return this.#node;
    }
}
