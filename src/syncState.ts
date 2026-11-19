import { getNode } from './globals';
import { observable } from './observable';
import { ObservableHint } from './ObservableHint';
import type { ObservableSyncState } from './observableInterfaces';
import type { ObservableParam } from './observableTypes';
import { when } from './when';

export function syncState(obs: ObservableParam) {
    const node = getNode(obs);
    if (!node.state) {
        node.state = observable<ObservableSyncState>(
            ObservableHint.plain({
                isPersistLoaded: false,
                isLoaded: false,
                isPersistEnabled: true,
                isSyncEnabled: true,
                isGetting: false,
                isSetting: false,
                numPendingGets: 0,
                numPendingSets: 0,
                syncCount: 0,
                resetPersistence: undefined as unknown as () => Promise<void>,
                reset: () => Promise.resolve(),
                sync: () => {
                    // sync() may be called before peek/get so check to see if it should activate
                    obs.peek();

                    // If it's now activating, it should return a promise that resolves when its get
                    // loads or fails
                    const state$ = node.state!;
                    if (state$.isGetting.peek()) {
                        return when(() => state$.isLoaded.get() || state$.error.get()) as any;
                    }

                    return Promise.resolve();
                },
                getPendingChanges: () => ({}),
                // TODOV3 remove
                clearPersist: undefined as unknown as () => Promise<void>,
            }),
        );
    }
    return node.state!;
}
