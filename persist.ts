import type { CacheOptions, ObservablePersistStateBase, ObservablePersistenceConfig } from '@legendapp/state';
import { internal as internalState } from '@legendapp/state';
export { configureObservablePersistence } from './src/persist/configureObservablePersistence';
export { invertFieldMap, transformObject, transformPath } from './src/persist/fieldTransformer';
export { mapPersistences, persistObservable } from './src/persist/persistObservable';

export function isInRemoteChange() {
    return internalState.globalState.isLoadingRemote$.get();
}

import { observablePersistConfiguration } from './src/persist/configureObservablePersistence';
export const internal: {
    observablePersistConfiguration: ObservablePersistenceConfig;
} = {
    observablePersistConfiguration,
};

import { persistActivateNode } from './src/persist/persistActivateNode';
persistActivateNode();

declare module '@legendapp/state' {
    interface ActivateGetParams {
        value: any;
        lastSync: number | undefined;
        updateLastSync: (lastSync: number) => void;
    }
    interface ActivateParams<T> {
        cache?: CacheOptions<any>;
    }
    interface OnSetExtra {
        onError: () => void;
    }
    // interface SubscribeOptions {}
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface ObservableState extends ObservablePersistStateBase {}
}
