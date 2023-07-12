import { set as setBase } from './ObservableObject';
import { batch, notify } from './batching';
import { getNode, getNodeValue } from './globals';
import { lockObservable } from './helpers';
import { isObservable, isPromise } from './is';
import { observable } from './observable';
import { ObservableComputed, ObservableComputedTwoWay, ObservableReadable } from './observableInterfaces';
import { observe } from './observe';

export function computed<T extends ObservableReadable>(compute: () => T | Promise<T>): T;
export function computed<T>(compute: () => T | Promise<T>): ObservableComputed<T>;
export function computed<T, T2 = T>(
    compute: (() => T | Promise<T>) | ObservableReadable<T>,
    set: (value: T2) => void
): ObservableComputedTwoWay<T, T2>;
export function computed<T, T2 = T>(
    compute: (() => T | Promise<T>) | ObservableReadable<T>,
    set?: (value: T2) => void
): ObservableComputed<T> | ObservableComputedTwoWay<T, T2> {
    // Create an observable for this computed variable
    const obs = observable<T>();
    lockObservable(obs, true);

    const node = getNode(obs);
    node.isComputed = true;

    const setInner = function (val: any) {
        const prevNode = node.linkedToNode;
        // If it was previously linked to a node remove self
        // from its linkedFromNodes
        if (prevNode) {
            node.linkedToNode.linkedFromNodes.delete(node);
            node.linkedToNode = undefined;
        }
        if (isObservable(val)) {
            // If the computed is a proxy to another observable
            // link it to the target observable
            const linkedNode = getNode(val);
            node.linkedToNode = linkedNode;
            if (!linkedNode.linkedFromNodes) {
                linkedNode.linkedFromNodes = new Set();
            }
            linkedNode.linkedFromNodes.add(node);

            // If the target observable is different then notify for the change
            if (prevNode) {
                const value = getNodeValue(linkedNode);
                const prevValue = getNodeValue(prevNode);
                notify(node, value, prevValue, 0);
            }
        } else if (val !== obs.peek()) {
            // Update the computed value
            lockObservable(obs, false);
            setBase(node, val);
            lockObservable(obs, true);
        }
    };

    // Lazily activate the observable when get is called
    node.root.activate = () => {
        observe(
            compute,
            ({ value }) => {
                if (isPromise<T>(value)) {
                    value.then((v) => setInner(v));
                } else {
                    setInner(value);
                }
            },
            { immediate: true, retainObservable: true }
        );
    };

    if (set) {
        node.root.set = (value: any) => {
            batch(() => set(value));
        };
    }

    return obs as ObservableComputed<T>;
}
