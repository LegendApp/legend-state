export * from './lib/react/Computed';
export * from './lib/react/For';
export * from './lib/react/Memo';
export { Reactive, configureReactive } from './lib/react/Reactive';
export type { IReactive } from './lib/react/Reactive';
export * from './lib/react/Show';
export * from './lib/react/Switch';
export * from './lib/react/enableLegendStateReact';
export * from './lib/react/reactInterfaces';
export * from './lib/react/reactive-observer';
export * from './lib/react/useComputed';
export * from './lib/react/useEffectOnce';
export * from './lib/react/useIsMounted';
export * from './lib/react/useMount';
export * from './lib/react/useObservable';
export * from './lib/react/useObservableReducer';
export * from './lib/react/useObserve';
export * from './lib/react/useObserveEffect';
export * from './lib/react/useSelector';
export * from './lib/react/useUnmount';

// TODOV2: Remove this and document how to import it manually in upgrade notes
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ObservableBaseFns } from '@legendapp/state';
import type { ReactFragment } from 'react';

declare module '@legendapp/state' {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unused-vars
    export interface ObservableBaseFns<T> extends ReactFragment {}
}
