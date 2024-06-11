import { ObservableSyncState } from 'src/observableInterfaces';
import { getNode } from './globals';
import { observable } from './observable';
import type { ObservableParam } from './observableTypes';

export function syncState(obs: ObservableParam) {
    const node = getNode(obs);
    if (!node.state) {
        node.state = observable<ObservableSyncState>({
            isPersistLoaded: false,
            isLoaded: false,
            isPersistEnabled: true,
            isSyncEnabled: true,
            isGetting: false,
            isSetting: false,
            numPendingSets: 0,
            syncCount: 0,
            clearPersist: undefined as unknown as () => Promise<void>,
            sync: () => Promise.resolve(),
            getPendingChanges: () => ({}),
        });
    }
    return node.state!;
}
