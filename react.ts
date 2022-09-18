export * from './src/react/enableLegendStateReact';
export * from './src/react/flow';
export * from './src/react/useComputed';
export * from './src/react/useObservable';
export * from './src/react/useObserve';

import type { ReactFragment } from 'react';

declare module '@legendapp/state' {
    export interface ObservableBaseFns<T> extends ReactFragment {}
}
