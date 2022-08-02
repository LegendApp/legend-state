import { observableConfiguration } from './configureObservable';
import { symbolDateModified } from './globals';
import { mergeIntoObservable } from './helpers';
import { observable } from './observable';
import { observableBatcher } from './observableBatcher';
import type {
    Observable,
    ObservableListenerInfo,
    ObservablePersistLocal,
    ObservablePersistRemote,
    ObservablePersistState,
    PersistOptions,
} from './observableInterfaces';
import { ObservablePersistLocalStorage } from './persist/local-storage';
import { removeNullUndefined, replaceKeyInObject } from './persistHelpers';

export const mapPersistences: WeakMap<any, any> = new WeakMap();
const usedNames = new Map<string, true>();
const dateModifiedKey = '@';

const platformDefaultPersistence =
    typeof window !== 'undefined' && typeof window.localStorage !== undefined
        ? ObservablePersistLocalStorage
        : undefined;

interface LocalState {
    tempDisableSaveRemote: boolean;
    persistenceLocal?: ObservablePersistLocal;
    persistenceRemote?: ObservablePersistRemote;
}

async function onObsChange<T>(
    obsState: Observable<ObservablePersistState>,
    localState: LocalState,
    persistOptions: PersistOptions<T>,
    value: T,
    info: ObservableListenerInfo
) {
    const { persistenceLocal, persistenceRemote, tempDisableSaveRemote } = localState;

    const local = persistOptions.local;
    const saveRemote = !tempDisableSaveRemote && persistOptions.remote && !persistOptions.remote.readonly;
    if (local) {
        if (!obsState.isLoadedLocal) {
            console.error('WARNING: An observable was changed before being loaded from persistence');
            return;
        }

        // If saving remotely convert symbolDateModified to dateModifiedKey before saving locally
        // as peristing may not include symbols correctly
        const localValue = saveRemote
            ? replaceKeyInObject(value as unknown as object, symbolDateModified, dateModifiedKey, /*clone*/ true)
            : value;

        // Save to local persistence
        persistenceLocal.set(local, localValue);
    }

    if (saveRemote) {
        // Save to remote persistence and get the remote value from it. Some providers (like Firebase) will return a
        // server value different than the saved value (like Firebase has server timestamps for dateModified)
        const saved = await persistenceRemote.save(persistOptions, value, info);
        if (saved) {
            if (local) {
                const cur = persistenceLocal.get(local);
                // Replace the dateModifiedKey and remove null/undefined before saving
                const replaced = replaceKeyInObject(
                    removeNullUndefined(saved as object),
                    symbolDateModified,
                    dateModifiedKey,
                    /*clone*/ false
                );
                const toSave = cur ? mergeIntoObservable(cur, replaced) : replaced;

                persistenceLocal.set(local, toSave);
            }
        }
    }
}

function onChangeRemote(localState: LocalState, cb: () => void) {
    // Remote changes should only update local state
    localState.tempDisableSaveRemote = true;

    observableBatcher.batch(cb);

    localState.tempDisableSaveRemote = false;
}

async function loadLocal(
    obs: Observable,
    persistOptions: PersistOptions,
    obsState: Observable<ObservablePersistState>,
    localState: LocalState
) {
    const { local, remote } = persistOptions;
    const localPersistence =
        persistOptions.persistLocal || observableConfiguration.persistLocal || platformDefaultPersistence;

    if (local) {
        if (!localPersistence) {
            throw new Error('Local persistence is not configured');
        }
        // Ensure there's only one instance of the persistence plugin
        if (!mapPersistences.has(localPersistence)) {
            mapPersistences.set(localPersistence, new localPersistence());
        }
        const persistenceLocal = (localState.persistenceLocal = mapPersistences.get(
            localPersistence
        ) as ObservablePersistLocal);

        // If persistence has an asynchronous load, wait for it
        if (persistenceLocal.load) {
            await persistenceLocal.load(local);
        }

        // Get the value from state
        let value = persistenceLocal.get(local);

        // Warn on duplicate usage of local names
        if (process.env.NODE_ENV === 'development') {
            if (usedNames.has(local)) {
                console.error(`Called persist with the same local name multiple times: ${local}`);
            }
            usedNames.set(local, true);
        }

        // Merge the data from local persistence into the default state
        if (value !== null && value !== undefined) {
            if (remote) {
                replaceKeyInObject(value, dateModifiedKey, symbolDateModified, /*clone*/ false);
            }
            mergeIntoObservable(obs, value);
        }

        obsState.setProp('clearLocal', () => persistenceLocal.delete(local));

        obsState.setProp('isLoadedLocal', true);
    }
}

export function persistObservable<T>(obs: Observable<T>, persistOptions: PersistOptions<T>) {
    const obsState = observable<ObservablePersistState>({
        isLoadedLocal: false,
        isLoadedRemote: false,
        clearLocal: undefined,
    });

    const { remote } = persistOptions;
    const remotePersistence = persistOptions.persistRemote || observableConfiguration?.persistRemote;
    const localState: LocalState = { tempDisableSaveRemote: false };

    loadLocal(obs, persistOptions, obsState, localState);

    if (remote) {
        if (!remotePersistence) {
            throw new Error('Remote persistence is not configured');
        }
        // Ensure there's only one instance of the persistence plugin
        if (!mapPersistences.has(remotePersistence)) {
            mapPersistences.set(remotePersistence, new remotePersistence());
        }
        localState.persistenceRemote = mapPersistences.get(remotePersistence) as ObservablePersistRemote;

        obsState.isLoadedLocal.onTrue(() => {
            localState.persistenceRemote.listen(
                obs,
                persistOptions,
                () => {
                    obsState.setProp('isLoadedRemote', true);
                },
                onChangeRemote.bind(this, localState)
            );
        });
    }

    obs.onChange(onObsChange.bind(this, obsState, localState, persistOptions));

    return obsState;
}
