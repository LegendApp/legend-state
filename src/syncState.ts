import type { ObservableSyncState } from './observableInterfaces';
import { getNode } from './globals';
import { observable } from './observable';
import type { ObservableParam } from './observableTypes';
import { ObservableHint } from './ObservableHint';

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
                sync: () => Promise.resolve(),
                getPendingChanges: () => ({}),
                // TODOV3 remove
                clearPersist: undefined as unknown as () => Promise<void>,
            }),
        );
    }
    return node.state!;
}
