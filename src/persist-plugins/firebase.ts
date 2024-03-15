import {
    Observable,
    ObservablePersistRemoteClass,
    ObservablePersistRemoteGetParams,
    ObservablePersistRemoteSetParams,
    ObservablePrimitive,
    ObservableReadable,
    PersistOptions,
    QueryByModified,
    TypeAtPath,
    batch,
    constructObjectWithPath,
    deconstructObjectWithPath,
    hasOwnProperty,
    internal,
    isArray,
    isFunction,
    isObject,
    mergeIntoObservable,
    observable,
    observablePrimitive,
    setAtPath,
    when,
    whenReady,
} from '@legendapp/state';
import { internal as internalPersist, transformObject, transformPath } from '@legendapp/state/persist';
import { getAuth, type User } from 'firebase/auth';
import type { DataSnapshot } from 'firebase/database';
import {
    DatabaseReference,
    Unsubscribe,
    getDatabase,
    onChildAdded,
    onChildChanged,
    onValue,
    orderByChild,
    query,
    ref,
    serverTimestamp,
    startAt,
    update,
} from 'firebase/database';
const { symbolDelete } = internal;
const { observablePersistConfiguration } = internalPersist;

function clone(obj: any) {
    return obj === undefined || obj === null ? obj : JSON.parse(JSON.stringify(obj));
}
function getDateModifiedKey(dateModifiedKey: string | undefined) {
    return dateModifiedKey || observablePersistConfiguration.remoteOptions?.dateModifiedKey || '@';
}

interface FirebaseFns {
    isInitialized: () => boolean;
    getCurrentUser: () => string | undefined;
    ref: (path: string) => DatabaseReference;
    orderByChild: (ref: any, child: string, startAt: number) => any;
    once: (query: any, callback: (snapshot: DataSnapshot) => unknown, onError: (error: Error) => void) => () => void;
    onChildAdded: (
        query: any,
        callback: (snapshot: DataSnapshot) => unknown,
        cancelCallback?: (error: Error) => unknown,
    ) => () => void;
    onChildChanged: (
        query: any,
        callback: (snapshot: DataSnapshot) => unknown,
        cancelCallback?: (error: Error) => unknown,
    ) => () => void;
    serverTimestamp: () => any;
    update: (object: object) => Promise<void>;
    onAuthStateChanged: (cb: (user: User | null) => void) => void;
}

type LocalState<T> = { changes: object | T; timeout?: any };

const symbolSaveValue = Symbol('___obsSaveValue');

interface SaveInfo {
    [symbolSaveValue]: any;
    adjusted?: boolean;
}

type SaveInfoDictionary<T = any> = {
    [K in keyof T]: SaveInfo | SaveInfoDictionary<T[K]>;
};

interface PendingSaves {
    options: PersistOptions;
    saves: SaveInfoDictionary;
}

interface SaveState {
    timeout?: any;
    pendingSaves: Map<string, PendingSaves>;
    savingSaves?: Map<string, PendingSaves>;
    eventSaved?: ObservablePrimitive<true | Error | undefined>;
    numSavesPending: Observable<number>;
    pendingSaveResults: Map<
        string,
        {
            saved: {
                value: any;
                path: string[];
                pathTypes: TypeAtPath[];
                dateModified: number | undefined;
                dateModifiedKey: string | undefined;
                dateModifiedKeyOption: string | undefined;
                onChange: ObservablePersistRemoteGetParams<any>['onChange'];
            }[];
        }
    >;
}

interface LoadStatus {
    startedLoading: boolean;
    numLoading: number;
    numWaitingCanSave: number;
}

class ObservablePersistFirebaseBase implements ObservablePersistRemoteClass {
    protected _batch: Record<string, any> = {};
    protected fns: FirebaseFns;
    private _pathsLoadStatus = observable<Record<string, LoadStatus>>({});
    private SaveTimeout;
    private user: Observable<string | undefined | null>;
    private listenErrors: Map<
        any,
        {
            params: ObservablePersistRemoteGetParams<any>;
            path: string[];
            pathTypes: TypeAtPath[];
            dateModified: number | undefined;
            queryByModified: QueryByModified<any> | undefined;
            unsubscribes: (() => void)[];
            retry: number;
            saveState: SaveState;
            onLoadParams: { waiting: number; onLoad: () => void };
            status$: Observable<LoadStatus>;
        }
    > = new Map();
    private saveStates = new Map<ObservableReadable<any>, SaveState>();

    constructor(fns: FirebaseFns) {
        this.fns = fns;
        this.user = observablePrimitive();
        this.SaveTimeout = observablePersistConfiguration?.remoteOptions?.saveTimeout ?? 500;

        if (this.fns.isInitialized()) {
            this.fns.onAuthStateChanged((user) => {
                this.user.set(user?.uid);
            });
        } else if (
            process.env.NODE_ENV === 'development' &&
            (typeof window !== 'undefined' || (typeof navigator !== 'undefined' && navigator.product === 'ReactNative'))
        ) {
            // Warn only in web or react-native. If running on a server this shouldn't work.
            console.warn('[legend-state] Firebase is not initialized. Remote persistence will not work.');
        }
    }
    public async get<T>(params: ObservablePersistRemoteGetParams<T>) {
        const { obs, options } = params;
        const { remote } = options;
        if (!remote || !remote.firebase) {
            // If the plugin is set globally but it has no firebase options this plugin can't do anything
            return;
        }
        const {
            firebase: { refPath },
            waitForGet,
        } = remote;

        const { requireAuth, queryByModified } = options.remote!.firebase!;

        // If requireAuth wait for user to be signed in
        if (requireAuth) {
            await whenReady(this.user);
        }

        // If waitForGet wait for it
        if (waitForGet) {
            await whenReady(waitForGet);
        }

        const saveState: SaveState = {
            pendingSaveResults: new Map(),
            pendingSaves: new Map(),
            numSavesPending: observable(0),
        };
        this.saveStates.set(obs, saveState);

        const pathFirebase = refPath(this.fns.getCurrentUser());

        const status$ = this._pathsLoadStatus[pathFirebase].set({
            startedLoading: false,
            numLoading: 0,
            numWaitingCanSave: 0,
        });

        const onLoadParams = {
            waiting: 0,
            onLoad: () => {
                onLoadParams.waiting--;
                if (onLoadParams.waiting === 0) {
                    params.onGet();
                }
            },
        };

        if (isObject(queryByModified)) {
            this.iterateListen(obs, params, saveState, [], [], queryByModified, onLoadParams, status$);
        } else {
            const dateModified = queryByModified === true ? params.dateModified! : undefined;

            this._listen(obs, params, saveState, [], [], queryByModified, dateModified, onLoadParams, status$);
        }
    }
    private iterateListen<T>(
        obs: ObservableReadable<any>,
        params: ObservablePersistRemoteGetParams<T>,
        saveState: SaveState,
        path: string[],
        pathTypes: TypeAtPath[],
        queryByModified: QueryByModified<any>,
        onLoadParams: { waiting: number; onLoad: () => void },
        status$: Observable<LoadStatus>,
    ) {
        const { options } = params;

        const { ignoreKeys } = options.remote!.firebase!;
        Object.keys(obs).forEach((key) => {
            if (!ignoreKeys || !ignoreKeys.includes(key)) {
                const o = obs[key as keyof typeof obs] as ObservableReadable<any>;
                const q =
                    queryByModified[key as keyof typeof queryByModified] || (queryByModified as { '*': boolean })['*'];
                const pathChild = path.concat(key);
                const pathTypesChild = pathTypes.concat(isArray(o.peek()) ? 'array' : 'object');
                let dateModified: number | undefined = undefined;

                if (isObject(q)) {
                    this.iterateListen(o, params, saveState, pathChild, pathTypesChild, q, onLoadParams, status$);
                } else {
                    if (q === true || q === '*') {
                        dateModified = params.dateModified!;
                    }

                    this._listen(
                        o,
                        params,
                        saveState,
                        pathChild,
                        pathTypesChild,
                        queryByModified,
                        dateModified,
                        onLoadParams,
                        status$,
                    );
                }
            }
        });
    }
    private retryListens() {
        // If a listen failed but save succeeded, the save should have fixed
        // the permission problem so try again
        this.listenErrors.forEach((listenError) => {
            const {
                params,
                path,
                pathTypes,
                dateModified,
                queryByModified,
                unsubscribes,
                saveState,
                onLoadParams,
                status$,
            } = listenError;
            listenError.retry++;
            if (listenError.retry < 10) {
                unsubscribes.forEach((cb) => cb());
                this._listen(
                    params.obs,
                    params,
                    saveState,
                    path,
                    pathTypes,
                    queryByModified,
                    dateModified,
                    onLoadParams,
                    status$,
                );
            } else {
                this.listenErrors.delete(listenError);
            }
        });
    }
    private async _listen<T>(
        obs: ObservableReadable<any>,
        params: ObservablePersistRemoteGetParams<T>,
        saveState: SaveState,
        path: string[],
        pathTypes: TypeAtPath[],
        queryByModified: QueryByModified<any> | undefined,
        dateModified: number | undefined,
        onLoadParams: { waiting: number; onLoad: () => void },
        status$: Observable<LoadStatus>,
    ) {
        const { options, onError } = params;
        const { fieldTransforms, allowSetIfError, firebase, dateModifiedKey: dateModifiedKeyOption } = options.remote!;
        const { refPath, query, mode } = firebase!;

        let didError = false;
        const dateModifiedKey = getDateModifiedKey(dateModifiedKeyOption);

        const originalPath = path;
        if (fieldTransforms && path.length) {
            path = transformPath(path, pathTypes, fieldTransforms);
        }

        const pathFirebase = refPath(this.fns.getCurrentUser()) + path.join('/');

        let ref = this.fns.ref(pathFirebase);
        if (query) {
            ref = query(ref) as DatabaseReference;
        }
        if (dateModified && !isNaN(dateModified)) {
            ref = this.fns.orderByChild(ref, dateModifiedKey, dateModified + 1);
        }

        const unsubscribes: (() => void)[] = [];

        status$.numLoading.set((v) => v + 1);
        status$.numWaitingCanSave.set((v) => v + 1);

        const _onError = (err: Error) => {
            if (!didError) {
                didError = true;
                const existing = this.listenErrors.get(obs);
                if (existing) {
                    existing.retry++;
                } else {
                    this.listenErrors.set(obs, {
                        params,
                        path: originalPath,
                        pathTypes,
                        dateModified,
                        queryByModified,
                        unsubscribes,
                        retry: 0,
                        saveState,
                        onLoadParams,
                        status$,
                    });
                    params.state.error.set(err);
                    onError?.(err);
                    if (allowSetIfError) {
                        status$.numWaitingCanSave.set((v) => v - 1);
                    }
                }
            }
        };

        if (mode !== 'once') {
            const localState: LocalState<T> = { changes: {} as T };
            const cb = this._onChange.bind(
                this,
                path,
                pathTypes,
                pathFirebase,
                dateModifiedKey,
                dateModifiedKeyOption,
                params as ObservablePersistRemoteGetParams<any>,
                localState,
                saveState,
                status$,
            );
            unsubscribes.push(this.fns.onChildAdded(ref, cb));
            unsubscribes.push(this.fns.onChildChanged(ref, cb));
        }

        onLoadParams.waiting++;

        unsubscribes.push(
            this.fns.once(
                ref,
                this._onceValue.bind(
                    this,
                    path,
                    pathTypes,
                    pathFirebase,
                    dateModifiedKey,
                    dateModifiedKeyOption,
                    queryByModified,
                    onLoadParams.onLoad,
                    params as ObservablePersistRemoteGetParams<any>,
                    status$,
                ),
                _onError,
            ),
        );
    }
    private _updatePendingSave(path: string[], value: object, pending: SaveInfoDictionary) {
        if (path.length === 0) {
            pending[symbolSaveValue as any] = value as any;
        } else if (pending[symbolSaveValue as any]) {
            pending[symbolSaveValue as any] = mergeIntoObservable(pending[symbolSaveValue as any], value);
        } else {
            const p = path[0];
            const v = (value as any)[p];
            const pendingChild = pending[p] as any;

            // If already have a save info here then don't need to go deeper on the path. Just overwrite the value.
            if (pendingChild && pendingChild[symbolSaveValue] !== undefined) {
                const pendingSaveValue = pendingChild[symbolSaveValue];
                pendingChild[symbolSaveValue] =
                    isArray(pendingSaveValue) || isObject(pendingSaveValue)
                        ? mergeIntoObservable(pendingSaveValue, v)
                        : v;
            } else {
                // 1. If nothing here
                // 2. If other strings here
                if (!pending[p]) {
                    pending[p] = {};
                }
                if (path.length > 1) {
                    this._updatePendingSave(path.slice(1), v, pending[p] as SaveInfoDictionary);
                } else {
                    pending[p] = { [symbolSaveValue]: v };
                }
            }
        }
    }
    public async set<T>({ options, changes, obs }: ObservablePersistRemoteSetParams<T>): Promise<
        | {
              changes?: object;
              dateModified?: number;
              pathStrs?: string[];
          }
        | undefined
    > {
        const { remote } = options;
        // If the plugin is set globally but it has no firebase options this plugin can't do anything
        if (!remote || !remote.firebase) {
            return;
        }
        const { waitForSet, saveTimeout, log, firebase } = remote;

        const { requireAuth, refPath: refPathFn } = firebase;

        if (requireAuth) {
            await whenReady(this.user);
        }

        const refPath = refPathFn(this.fns.getCurrentUser());

        const status$ = this._pathsLoadStatus[refPath];
        if (status$.numWaitingCanSave.peek() > 0) {
            // Wait for all listened paths to load before we can save
            await when(() => status$.numWaitingCanSave.get() < 1);
        }

        if (waitForSet) {
            const waitFor = isFunction(waitForSet) ? waitForSet({ changes, value: obs.peek() }) : waitForSet;
            if (waitFor) {
                await when(waitFor);
            }
        }

        const saveState = this.saveStates.get(obs)!;

        // Don't start a save until all outstanding saves are finished
        await when(() => saveState.numSavesPending.get() === 0);

        const { pendingSaveResults, pendingSaves } = saveState;

        if (!pendingSaves.has(refPath)) {
            pendingSaves.set(refPath, { options, saves: {} });
            pendingSaveResults.set(refPath, { saved: [] });
        }
        const pending = pendingSaves.get(refPath)!.saves;

        log?.('verbose', 'Saving', changes);

        for (let i = 0; i < changes.length; i++) {
            let { valueAtPath } = changes[i];
            const { pathTypes, path } = changes[i];
            if (valueAtPath === undefined) {
                valueAtPath = null;
            }

            const value = constructObjectWithPath(path as string[], pathTypes, clone(valueAtPath)) as unknown as T;
            const pathCloned = path.slice() as string[];

            this._updatePendingSave(pathCloned, value as unknown as object, pending);
        }

        if (!saveState.eventSaved) {
            saveState.eventSaved = observablePrimitive();
        }
        // Keep the current eventSaved. This will get reassigned once the timeout activates.
        const eventSaved = saveState.eventSaved;

        const timeout = saveTimeout ?? this.SaveTimeout;

        if (timeout) {
            if (saveState.timeout) {
                clearTimeout(saveState.timeout);
            }
            saveState.timeout = setTimeout(this._onTimeoutSave.bind(this, saveState), timeout);
        } else {
            this._onTimeoutSave(saveState);
        }

        const savedOrError = await when(eventSaved);

        if (savedOrError === true) {
            this.retryListens();

            const saveResults = pendingSaveResults.get(refPath);

            if (saveResults) {
                const { saved } = saveResults;
                if (saved?.length) {
                    // Only want to return from saved one time
                    if (saveState.numSavesPending.get() === 0) {
                        pendingSaveResults.delete(refPath);
                    } else {
                        saveResults.saved = [];
                    }
                    let maxModified = 0;

                    // Compile a changes object of all the dateModified
                    const changesOut = {};
                    for (let i = 0; i < saved.length; i++) {
                        const { dateModified, path, pathTypes, dateModifiedKeyOption, dateModifiedKey, value } =
                            saved[i];
                        if (dateModified) {
                            maxModified = Math.max(dateModified, maxModified);
                            if (dateModifiedKeyOption) {
                                const deconstructed = deconstructObjectWithPath(path, pathTypes, value);
                                // Don't resurrect deleted items
                                if (deconstructed !== (symbolDelete as any)) {
                                    Object.assign(
                                        changesOut,
                                        constructObjectWithPath(path, pathTypes, {
                                            [dateModifiedKey!]: dateModified,
                                        }),
                                    );
                                }
                            }
                        }
                    }

                    const ret = {
                        changes: changesOut,
                        dateModified: maxModified || undefined,
                    };

                    log?.('verbose', 'Saved', changes, ret);

                    return ret;
                }
            }
        } else {
            throw savedOrError;
        }

        return {};
    }
    private _constructBatch(
        options: PersistOptions,
        batch: Record<string, string | object>,
        basePath: string,
        saves: SaveInfoDictionary,
        ...path: string[]
    ) {
        const { fieldTransforms, dateModifiedKey: dateModifiedKeyOption } = options.remote!;
        const dateModifiedKey = getDateModifiedKey(dateModifiedKeyOption);

        let valSave = saves[symbolSaveValue as any];
        if (valSave !== undefined) {
            let queryByModified = options.remote!.firebase!.queryByModified;
            if (queryByModified) {
                if (queryByModified !== true && fieldTransforms) {
                    queryByModified = transformObject(queryByModified, fieldTransforms);
                }
                valSave = this.insertDatesToSave(batch, queryByModified!, dateModifiedKey, basePath, path, valSave);
            }

            const pathThis = basePath + path.join('/');
            if (pathThis && !batch[pathThis]) {
                batch[pathThis] = valSave;
            }
        } else {
            Object.keys(saves).forEach((key) => {
                this._constructBatch(options, batch, basePath, saves[key] as any, ...path, key);
            });
        }
    }
    private _constructBatchesForSave(pendingSaves: Map<string, PendingSaves>) {
        const batches: object[] = [];
        pendingSaves.forEach(({ options, saves }) => {
            const basePath = options.remote!.firebase!.refPath(this.fns.getCurrentUser());
            const batch = {};
            this._constructBatch(options, batch, basePath, saves);
            batches.push(batch);
        });

        return batches;
    }
    private async _onTimeoutSave(saveState: SaveState) {
        const { pendingSaves, eventSaved } = saveState;

        saveState.timeout = undefined;
        saveState.eventSaved = undefined;
        saveState.numSavesPending.set((v) => v + 1);

        if (pendingSaves.size > 0) {
            const batches = JSON.parse(JSON.stringify(this._constructBatchesForSave(pendingSaves))) as Record<
                string,
                any
            >[];

            saveState.savingSaves = pendingSaves;

            // Clear the pendingSaves so that the next batch starts from scratch
            saveState.pendingSaves = new Map();

            if (batches.length > 0) {
                const promises: Promise<{ didSave?: boolean; error?: any }>[] = [];
                for (let i = 0; i < batches.length; i++) {
                    const batch = batches[i];
                    promises.push(this._saveBatch(batch));
                }

                const results = await Promise.all(promises);
                const errors = results.filter((result) => result.error);
                if (errors.length === 0) {
                    saveState.numSavesPending.set((v) => v - 1);
                    eventSaved?.set(true);
                } else {
                    eventSaved?.set(errors[0].error);
                }
            }
        }
    }
    private async _saveBatch(batch: Record<string, any>): Promise<any> {
        const length = JSON.stringify(batch).length;

        let error: Error | undefined = undefined;
        // Firebase has a maximum limit of 16MB per save so we constrain our saves to
        // less than 12 to be safe
        if (length > 12e6) {
            const parts = splitLargeObject(batch, 6e6);
            let didSave = true;

            // TODO: Option for logging
            for (let i = 0; i < parts.length; i++) {
                const ret = await this._saveBatch(parts[i]);
                if (ret.error) {
                    error = ret.error;
                } else {
                    didSave = didSave && ret.didSave;
                }
            }
            return error ? { error } : { didSave };
        } else {
            for (let i = 0; i < 3; i++) {
                try {
                    await this.fns.update(batch);
                    return { didSave: true };
                } catch (err) {
                    error = err as Error;

                    await new Promise<void>((resolve) => setTimeout(resolve, 500));
                }
            }

            return { error };
        }
    }
    private _convertFBTimestamps(obj: any, dateModifiedKey: string, dateModifiedKeyOption: string) {
        let value = obj;
        // Database value can be either { @: number, _: object } or { @: number, ...rest }
        // where @ is the dateModifiedKey
        let dateModified = value[dateModifiedKey];
        if (dateModified) {
            // If user doesn't request a dateModifiedKey then delete it
            if (value._ !== undefined) {
                value = value._;
            } else if (dateModified && Object.keys(value).length < 2) {
                value = symbolDelete;
            }

            if (!dateModifiedKeyOption) {
                delete value[dateModifiedKey];
            }
        }

        if (isObject(value)) {
            Object.keys(value).forEach((k) => {
                const val = value[k];
                if (val !== undefined) {
                    if (isObject(val) || isArray(val)) {
                        const { value: valueChild, dateModified: dateModifiedChild } = this._convertFBTimestamps(
                            val,
                            dateModifiedKey,
                            dateModifiedKeyOption,
                        );
                        if (dateModifiedChild) {
                            dateModified = Math.max(dateModified || 0, dateModifiedChild);
                        }
                        if (valueChild !== val) {
                            value[k] = valueChild;
                        }
                    }
                }
            });
        }

        return { value, dateModified };
    }
    private async _onceValue<T>(
        path: string[],
        pathTypes: TypeAtPath[],
        pathFirebase: string,
        dateModifiedKey: string | undefined,
        dateModifiedKeyOption: string | undefined,
        queryByModified: QueryByModified<any> | undefined,
        onLoad: () => void,
        params: ObservablePersistRemoteGetParams<T>,
        status$: Observable<LoadStatus>,
        snapshot: DataSnapshot,
    ) {
        const { onChange } = params;
        const outerValue = snapshot.val();

        // If this path previously errored, clear the error state
        const obs = params.obs;
        params.state.error.delete();
        this.listenErrors.delete(obs);

        status$.startedLoading.set(true);
        if (outerValue && isObject(outerValue)) {
            let value;
            let dateModified;
            if (queryByModified) {
                const converted = this._convertFBTimestamps(outerValue, dateModifiedKey!, dateModifiedKeyOption!);
                value = converted.value;
                dateModified = converted.dateModified;
            } else {
                value = outerValue;
            }

            value = constructObjectWithPath(path, pathTypes, value);

            const onChangePromise = onChange({
                value,
                path,
                pathTypes,
                mode: queryByModified ? 'assign' : 'set',
                dateModified,
            });
            if (onChangePromise) {
                await onChangePromise;
            }
        }
        onLoad();
        batch(() => {
            status$.numLoading.set((v) => v - 1);
            status$.numWaitingCanSave.set((v) => v - 1);
        });
    }
    private async _onChange<T>(
        path: string[],
        pathTypes: TypeAtPath[],
        pathFirebase: string,
        dateModifiedKey: string | undefined,
        dateModifiedKeyOption: string | undefined,
        params: ObservablePersistRemoteGetParams<T>,
        localState: LocalState<T>,
        saveState: SaveState,
        status$: Observable<LoadStatus>,
        snapshot: DataSnapshot,
    ) {
        const { numLoading, startedLoading } = status$.peek();

        if (numLoading > 0) {
            // If onceValue has not been called yet, then skip onChange because it will come later
            if (!startedLoading) return;

            // Wait for load
            await when(() => status$.numLoading.get() < 1);
        }

        const {
            onChange,
            state,
            options: { remote },
        } = params;

        const { changeTimeout } = remote!;

        // Skip changes if disabled
        if (state.isEnabledRemote.peek() === false) return;

        const key = snapshot.key!;
        const val = snapshot.val();

        if (val) {
            // eslint-disable-next-line prefer-const
            let { value, dateModified } = this._convertFBTimestamps(val, dateModifiedKey!, dateModifiedKeyOption!);

            const pathChild = path.concat(key);
            const pathTypesChild = pathTypes.concat('object');
            const constructed = constructObjectWithPath(pathChild, pathTypes, value);

            if (
                !this.addValuesToPendingSaves(
                    pathFirebase,
                    constructed,
                    pathChild,
                    pathTypesChild,
                    dateModified,
                    dateModifiedKey,
                    dateModifiedKeyOption,
                    saveState,
                    onChange,
                )
            ) {
                localState.changes = setAtPath(localState.changes as object, pathChild, pathTypes, value);

                // Debounce many child changes into a single onChange
                clearTimeout(localState.timeout);
                localState.timeout = setTimeout(() => {
                    const changes = localState.changes;
                    localState.changes = {};
                    onChange({ value: changes as T, path, pathTypes, mode: 'assign', dateModified });
                }, changeTimeout || 300);
            }
        }
    }
    private insertDateToObject(value: any, dateModifiedKey: string) {
        const timestamp = this.fns.serverTimestamp();
        if (isObject(value)) {
            return Object.assign(value, {
                [dateModifiedKey]: timestamp,
            });
        } else {
            return {
                [dateModifiedKey]: timestamp,
                _: value,
            };
        }
    }
    private insertDatesToSaveObject(
        batch: Record<string, string | object>,
        queryByModified: QueryByModified<any>,
        dateModifiedKey: string,
        path: string,
        value: any,
    ): object {
        if (queryByModified === true) {
            value = this.insertDateToObject(value, dateModifiedKey);
        } else if (isObject(value)) {
            Object.keys(value).forEach((key) => {
                value[key] = this.insertDatesToSaveObject(
                    batch,
                    (queryByModified as any)[key],
                    dateModifiedKey,
                    path + '/' + key,
                    value[key],
                );
            });
        }
        return value;
    }
    private insertDatesToSave(
        batch: Record<string, string | object>,
        queryByModified: QueryByModified<any>,
        dateModifiedKey: string,
        basePath: string,
        path: string[],
        value: any,
    ) {
        let o = queryByModified;
        for (let i = 0; i < path.length; i++) {
            if (o === true) {
                const pathThis = basePath + path.slice(0, i + 1).join('/');
                if (i === path.length - 1) {
                    if (!isObject(value)) {
                        return this.insertDateToObject(value, dateModifiedKey);
                    } else {
                        if (isObject(value)) {
                            value[dateModifiedKey] = this.fns.serverTimestamp();
                        } else {
                            batch[pathThis + '/' + dateModifiedKey] = this.fns.serverTimestamp();
                        }
                    }
                } else {
                    batch[pathThis + '/' + dateModifiedKey] = this.fns.serverTimestamp();
                }
                return value;
            } else if (isObject(o)) {
                o = (o as any)[path[i]];
            }
        }

        if (o === true && isObject(value)) {
            Object.keys(value).forEach((key) => {
                this.insertDatesToSaveObject(
                    batch,
                    o,
                    dateModifiedKey,
                    basePath + path.join('/') + '/' + key,
                    value[key],
                );
            });
        } else if (o !== undefined) {
            this.insertDatesToSaveObject(batch, o, dateModifiedKey, basePath + path.join('/'), value);
        }

        return value;
    }
    private addValuesToPendingSaves(
        refPath: string,
        value: object,
        pathChild: string[],
        pathTypesChild: TypeAtPath[],
        dateModified: number | undefined,
        dateModifiedKey: string | undefined,
        dateModifiedKeyOption: string | undefined,
        saveState: SaveState,
        onChange: ObservablePersistRemoteGetParams<any>['onChange'],
    ) {
        const { pendingSaveResults, savingSaves } = saveState;
        let found = false;
        const pathArr = refPath.split('/');
        for (let i = pathArr.length - 1; !found && i >= 0; i--) {
            const p = pathArr[i];
            if (p === '') continue;

            const path = pathArr.slice(0, i + 1).join('/') + '/';

            // Look for this saved key in the currently saving saves.
            // If it's being saved locally this must be the remote onChange
            // coming in for this save.
            if (pendingSaveResults.has(path) && savingSaves?.has(path)) {
                found = true;
                if (pathChild.length > 0) {
                    const savingSave = savingSaves.get(path)!;
                    const save = savingSave.saves[pathChild[0]];
                    if (!save) {
                        found = false;
                    }
                }

                if (found) {
                    const pending = pendingSaveResults.get(path)!;
                    pending.saved.push({
                        value,
                        dateModified,
                        path: pathChild,
                        pathTypes: pathTypesChild,
                        dateModifiedKey,
                        dateModifiedKeyOption,
                        onChange,
                    });
                }
            }
            value = { [p]: value };
        }
        return found;
    }
}

function estimateSize(value: any): number {
    return ('' + value).length + 2; // Convert to string and account for quotes in JSON.
}

function splitLargeObject(obj: Record<string, any>, limit: number): Record<string, any>[] {
    const parts: Record<string, any>[] = [{}];
    let sizeCount = 0;

    function recursiveSplit(innerObj: Record<string, any>, path: string[] = []) {
        for (const key in innerObj) {
            if (!hasOwnProperty.call(innerObj, key)) {
                continue;
            }

            const newPath = [...path, key];
            const keySize = key.length + 4; // Account for quotes and colon in JSON.
            const val = innerObj[key];

            let itemSize = 0;
            if (val && typeof val === 'object') {
                itemSize = JSON.stringify(val).length;
            } else {
                itemSize = estimateSize(val);
            }

            if (val && typeof val === 'object' && itemSize > limit) {
                recursiveSplit(val, newPath);
            } else {
                // Check if the size of the current item exceeds the limit
                if (sizeCount > 0 && sizeCount + keySize + itemSize > limit) {
                    parts.push({});
                    sizeCount = 0;
                }

                const pathKey = newPath.join('/');
                parts[parts.length - 1][pathKey] = val;
                sizeCount += keySize + itemSize;
            }
        }
    }

    recursiveSplit(obj);
    return parts;
}

// This is the web version of all the firebase functions. It passes them in as arguments so that it could
// support firebase on other platforms.
export class ObservablePersistFirebase extends ObservablePersistFirebaseBase {
    constructor() {
        super({
            isInitialized: () => {
                try {
                    return !!getAuth().app;
                } catch {
                    return false;
                }
            },
            getCurrentUser: () => getAuth().currentUser?.uid,
            ref: (path: string) => ref(getDatabase(), path),
            orderByChild: (ref: DatabaseReference, child: string, start: number) =>
                query(ref, orderByChild(child), startAt(start)),
            update: (object: object) => update(ref(getDatabase()), object),
            once: (ref: DatabaseReference, callback, callbackError) => {
                let unsubscribe: Unsubscribe | undefined;
                const cb = (snap: DataSnapshot) => {
                    if (unsubscribe) {
                        unsubscribe();
                        unsubscribe = undefined;
                    }
                    callback(snap);
                };
                unsubscribe = onValue(ref, cb, callbackError);
                return unsubscribe;
            },
            onChildAdded,
            onChildChanged,
            serverTimestamp,
            onAuthStateChanged: (cb) => getAuth().onAuthStateChanged(cb),
        });
    }
}
