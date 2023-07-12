import { memo, ReactElement, ReactNode } from 'react';
import type { Selector } from 'src/observableInterfaces';
import { useSelector } from './useSelector';

// TODOV2 Remove this in favor of Obs.$memo
export const Memo = /*#__PURE__*/ memo(
    function Memo({ children }: { children: Selector<ReactNode> }): ReactElement {
        return useSelector(children) as ReactElement;
    },
    () => true
);
