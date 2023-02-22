import type { Selector } from '@legendapp/state';
import { computeSelector } from '@legendapp/state';
import { Children, ReactElement, ReactNode } from 'react';
import { useSelector } from './useSelector';

export function Switch<T>(props: {
    value: Selector<T>;
    children: Record<any, () => ReactNode>;
    default?: ReactNode;
}): ReactElement;
export function Switch<T>(props: { children: ReactNode[]; default?: ReactNode }): ReactElement;
export function Switch<T>({
    value,
    children,
    default: fallback,
}: {
    value?: Selector<T>;
    children: ReactNode[] | Record<any, () => ReactNode>;
    default?: ReactNode;
}): ReactNode {
    if (value !== undefined) {
        // If value then this is selecting from an object of cases
        return ((children as Record<any, () => ReactNode>)[useSelector(value)]?.() ??
            (children as Record<any, () => ReactNode>)['default']?.() ??
            null) as ReactElement;
    } else {
        // If no value then render the first Show child with a matching if prop
        const arr = Children.toArray(children as ReactNode[]);
        const index = useSelector(() => {
            for (let i = 0; i < arr.length; i++) {
                if (computeSelector((arr[i] as any).props.if)) return i;
            }
            return -1;
        });
        return index >= 0 ? arr[index] : fallback ?? null;
    }
}
