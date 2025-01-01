import type { ObservableSyncState } from './observableInterfaces';
import { getNode } from './globals';
import { observable } from './observable';
import type { ObservableParam } from './observableTypes';
import { ObservableHint } from './ObservableHint';
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

                    // If it's now activating, it should return a promise that resolves when it's loaded
                    if (node.state?.isGetting.peek()) {
                        return when(node.state.isLoaded) as any;
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
