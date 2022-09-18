import { when, mergeIntoObservable, observable, symbolDateModified, batch } from '@legendapp/state';
import type {
    ObservableObject,
    ObservablePersistLocal,
    ObservablePersistRemote,
    ObservablePersistState,
    ObservableReadable,
    PersistOptions,
} from '../observableInterfaces';
import { observablePersistConfiguration } from './configureObservablePersistence';
import { ObservablePersistLocalStorage } from './local-storage';
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
    obsState: ObservableObject<ObservablePersistState>,
    localState: LocalState,
    persistOptions: PersistOptions<T>,
    value: T,
    getPrevious: () => T,
    path: (string | number)[],
    valueAtPath: any,
    prevAtPath: any
) {
    const { persistenceLocal, persistenceRemote, tempDisableSaveRemote } = localState;

    const local = persistOptions.local;
    const saveRemote = !tempDisableSaveRemote && persistOptions.remote && !persistOptions.remote.readonly;
    if (local) {
        if (!obsState.isLoadedLocal) {
            console.error(
                '[legend-state]: WARNING: An observable was changed before being loaded from persistence',
                local
            );
            return;
        }

        // If saving remotely convert symbolDateModified to dateModifiedKey before saving locally
        // as peristing may not include symbols correctly
        const localValue = persistOptions.remote
            ? replaceKeyInObject(value as unknown as object, symbolDateModified, dateModifiedKey, /*clone*/ true)
            : value;

        // Save to local persistence
        persistenceLocal.set(local, localValue);
    }

    if (saveRemote) {
        // Save to remote persistence and get the remote value from it. Some providers (like Firebase) will return a
        // server value different than the saved value (like Firebase has server timestamps for dateModified)
        const saved = await persistenceRemote.save(persistOptions, value, getPrevious, path, valueAtPath, prevAtPath);
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

    batch(cb);

    localState.tempDisableSaveRemote = false;
}

async function loadLocal(
    obs: ObservableReadable,
    persistOptions: PersistOptions,
    obsState: ObservableObject<ObservablePersistState>,
    localState: LocalState
) {
    const { local, remote } = persistOptions;
    const localPersistence =
        persistOptions.persistLocal || observablePersistConfiguration.persistLocal || platformDefaultPersistence;

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
                console.error(`[legend-state]: Called persist with the same local name multiple times: ${local}`);
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

        obsState.get().clearLocal = () => persistenceLocal.delete(local);
    }
    obsState.isLoadedLocal.set(true);
}

export function persistObservable<T>(obs: ObservableReadable<T>, persistOptions: PersistOptions<T>) {
    const obsState = observable<ObservablePersistState>({
        isLoadedLocal: false,
        isLoadedRemote: false,
        clearLocal: undefined,
    });

    const { remote } = persistOptions;
    const remotePersistence = persistOptions.persistRemote || observablePersistConfiguration?.persistRemote;
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

        when(
            () => obsState.isLoadedLocal,
            () => {
                localState.persistenceRemote.listen(
                    obs,
                    persistOptions,
                    () => {
                        obsState.isLoadedRemote.set(true);
                    },
                    onChangeRemote.bind(this, localState)
                );
            }
        );
    }

    obs.onChange(onObsChange.bind(this, obsState, localState, persistOptions));

    return obsState;
}
