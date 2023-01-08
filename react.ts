export * from './src/react/enableLegendStateReact';
export * from './src/react/flow';
export * from './src/react/lifecycle';
export * from './src/react/reactive-observer';
export * from './src/react/useComputed';
export * from './src/react/useIsMounted';
export * from './src/react/useObservable';
export * from './src/react/useObservableReducer';
export * from './src/react/useObserve';
export * from './src/react/useObserveEffect';
export * from './src/react/useSelector';

import type { ReactFragment } from 'react';

declare module '@legendapp/state' {
    export type ObservableBaseFns<T> = ReactFragment
}
