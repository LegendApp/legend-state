import { config } from '../configureObservable';
import { removeNullUndefined, replaceKeyInObject, symbolDateModified } from '../globals';
import { observable } from '../observable';
import { observableBatcher } from '../observableBatcher';
import { listenToObservable, mergeDeep } from '../observableFns';
import type {
    Observable,
    ObservableChecker,
    ObservablePersistLocal,
    ObservablePersistRemote,
    ObservablePersistState,
    ObsListenerInfo,
    PersistOptions,
} from '../types/observableInterfaces';
import { ObservablePersistLocalStorage } from './web';

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
    info: ObsListenerInfo
) {
    const { persistenceLocal, persistenceRemote, tempDisableSaveRemote } = state;

    const local = persistOptions.local;
    if (local) {
        if (!obsState.isLoadedLocal) return;

        persistenceLocal.setValue(
            local,
            replaceKeyInObject(value as unknown as object, symbolDateModified, dateModifiedKey, /*clone*/ true)
        );
    }

    if (!tempDisableSaveRemote && persistOptions.remote && !persistOptions.remote.readonly) {
        const saved = await persistenceRemote.save(persistOptions, value, info);
        if (saved) {
            if (local) {
                const cur = persistenceLocal.getValue(local);
                const replaced = replaceKeyInObject(
                    saved as object,
                    symbolDateModified,
                    dateModifiedKey,
                    /*clone*/ false
                );
                const toSave = cur ? mergeDeep(cur, replaced) : replaced;

                persistenceLocal.setValue(local, toSave);
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
        persistOptions.localPersistence || config.persist?.localPersistence || platformDefaultPersistence;
    const remotePersistence = persistOptions.remotePersistence || config.persist?.remotePersistence;
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

        let value = persistenceLocal.getValue(local);

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
            mergeDeep(obs, value);
        }

        clearLocal = () => Promise.resolve(persistenceLocal.deleteById(local));

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

    listenToObservable(obs, onObsChange.bind(this, obsState, state, persistOptions));

    return obsState;
}
