import { set } from './ObservableObject';
import { get, peek, symbolGetNode } from './globals';
import { isBoolean } from './is';
import type { NodeValue, ObservablePrimitive } from './observableInterfaces';
import { onChange } from './onChange';

interface ObservablePrimitiveState {
    _node: NodeValue;
    toggle: () => void;
}

const fns: (keyof ObservablePrimitive<any>)[] = ['get', 'set', 'peek', 'onChange', 'toggle'];

export function ObservablePrimitiveClass<T>(this: ObservablePrimitive<T> & ObservablePrimitiveState, node: NodeValue) {
    this._node = node;

    // Bind to this
    for (let i = 0; i < fns.length; i++) {
        const key: keyof typeof this = fns[i];
        this[key] = (this[key] as Function).bind(this);
    }
}

// Add observable functions to prototype
function proto(key: string, fn: Function) {
    ObservablePrimitiveClass.prototype[key] = function (...args: any[]) {
        return fn.call(this, this._node, ...args);
    };
}
proto('peek', peek);
proto('get', get);
proto('set', set);
proto('onChange', onChange);

// Getters
Object.defineProperty(ObservablePrimitiveClass.prototype, symbolGetNode, {
    configurable: true,
    get() {
        return this._node;
    },
});

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
