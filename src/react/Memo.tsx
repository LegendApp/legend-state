import { memo, ReactElement, ReactNode } from 'react';
import type { Selector } from 'src/observableInterfaces';
import { useSelector } from './useSelector';

export const Memo = /*#__PURE__*/ memo(
    function Memo({ children }: { children: Selector<ReactNode> }): ReactElement {
        return useSelector(children) as ReactElement;
    },
    () => true
);
