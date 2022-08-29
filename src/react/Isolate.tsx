import { ReactElement, ReactNode, useMemo } from 'react';
import { isObservable } from 'src/helpers';
import { ObservableObject } from 'src/observableInterfaces';
import { observer } from './observer';

export const Isolate = observer(function Isolate({
    children,
}: {
    children: ReactNode | (() => ReactNode);
}): ReactElement {
    return (children as () => ReactElement)();
});

export const Memo = observer(
    function Memo({ children }: { children: ReactNode | (() => ReactNode) }): ReactElement {
        return (children as () => ReactElement)();
    },
    () => true
);

export const Show = observer(function Show({
    if: if_,
    else: else_,
    children,
    memo,
}: {
    if: any;
    else?: ReactNode | (() => ReactNode);
    memo?: boolean;
    children: ReactNode | (() => ReactNode);
}): ReactElement {
    if_ = if_();
    if (isObservable(if_)) {
        if_ = (if_ as ObservableObject).observe(true);
    }

    return if_
        ? ((memo ? useMemo(() => children, []) : children) as () => ReactElement)()
        : else_
        ? (else_ as () => ReactElement)()
        : null;
});
