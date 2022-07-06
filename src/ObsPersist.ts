import { config } from './configureObsProxy';
import { replaceKeyInObject, symbolDateModified } from './globals';
import { ObsBatcher } from './ObsBatcher';
import { obsProxy } from './ObsProxy';
import { listenToObs } from './ObsProxyFns';
import {
    ObsListenerInfo,
    ObsPersistLocal,
    ObsPersistRemote,
    ObsPersistState,
    ObsProxy,
    ObsProxyChecker,
    PersistOptions,
    PersistOptionsRemote,
} from './ObsProxyInterfaces';

/** @internal */
export const mapPersistences: WeakMap<any, any> = new WeakMap();
const usedNames = new Map<string, true>();

interface LocalState {
    tempDisableSaveRemote: boolean;
    persistenceLocal?: ObsPersistLocal;
    persistenceRemote?: ObsPersistRemote;
}

async function onObsChange<T>(
    proxyState: ObsProxy<ObsPersistState>,
    state: LocalState,
    obs: ObsProxy<T>,
    persistOptions: PersistOptions<T>,
    value: T,
    info: ObsListenerInfo
) {
    const { persistenceLocal, persistenceRemote, tempDisableSaveRemote } = state;

    if (persistOptions.local) {
        // TODO: What to do? Queue this until after loaded? Or throw error?
        if (!proxyState.isLoadedLocal) return;
        persistenceLocal.setValue(persistOptions.local, value);
    }

    if (!tempDisableSaveRemote && persistOptions.remote && !persistOptions.remote.readonly) {
        const saved = await persistenceRemote.save(persistOptions.remote, value, info);
        if (saved) {
            if (persistOptions.local) {
                persistenceLocal.setValue(
                    persistOptions.local,
                    replaceKeyInObject(saved as object, symbolDateModified, '@')
                );
            }
        }
    }
}

function onChangeRemote(state: LocalState, cb: () => void) {
    state.tempDisableSaveRemote = true;

    ObsBatcher.beginBatch();

    cb();

    ObsBatcher.endBatch();

    state.tempDisableSaveRemote = false;
}

export function obsPersist<T>(obs: ObsProxyChecker<T>, persistOptions: PersistOptions<T>) {
    const { local, remote } = persistOptions;
    const localPersistence = persistOptions.localPersistence || config.persist?.localPersistence;
    const remotePersistence = persistOptions.remotePersistence || config.persist?.remotePersistence;
    const state: LocalState = { tempDisableSaveRemote: false };

    let isLoadedLocal = false;
    let clearLocal: () => Promise<void>;

    if (local) {
        if (!mapPersistences.has(localPersistence)) {
            mapPersistences.set(localPersistence, new localPersistence());
        }
        const persistenceLocal = mapPersistences.get(localPersistence) as ObsPersistLocal;
        state.persistenceLocal = persistenceLocal;

        const value = persistenceLocal.getValue(local);

        if (process.env.NODE_ENV === 'development') {
            if (usedNames.has(local)) {
                console.error(`Called persist with the same local name multiple times: ${local}`);
                // return;
            }
            usedNames.set(local, true);
        }

        if (value !== null && value !== undefined) {
            replaceKeyInObject(value, '@', symbolDateModified);
            obs.assign(value);
        }

        clearLocal = () => Promise.resolve(persistenceLocal.deleteById(local));

        isLoadedLocal = true;
    }
    if (remote) {
        if (!mapPersistences.has(remotePersistence)) {
            mapPersistences.set(remotePersistence, new remotePersistence());
        }
        const persistenceRemote = mapPersistences.get(remotePersistence) as ObsPersistRemote;
        state.persistenceRemote = persistenceRemote;

        persistenceRemote.listen(
            obs,
            remote as PersistOptionsRemote,
            () => {
                proxyState.isLoadedRemote.set(true);
            },
            onChangeRemote.bind(this, state)
        );
    }

    const proxyState = obsProxy<ObsPersistState>({
        isLoadedLocal,
        isLoadedRemote: false,
        clearLocal,
    });

    listenToObs(obs, onObsChange.bind(this, proxyState, state, obs, persistOptions));

    return proxyState;
}
