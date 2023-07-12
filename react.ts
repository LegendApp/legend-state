export * from './src/react/Computed';
export * from './src/react/For';
export * from './src/react/Memo';
export { Obs, configureObs } from './src/react/Obs';
export type { IObs } from './src/react/Obs';
export * from './src/react/Show';
export * from './src/react/Switch';
export * from './src/react/enableLegendStateReact';
export * from './src/react/reactInterfaces';
export * from './src/react/reactive-observer';
export * from './src/react/useComputed';
export * from './src/react/useEffectOnce';
export * from './src/react/useIsMounted';
export * from './src/react/useMount';
export * from './src/react/useObs';
export * from './src/react/useObservable';
export * from './src/react/useObservableReducer';
export * from './src/react/useObserve';
export * from './src/react/useObserveEffect';
export * from './src/react/useSelector';
export * from './src/react/useUnmount';

// TODOV2: Remove this and document how to configure enableReactDirectAccess in upgrade notes
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ObservableBaseFns } from '@legendapp/state';
import type { ReactFragment } from 'react';

declare module '@legendapp/state' {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unused-vars
    export interface ObservableBaseFns<T> extends ReactFragment {}
}
