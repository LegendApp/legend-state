import { memo, ReactElement, ReactNode } from 'react';
import { useSelector } from './useSelector';

export const Memo = /*#__PURE__*/ memo(
    function Memo({ children }: { children: () => ReactNode }): ReactElement {
        return useSelector(children) as ReactElement;
    },
    () => true
);
