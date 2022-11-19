import {
    batch,
    isEmpty,
    isString,
    mergeIntoObservable,
    observable,
    symbolDateModified,
    tracking,
    when,
} from '@legendapp/state';
import type {
    ClassConstructor,
    ObservableObject,
    ObservablePersistLocal,
    ObservablePersistRemote,
    ObservablePersistState,
    ObservableReadable,
    PersistOptions,
    PersistOptionsLocal,
} from '../observableInterfaces';
import { ObservablePersistLocalStorage } from '../persist-plugins/local-storage';
import { observablePersistConfiguration } from './configureObservablePersistence';
import { removeNullUndefined, replaceKeyInObject } from './persistHelpers';

export const mapPersistences: WeakMap<
    ClassConstructor<ObservablePersistLocal | ObservablePersistRemote>,
    ObservablePersistLocal | ObservablePersistRemote
> = new WeakMap();
const usedNames = new Map<string, true>();
const dateModifiedKey = '@';
const PendingKey = '__legend_pending';

const platformDefaultPersistence =
    typeof window !== 'undefined' && typeof window.localStorage !== undefined
        ? ObservablePersistLocalStorage
        : undefined;

interface LocalState {
    persistenceLocal?: ObservablePersistLocal;
    persistenceRemote?: ObservablePersistRemote;
    pendingChanges?: Record<string, { p: any; v?: any }>;
}

function parseLocalConfig(config: string | PersistOptionsLocal): { table: string; config?: PersistOptionsLocal } {
    return isString(config) ? { table: config } : { table: config.name, config };
}

async function onObsChange<T>(
    obsState: ObservableObject<ObservablePersistState>,
    localState: LocalState,
    persistOptions: PersistOptions<T>,
    value: T,
    getPrevious: () => T,
    changes: {
        path: (string | number)[];
        valueAtPath: any;
        prevAtPath: any;
    }[]
) {
    const { persistenceLocal, persistenceRemote } = localState;

    const local = persistOptions.local;
    const { table, config } = parseLocalConfig(local);
    const tempDisableSaveRemote = tracking.inRemoteChange;
    const saveRemote =
        !tempDisableSaveRemote &&
        persistOptions.remote &&
        !persistOptions.remote.readonly &&
        obsState.isEnabledRemote.peek();

    if (local && obsState.isEnabledLocal.peek()) {
        if (!obsState.isLoadedLocal.peek()) {
            console.error(
                '[legend-state] WARNING: An observable was changed before being loaded from persistence',
                local
            );
            return;
        }

        // If saving remotely convert symbolDateModified to dateModifiedKey before saving locally
        // as persisting may not include symbols correctly
        let localValue = value;
        if (persistOptions.remote) {
            localValue = replaceKeyInObject(
                value as unknown as object,
                symbolDateModified,
                dateModifiedKey,
                /*clone*/ true
            );
            if (saveRemote) {
                for (let i = 0; i < changes.length; i++) {
                    const { path, valueAtPath, prevAtPath } = changes[i];
                    if (path[path.length - 1] === (symbolDateModified as any)) continue;
                    const pathStr = path.join('/');

                    if (!localState.pendingChanges) {
                        localState.pendingChanges = {};
                    }
                    // The value saved in pending should be the previous state before changes,
                    // so don't overwrite it if it already exists
                    if (!localState.pendingChanges[pathStr]) {
                        localState.pendingChanges[pathStr] = { p: prevAtPath ?? null };
                    }
                    localState.pendingChanges[pathStr].v = valueAtPath;
                }

                if (localState.pendingChanges && localValue) {
                    localValue[PendingKey] = localState.pendingChanges;
                }
            }
        }

        // Save to local persistence
        if (persistenceLocal.set && !changes.find((change) => change.path.length === 0)) {
            for (let i = 0; i < changes.length; i++) {
                const { path } = changes[i];
                const key = path[0] as string;
                persistenceLocal.set(table, key, localValue[key], config);
            }
        } else {
            persistenceLocal.setTable(table, localValue, config);
        }
    }

    if (saveRemote) {
        for (let i = 0; i < changes.length; i++) {
            const { path, valueAtPath, prevAtPath } = changes[i];
            if (path[path.length - 1] === (symbolDateModified as any)) continue;
            const pathStr = path.join('/');

            // Save to remote persistence and get the remote value from it. Some providers (like Firebase) will return a
            // server value different than the saved value (like Firebase has server timestamps for dateModified)
            persistenceRemote.save(persistOptions, value, path, valueAtPath, prevAtPath).then((saved) => {
                if (local) {
                    let toSave = persistenceLocal.getTable(table, config);
                    let didDelete = false;
                    if (toSave?.[PendingKey]?.[pathStr]) {
                        didDelete = true;
                        // Remove pending from the saved object
                        delete toSave[PendingKey][pathStr];
                        if (isEmpty(toSave[PendingKey])) {
                            delete toSave[PendingKey];
                        }
                        // Remove pending from local state
                        delete localState.pendingChanges[pathStr];
                    }
                    // Only the latest save will return a value so that it saves back to local persistence once
                    if (saved !== undefined) {
                        // Replace the dateModifiedKey and remove null/undefined before saving
                        const replaced = replaceKeyInObject(
                            removeNullUndefined(saved as object),
                            symbolDateModified,
                            dateModifiedKey,
                            /*clone*/ false
                        );
                        toSave = toSave ? mergeIntoObservable(toSave, replaced) : replaced;
                    }
                    if (saved !== undefined || didDelete) {
                        const key = path[0] as string;
                        if (path.length && persistenceLocal.set) {
                            persistenceLocal.set(table, key, toSave[key], config);
                        } else {
                            persistenceLocal.setTable(table, toSave, config);
                        }
                    }
                }
            });
        }
    }
}

function onChangeRemote(cb: () => void) {
    // Remote changes should only update local state
    tracking.inRemoteChange = true;

    try {
        batch(cb);
    } finally {
        tracking.inRemoteChange = false;
    }
}

async function loadLocal<T>(
    obs: ObservableReadable<T>,
    persistOptions: PersistOptions,
    obsState: ObservableObject<ObservablePersistState>,
    localState: LocalState
) {
    const { local, remote } = persistOptions;
    const localPersistence: ClassConstructor<ObservablePersistLocal> =
        persistOptions.persistLocal || observablePersistConfiguration.persistLocal || platformDefaultPersistence;

    if (local) {
        const { table, config } = parseLocalConfig(local);
        // Warn on duplicate usage of local names
        if (process.env.NODE_ENV === 'development') {
            if (usedNames.has(table)) {
                console.error(`[legend-state] Called persist with the same local name multiple times: ${table}`);
            }
            usedNames.set(table, true);
        }

        if (!localPersistence) {
            throw new Error('Local persistence is not configured');
        }
        // Ensure there's only one instance of the persistence plugin
        if (!mapPersistences.has(localPersistence)) {
            const persistenceLocal = new localPersistence();
            if (persistenceLocal.initialize) {
                await persistenceLocal.initialize?.(observablePersistConfiguration.persistLocalOptions);
            }
            mapPersistences.set(localPersistence, persistenceLocal);
        }
        const persistenceLocal = (localState.persistenceLocal = mapPersistences.get(
            localPersistence
        ) as ObservablePersistLocal);

        // If persistence has an asynchronous load, wait for it
        if (persistenceLocal.loadTable) {
            await persistenceLocal.loadTable(table, config);
        }

        // Get the value from state
        let value = persistenceLocal.getTable(table, config);

        if (value !== undefined) {
            const pending = value[PendingKey];
            if (pending !== undefined) {
                delete value[PendingKey];
                localState.pendingChanges = pending;
            }
        }

        // Merge the data from local persistence into the default state
        if (value !== null && value !== undefined) {
            if (remote) {
                replaceKeyInObject(value, dateModifiedKey, symbolDateModified, /*clone*/ false);
            }
            mergeIntoObservable(obs, value);
        }

        obsState.get().clearLocal = () => persistenceLocal.deleteTable(table, config);
    }
    obsState.isLoadedLocal.set(true);
}

export function persistObservable<T>(obs: ObservableReadable<T>, persistOptions: PersistOptions<T>) {
    const obsState = observable<ObservablePersistState>({
        isLoadedLocal: false,
        isLoadedRemote: false,
        isEnabledLocal: true,
        isEnabledRemote: true,
        clearLocal: undefined,
        sync: () => Promise.resolve(),
    });

    const { remote, local } = persistOptions;
    const remotePersistence = persistOptions.persistRemote || observablePersistConfiguration?.persistRemote;
    const localState: LocalState = {};

    if (local) {
        loadLocal(obs, persistOptions, obsState, localState);
    }

    if (remote) {
        if (!remotePersistence) {
            throw new Error('Remote persistence is not configured');
        }
        // Ensure there's only one instance of the persistence plugin
        if (!mapPersistences.has(remotePersistence)) {
            mapPersistences.set(remotePersistence, new remotePersistence());
        }
        localState.persistenceRemote = mapPersistences.get(remotePersistence) as ObservablePersistRemote;

        let isSynced = false;
        const sync = async () => {
            if (!isSynced) {
                isSynced = true;
                localState.persistenceRemote.listen(
                    obs,
                    persistOptions,
                    () => {
                        obsState.isLoadedRemote.set(true);
                    },
                    onChangeRemote
                );

                await when(obsState.isLoadedRemote);

                const pending = localState.pendingChanges;
                if (pending) {
                    Object.keys(pending).forEach((key) => {
                        const path = key.split('/');
                        const { p, v } = pending[key];
                        // TODO getPrevious if any remote persistence layers need it
                        onObsChange(obsState, localState, persistOptions, obs.peek(), () => undefined, [
                            { path, valueAtPath: v, prevAtPath: p },
                        ]);
                    });
                }
            }
        };

        if (remote.manual) {
            obsState.assign({ sync });
        } else {
            when(() => !local || obsState.isLoadedLocal.get(), sync);
        }
    }

    when(obsState.isLoadedLocal, () => {
        obs.onChange(onObsChange.bind(this, obsState, localState, persistOptions));
    });

    return obsState;
}
