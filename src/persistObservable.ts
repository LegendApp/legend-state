import { observableConfiguration } from './configureObservable';
import { removeNullUndefined, replaceKeyInObject, symbolDateModified } from './globals';
import { ObservablePersistLocalStorage } from './local-storage';
import { observable } from './observable';
import { observableBatcher } from './observableBatcher';
import { merge } from './observableFns';
import type {
    Observable,
    ObservableChecker,
    ObservableListenerInfo,
    ObservablePersistLocal,
    ObservablePersistRemote,
    ObservablePersistState,
    PersistOptions,
} from './observableInterfaces';

export const mapPersistences: WeakMap<any, any> = new WeakMap();
const usedNames = new Map<string, true>();
const dateModifiedKey = '@';

let platformDefaultPersistence =
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
    state: LocalState,
    persistOptions: PersistOptions<T>,
    value: T,
    info: ObservableListenerInfo
) {
    const { persistenceLocal, persistenceRemote, tempDisableSaveRemote } = state;

    const local = persistOptions.local;
    if (local) {
        if (!obsState.isLoadedLocal) return;

        persistenceLocal.set(
            local,
            replaceKeyInObject(value as unknown as object, symbolDateModified, dateModifiedKey, /*clone*/ true)
        );
    }

    if (!tempDisableSaveRemote && persistOptions.remote && !persistOptions.remote.readonly) {
        const saved = await persistenceRemote.save(persistOptions, value, info);
        if (saved) {
            if (local) {
                const cur = persistenceLocal.get(local);
                const replaced = replaceKeyInObject(
                    saved as object,
                    symbolDateModified,
                    dateModifiedKey,
                    /*clone*/ false
                );
                const toSave = cur ? merge(cur, replaced) : replaced;

                persistenceLocal.set(local, toSave);
            }
        }
    }
}

function onChangeRemote(state: LocalState, cb: () => void) {
    state.tempDisableSaveRemote = true;

    observableBatcher.begin();

    cb();

    observableBatcher.end();

    state.tempDisableSaveRemote = false;
}

export function persistObservable<T>(obs: ObservableChecker<T>, persistOptions: PersistOptions<T>) {
    const { local, remote } = persistOptions;
    const localPersistence =
        persistOptions.persistLocal || observableConfiguration.persistLocal || platformDefaultPersistence;
    const remotePersistence = persistOptions.persistRemote || observableConfiguration?.persistRemote;
    const state: LocalState = { tempDisableSaveRemote: false };

    let isLoadedLocal = false;
    let clearLocal: () => Promise<void>;

    if (local) {
        if (!localPersistence) {
            throw new Error('Local persistence is not configured');
        }
        if (!mapPersistences.has(localPersistence)) {
            mapPersistences.set(localPersistence, new localPersistence());
        }
        const persistenceLocal = mapPersistences.get(localPersistence) as ObservablePersistLocal;
        state.persistenceLocal = persistenceLocal;

        let value = persistenceLocal.get(local);

        const dateModifiedKey = '@';

        if (process.env.NODE_ENV === 'development') {
            if (usedNames.has(local)) {
                console.error(`Called persist with the same local name multiple times: ${local}`);
                // return;
            }
            usedNames.set(local, true);
        }

        if (value !== null && value !== undefined) {
            replaceKeyInObject(value, dateModifiedKey, symbolDateModified, /*clone*/ false);
            removeNullUndefined(value);
            merge(obs, value);
        }

        clearLocal = () => Promise.resolve(persistenceLocal.delete(local));

        isLoadedLocal = true;
    }
    if (remote) {
        if (!remotePersistence) {
            throw new Error('Remote persistence is not configured');
        }
        if (!mapPersistences.has(remotePersistence)) {
            mapPersistences.set(remotePersistence, new remotePersistence());
        }
        const persistenceRemote = mapPersistences.get(remotePersistence) as ObservablePersistRemote;
        state.persistenceRemote = persistenceRemote;

        persistenceRemote.listen(
            obs,
            persistOptions,
            () => {
                obsState.isLoadedRemote.set(true);
            },
            onChangeRemote.bind(this, state)
        );
    }

    const obsState = observable<ObservablePersistState>({
        isLoadedLocal,
        isLoadedRemote: false,
        clearLocal,
    });

    obs.on('change', onObsChange.bind(this, obsState, state, persistOptions));

    return obsState;
}
