import { memo, ReactElement, NamedExoticComponent, ComponentProps } from 'react';
import { Computed } from './Computed';

type ComputedWithMemo = (params: {
    children: ComponentProps<typeof Computed>['children'];
    scoped?: boolean;
}) => ReactElement;

export const Memo = memo(Computed as ComputedWithMemo, (prev, next) =>
    next.scoped ? prev.children === next.children : true,
) as NamedExoticComponent<{
    children: any;
    scoped?: boolean;
}>;
