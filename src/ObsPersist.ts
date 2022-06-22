import { isNumber, isObject } from '@legendapp/tools';
import { ObsPersistLocal, ObsPersistLocalAsync, ObsPersistRemote } from './ObsProxyInterfaces';
import { ObsBatcher } from './ObsBatcher';
import { listenToObs } from './ObsProxyFns';
import { ObsListenerInfo, ObsProxy, PersistOptions } from './ObsProxyInterfaces';

const mapPersistences: WeakMap<any, any> = new WeakMap();
const usedNames = new Map<string, true>();

interface LocalState {
    tempDisableSaveRemote: boolean;
    isLoadedLocal: boolean;
    isLoadedRemote: boolean;
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
    state: LocalState,
    obs: ObsProxy<T>,
    persistOptions: PersistOptions<T>,
    value: T,
    info: ObsListenerInfo
) {
    if (!state.isLoadedLocal) return;

    const { persistenceLocal, persistenceRemote, tempDisableSaveRemote } = state;

    if (persistOptions.local) {
        persistenceLocal.setValue(persistOptions.local, value);
    }

    if (!tempDisableSaveRemote && persistOptions.remote && !persistOptions.remote.readonly) {
        const saved = await persistenceRemote.save(value, info);
        // const saved = await persistenceRemote.setValue(value, this.persistOptions.remote, {
        //     changedKey,
        //     changedProperty,
        // });
        // if (this.persistOptions.local) {
        //     const name = this.persistOptions.local;
        //     persistenceLocal.setValue(name, value);
        // }
    }
}

function onChangeRemote(state: LocalState, obs: ObsProxy, value: any) {
    state.tempDisableSaveRemote = true;

    ObsBatcher.beginBatch();

    console.log(value);

    obs.value = value;

    ObsBatcher.endBatch();

    state.tempDisableSaveRemote = false;
}

async function _obsPersist<T>(obs: ObsProxy<T>, persistOptions: PersistOptions<T>) {
    const { local, localPersistence, remote, remotePersistence } = persistOptions;
    const state: LocalState = { isLoadedLocal: false, isLoadedRemote: false, tempDisableSaveRemote: false };
    let dateModified: number;

    listenToObs(obs, onObsChange.bind(this, state, obs, persistOptions));

    if (local) {
        if (!mapPersistences.has(localPersistence)) {
            mapPersistences.set(localPersistence, new localPersistence());
        }
        const persistenceLocal = mapPersistences.get(localPersistence) as ObsPersistLocal;
        state.persistenceLocal = persistenceLocal;
        if ((persistenceLocal as ObsPersistLocalAsync).preload) {
            await (persistenceLocal as ObsPersistLocalAsync).preload(local);
        }

        const value = persistenceLocal.getValue(local);

        const max = { v: 0 };
        recursiveFindMaxModified(value, max);
        if (max.v > 0) {
            dateModified = max.v;
        }
        if (process.env.NODE_ENV === 'development') {
            if (usedNames.has(local)) {
                console.error(`Called persist with the same local name multiple times: ${local}`);
                return;
            }
            usedNames.set(local, true);
        }

        if (value !== null && value !== undefined) {
            obs.value = value;
        }

        state.isLoadedLocal = true;
    }
    if (persistOptions.remote) {
        if (!mapPersistences.has(remotePersistence)) {
            mapPersistences.set(remotePersistence, new remotePersistence());
        }
        const persistenceRemote = mapPersistences.get(remotePersistence) as ObsPersistRemote;
        state.persistenceRemote = persistenceRemote;

        persistenceRemote.listen(
            remote,
            isNumber(dateModified) ? dateModified : undefined,
            () => (state.isLoadedRemote = true),
            onChangeRemote.bind(this, state, obs)
        );
    }
}

export function obsPersist<T>(obs: ObsProxy<T>, persistOptions: PersistOptions<T>) {
    _obsPersist(obs, persistOptions);
    return obs;
}
