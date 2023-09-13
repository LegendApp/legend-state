import type { Observable, ObservableObject, ObservableReadable } from '@legendapp/state';
import { findIDKey, getNode, isArray, isFunction } from '@legendapp/state';
import { FC, ReactElement, createElement, memo, useMemo, useRef, useState } from 'react';
import { observer } from './reactive-observer';
import { useSelector } from './useSelector';

const autoMemoCache = new Map<FC<any>, FC<any>>();

export function For<T, TProps>({
    each,
    optimized,
    item,
    itemProps,
    sortValues,
    children,
}: {
    each?: ObservableReadable<T[] | Record<any, T> | Map<any, T>>;
    eachValues?: ObservableReadable<Record<any, T> | Map<any, T>>;
    optimized?: boolean;
    item?: FC<{ item: Observable<T>; id?: string } & TProps>;
    itemProps?: TProps;
    sortValues?: (A: T, B: T, AKey: string, BKey: string) => number;
    children?: (value: Observable<T>) => ReactElement;
}): ReactElement | null {
    if (!each) return null;

    // Non-optimized uses shallow tracking
    const value = optimized ? each!.peek() : useSelector(() => each.get(true));

    if (optimized) {
        // optimized mode only re-renders if keys are added
        const [, setRenderNum] = useState(() => {
            each!.onChange(
                ({ changes }) => {
                    let isOk = false;
                    for (let i = 0; i < changes.length; i++) {
                        const change = changes[i];
                        if (change.path.length === 0 && change.keysAdded) {
                            isOk = true;
                        }
                    }
                    if (isOk) {
                        setRenderNum((v) => v + 1);
                    }
                },
                { trackingType: true },
            );
            return 0;
        });
    }

    // The child function gets wrapped in a memoized observer component
    if (!item && children) {
        // Update the ref so the generated component uses the latest function
        const refChildren = useRef<(value: Observable<T>) => ReactElement>();
        refChildren.current = children;

        item = useMemo(() => observer(({ item }) => refChildren.current!(item)), []);
    } else {
        // @ts-expect-error $$typeof is private
        if (item.$$typeof !== Symbol.for('react.memo')) {
            let memod = autoMemoCache.get(item!);
            if (!memod) {
                memod = memo(item!);
                autoMemoCache.set(item!, memod);
            }
            item = memod;
        }
    }

    // This early out needs to be after any hooks
    if (!value) return null;

    // Create the child elements
    const out: ReactElement[] = [];

    const isArr = isArray(value);

    if (isArr) {
        // Get the appropriate id field
        const v0 = value[0] as any;
        const node = getNode(each!);
        const length = (value as any[]).length;

        const idField =
            length > 0
                ? (node && findIDKey(v0, node)) ||
                  (v0.id !== undefined ? 'id' : v0.key !== undefined ? 'key' : undefined)
                : undefined;

        const isIdFieldFunction = isFunction(idField);

        for (let i = 0; i < length; i++) {
            const val = value[i];
            const key = (isIdFieldFunction ? idField(val) : (val as Record<string, any>)[idField as string]) ?? i;
            const props = { key, id: key, item: (each as Observable<any[]>)[key] };

            out.push(createElement(item as FC, itemProps ? Object.assign(props, itemProps) : props));
        }
    } else {
        // Render the values of the object / Map
        const isMap = value instanceof Map;
        const keys = isMap ? Array.from(value.keys()) : Object.keys(value);
        if (sortValues) {
            keys.sort((A, B) => sortValues(isMap ? value.get(A)! : value[A], isMap ? value.get(B)! : value[B], A, B));
        }
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (isMap ? value.get(key) : value[key]) {
                const props = {
                    key,
                    id: key,
                    item: isMap ? each!.get(key) : (each as ObservableObject<Record<string, any>>)[key],
                };
                out.push(createElement(item as FC, itemProps ? Object.assign(props, itemProps) : props));
            }
        }
    }

    return out as unknown as ReactElement;
}
