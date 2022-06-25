import { isNumber, isObject } from '@legendapp/tools';
import {
    ObsPersistLocal,
    ObsPersistLocalAsync,
    ObsPersistRemote,
    ObsPersistState,
    ObsProxyChecker,
    ObsProxyUnsafe,
    PersistOptionsRemote,
    ProxyValue,
} from './ObsProxyInterfaces';
import { ObsBatcher } from './ObsBatcher';
import { listenToObs } from './ObsProxyFns';
import { ObsListenerInfo, ObsProxy, PersistOptions } from './ObsProxyInterfaces';
import { obsProxy } from './ObsProxy';
import { replaceKeyInObject, symbolDateModified } from './globals';

/** @internal */
export const mapPersistences: WeakMap<any, any> = new WeakMap();
const usedNames = new Map<string, true>();

interface LocalState {
    tempDisableSaveRemote: boolean;
    persistenceLocal?: ObsPersistLocal;
    persistenceRemote?: ObsPersistRemote;
}

function recursiveFindMaxModified(obj: object, max: { v: number }) {
    if (isObject(obj)) {
        if (isNumber(obj['@'])) {
            max.v = Math.max(max.v, obj['@']);
            // delete obj['@'];
        }
        Object.keys(obj).forEach((key) => key !== '@' && recursiveFindMaxModified(obj[key], max));
    }
}

async function onObsChange<T>(
    proxyState: ObsProxy<ObsPersistState>,
    state: LocalState,
    obs: ObsProxy<T>,
    persistOptions: PersistOptions<T>,
    value: T,
    info: ObsListenerInfo
) {
    if (!proxyState.isLoadedLocal) return;

    const { persistenceLocal, persistenceRemote, tempDisableSaveRemote } = state;

    if (persistOptions.local) {
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

function _obsPersist<T extends object>(
    proxyState: ObsProxy<ObsPersistState>,
    obs: ObsProxyChecker<T>,
    persistOptions: PersistOptions<T>
) {
    const { local, localPersistence, remote, remotePersistence } = persistOptions;
    const state: LocalState = { tempDisableSaveRemote: false };

    listenToObs(obs, onObsChange.bind(this, proxyState, state, obs, persistOptions));

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
                return;
            }
            usedNames.set(local, true);
        }

        if (value !== null && value !== undefined) {
            obs.set(value);
        }

        proxyState.set('isLoadedLocal', true);
    }
    if (remote) {
        if (!mapPersistences.has(remotePersistence)) {
            mapPersistences.set(remotePersistence, new remotePersistence());
        }
        const persistenceRemote = mapPersistences.get(remotePersistence) as ObsPersistRemote;
        state.persistenceRemote = persistenceRemote;

        persistenceRemote.listen(
            obs,
            remote as PersistOptionsRemote<object>,
            () => {
                proxyState.set('isLoadedRemote', true);
            },
            onChangeRemote.bind(this, state)
        );
    }
}

export function obsPersist<T extends object>(obs: ObsProxyChecker<T>, persistOptions: PersistOptions<T>) {
    const proxyState = obsProxy<ObsPersistState>({ isLoadedLocal: false, isLoadedRemote: false });
    _obsPersist(proxyState, obs, persistOptions);
    return proxyState;
}
