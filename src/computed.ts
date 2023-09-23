import { set as setBase } from './ObservableObject';
import { batch, notify } from './batching';
import { getNode, getNodeValue, setNodeValue } from './globals';
import { isObservable, lockObservable } from './helpers';
import { isPromise } from './is';
import { observable } from './observable';
import { Computed, Observable } from './observableInterfaces2';
import { observe } from './observe';
import { onChange } from './onChange';

const state$ = observable({
    items: ['hi', 'there', 'hello'],
    selectedIndex: 0,
});

const selectedItem = computed(
    () => {
        const t = state$.items[state$.selectedIndex.get()];
        return t;
    },
    (value) => {
        if (value === undefined) return;
        state$.selectedIndex.set(state$.items.get().indexOf(value));
    },
);

selectedItem.get() === 'hi'; // true

state$.selectedIndex.set(2);

selectedItem.get() === 'hello'; // true

selectedItem.set('there');

export function computed<T>(compute: () => T | Observable<T>): Observable<Computed<T>>;
export function computed<T, T2 = T>(
    compute: () => T | Observable<T>,
    set: (value: T) => void,
): Observable<Computed<T, T2>>;
export function computed<T, T2 = T>(compute: () => T, set?: (value: T2) => void): Observable<Computed<T, T2>> {
    // Create an observable for this computed variable
    const obs = observable<T>();
    // @ts-expect-error type too complex
    lockObservable(obs, true);

    const node = getNode(obs);
    node.isComputed = true;
    let isSetAfterActivated = false;

    const setInner = function (val: any) {
        const prevNode = node.linkedToNode;
        // If it was previously linked to a node remove self
        // from its linkedFromNodes
        if (prevNode) {
            prevNode.linkedFromNodes!.delete(node);
            node.linkedToNode = undefined;
        }

        const { parentOther } = node;

        if (isObservable(val)) {
            // If the computed is a proxy to another observable
            // link it to the target observable
            const linkedNode = getNode(val);
            node.linkedToNode = linkedNode;
            if (!linkedNode.linkedFromNodes) {
                linkedNode.linkedFromNodes = new Set();
            }
            linkedNode.linkedFromNodes.add(node);
            if (node.parentOther) {
                onChange(
                    linkedNode,
                    ({ value }) => {
                        setNodeValue(node.parentOther!, value);
                    },
                    { initial: true },
                );
            }

            // If the target observable is different then notify for the change
            if (prevNode) {
                const value = getNodeValue(linkedNode);
                const prevValue = getNodeValue(prevNode);
                notify(node, value, prevValue, 0);
            }
        } else if (val !== obs.peek()) {
            // Unlock computed node before setting the value
            lockObservable(obs, false);

            const setter = isSetAfterActivated ? setBase : setNodeValue;
            // Update the computed value
            setter(node, val);

            // If the computed is a child of an observable set the value on it
            if (parentOther) {
                let didUnlock = false;
                if (parentOther.root.locked) {
                    parentOther.root.locked = false;
                    didUnlock = true;
                }
                setter(parentOther, val);
                if (didUnlock) {
                    parentOther.root.locked = true;
                }
            }

            // Re-lock the computed node
            lockObservable(obs, true);
        } else if (parentOther) {
            setNodeValue(parentOther, val);
        }

        isSetAfterActivated = true;
    };

    // Lazily activate the observable when get is called
    node.root.activate = () => {
        node.root.activate = undefined;
        observe(
            compute,
            ({ value }) => {
                if (isPromise<T>(value)) {
                    value.then((v) => setInner(v));
                } else {
                    setInner(value);
                }
            },
            { immediate: true, retainObservable: true },
        );
    };

    if (set) {
        node.root.set = (value: any) => {
            batch(() => set(value));
        };
    }

    return obs as any;
}
