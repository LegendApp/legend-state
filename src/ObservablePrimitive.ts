import { set, get, peek } from './ObservableObject';
import { symbolGetNode } from './globals';
import { isBoolean } from './is';
import type { NodeValue } from './nodeValueTypes';
import { ListenerFn, ObservableBoolean, ObservablePrimitive } from './observableTypes';
import { onChange } from './onChange';

export class ObservablePrimitiveClass<T> implements ObservablePrimitive<T> {
    _node: NodeValue;

    constructor(node: NodeValue) {
        this._node = node;
    }

    get [symbolGetNode]() {
        return this._node;
    }

    peek(): T {
        return peek(this._node);
    }

    get(): T {
        return get(this._node);
    }

    set(value: T): void {
        set(this._node, value);
    }

    onChange(cb: ListenerFn): () => void {
        return onChange(this._node, cb);
    }

    delete() {
        set(this._node, undefined);
    }
}

export class ObservableBooleanClass extends ObservablePrimitiveClass<boolean> implements ObservableBoolean {
    toggle(): boolean {
        const value = this.peek();
        if (value === undefined || isBoolean(value)) {
            this.set(!value);
        } else if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
            throw new Error('[legend-state] Cannot toggle a non-boolean value');
        }

        return !value;
    }
}
