import { isObject } from '@legendapp/tools';
import { config } from './configureObsProxy';
import { invertMap, transformObject, transformPath } from './FieldTransformer';
import {
    constructObject,
    getDateModifiedKey,
    isNullOrUndefined,
    isObjectEmpty,
    mergeDeep,
    objectAtPath,
    symbolDateModified,
} from './globals';
import { getObsModified } from './ObsProxyFns';
import type {
    ObsListenerInfo,
    ObsPersistRemote,
    ObsProxy,
    ObsProxyChecker,
    ObsProxyUnsafe,
    PersistOptions,
    PersistOptionsRemote,
    QueryByModified,
} from './ObsProxyInterfaces';
import { PromiseCallback } from './PromiseCallback';

export interface FirebaseFns {
    getCurrentUser: () => string;
    ref: (path: string) => any;
    orderByChild: (ref: any, child: string, startAt: number) => any;
    once: (query: any, callback: (snapshot: any) => unknown) => void;
    onChildAdded: (
        query: any,
        callback: (snapshot: any) => unknown,
        cancelCallback?: (error: Error) => unknown
    ) => void;
    onChildChanged: (
        query: any,
        callback: (snapshot: any) => unknown,
        cancelCallback?: (error: Error) => unknown
    ) => void;
    serverTimestamp: () => any;
    update: (object: object) => Promise<void>;
    onAuthStateChanged: (cb: (user: any) => void) => void;
}

/** @internal */
export const symbolSaveValue = Symbol('___obsSaveValue');

interface SaveInfo {
    [symbolSaveValue]: any;
}

type SaveInfoDictionary<T = any> = {
    [K in keyof T]: SaveInfo | SaveInfoDictionary<T[K]>;
};

interface PendingSaves {
    options: PersistOptions;
    saves: SaveInfoDictionary;
    values: any[];
}

export class ObsPersistFirebaseBase implements ObsPersistRemote {
    private promiseAuthed: PromiseCallback<void>;
    private promiseSaved: PromiseCallback<void>;
    protected _batch: Record<string, any> = {};
    private _timeoutSave: any;
    private fns: FirebaseFns;
    private _hasLoadedValue: Record<string, boolean | Promise<boolean>> = {};
    private SaveTimeout;
    private _pendingSaves2: Map<string, PendingSaves> = new Map();

    constructor() {
        this.SaveTimeout = config?.persist?.saveTimeout || 3000;
        this._onTimeoutSave = this._onTimeoutSave.bind(this);
    }
    protected setFns(fns: FirebaseFns) {
        this.fns = fns;
    }
    private async waitForAuth() {
        if (!this.promiseAuthed) {
            this.promiseAuthed = new PromiseCallback();

            this.fns.onAuthStateChanged((user) => {
                if (user) {
                    this.promiseAuthed.resolve();
                }
            });
        }

        await this.promiseAuthed.promise;
    }
    private calculateDateModified(obs: ObsProxyChecker) {
        const max = { v: 0 };
        if (isObject(obs.get())) {
            Object.keys(obs).forEach((key) => {
                const dateModified = getObsModified(obs[key]);
                if (dateModified) {
                    max.v = Math.max(max.v, dateModified);
                }
            });
        }
        return max.v > 0 ? max.v : undefined;
    }
    public listen<T>(
        obs: ObsProxyChecker<T>,
        options: PersistOptions<T>,
        onLoad: () => void,
        onChange: (obs: ObsProxy<T>, value: any) => void
    ) {
        const { queryByModified } = options.remote.firebase;

        if (isObject(queryByModified)) {
            // TODO: Track which paths were handled and then afterwards listen to the non-handled ones
            // without modified

            this.iterateListen(obs, options, queryByModified, onLoad, onChange, '');
        } else {
            let dateModified: number;
            if (queryByModified === true || queryByModified === '*') {
                dateModified = this.calculateDateModified(obs);
            }

            this._listen(obs, options, queryByModified, dateModified, onLoad, onChange, '');
        }
    }
    private iterateListen<T>(
        obs: ObsProxyChecker<T>,
        options: PersistOptions<T>,
        queryByModified: object,
        onLoad: () => void,
        onChange: (obs: ObsProxy<T>, value: any) => void,
        syncPathExtra: string
    ) {
        const { ignoreKeys } = options.remote.firebase;
        Object.keys(obs).forEach((key) => {
            if (!ignoreKeys || !ignoreKeys[key]) {
                const o = obs[key];
                const q = queryByModified[key] || queryByModified['*'];
                const extra = syncPathExtra + key + '/';

                let dateModified;
                if (isObject(q)) {
                    this.iterateListen(o, options, q, onLoad, onChange, extra);
                } else {
                    if (q === true || q === '*') {
                        dateModified = this.calculateDateModified(o);
                    }

                    this._listen(o, options, q, dateModified, onLoad, onChange, extra);
                }
            }
        });
    }
    private async _listen<T>(
        obs: ObsProxyChecker<T>,
        options: PersistOptions<T>,
        queryByModified: any,
        dateModified: number,
        onLoad: () => void,
        onChange: (obsProxy: ObsProxy<T>, value: any) => void,
        syncPathExtra: string
    ) {
        const {
            once,
            requireAuth,
            adjustData,
            firebase: { syncPath, fieldTransforms, ignoreKeys },
        } = options.remote;

        if (requireAuth) {
            await this.waitForAuth();
        }

        const dateModifiedKey = getDateModifiedKey(options.dateModifiedKey || config.persist?.dateModifiedKey);

        let fieldTransformsAtPath;
        if (fieldTransforms) {
            if (process.env.NODE_ENV === 'development') {
                this.validateMap(fieldTransforms, dateModifiedKey);
            }
            if (syncPathExtra) {
                const pathArr = syncPathExtra.split('/').filter((a) => !!a);
                const obj = objectAtPath(pathArr, fieldTransforms);
                if (!obj) debugger;
                fieldTransformsAtPath = invertMap(objectAtPath(pathArr, fieldTransforms));
                syncPathExtra = transformPath(pathArr, fieldTransforms, ignoreKeys, dateModifiedKey).join('/');
            } else {
                fieldTransformsAtPath = invertMap(fieldTransforms);
            }
        }

        const pathFirebase = syncPath(this.fns.getCurrentUser());
        const pathFull = pathFirebase + syncPathExtra;

        let refPath = this.fns.ref(pathFull);
        if (dateModified && !isNaN(dateModified)) {
            refPath = this.fns.orderByChild(refPath, dateModifiedKey, dateModified + 1);
        }

        if (!once) {
            const cb = this._onChange.bind(
                this,
                obs,
                pathFirebase,
                fieldTransforms,
                fieldTransformsAtPath,
                adjustData,
                dateModifiedKey,
                syncPathExtra,
                onChange
            );
            this.fns.onChildAdded(refPath, cb, (err) => console.error(err));
            this.fns.onChildChanged(refPath, cb, (err) => console.error(err));
        }

        this.fns.once(
            refPath,
            this._onceValue.bind(
                this,
                obs,
                pathFull,
                fieldTransformsAtPath,
                adjustData,
                dateModifiedKey,
                onLoad,
                onChange
            )
        );
    }
    private _updatePendingSave(path: string[], value: object, pending: SaveInfoDictionary) {
        if (path.length === 0) {
            Object.assign(pending, { [symbolSaveValue]: value });
        } else {
            const p = path[0];
            const v = value[p];

            // If already have a save info here then don't need to go deeper on the path. Just overwrite the value.
            if (pending[p] && pending[p][symbolSaveValue] !== undefined) {
                if (isObject(pending[p][symbolSaveValue])) {
                    mergeDeep(pending[p][symbolSaveValue], v);
                } else {
                    pending[p][symbolSaveValue] = v;
                }
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
    public async save<T>(options: PersistOptions, _: T, info: ObsListenerInfo) {
        const {
            requireAuth,
            saveTimeout,
            firebase: { fieldTransforms, ignoreKeys },
        } = options.remote;
        if (requireAuth) {
            await this.waitForAuth();
        }

        let value = constructObject(info.path, JSON.parse(JSON.stringify(info.changedValue)));
        const valueSaved = JSON.parse(JSON.stringify(value));
        let path = info.path.slice();

        const dateModifiedKey = getDateModifiedKey(options.dateModifiedKey || config.persist?.dateModifiedKey);

        if (fieldTransforms) {
            value = transformObject(value, fieldTransforms, ignoreKeys, dateModifiedKey);
            path = transformPath(
                info.path.filter((a) => !!a),
                fieldTransforms,
                ignoreKeys,
                dateModifiedKey
            );
        }

        const syncPath = options.remote.firebase.syncPath(this.fns.getCurrentUser());
        if (!this._pendingSaves2.has(syncPath)) {
            this._pendingSaves2.set(syncPath, { options, saves: {}, values: [] });
        }
        const pending = this._pendingSaves2.get(syncPath).saves;

        this._updatePendingSave(path, value as unknown as object, pending);

        if (!this.promiseSaved) {
            this.promiseSaved = new PromiseCallback();
        }

        const timeout = saveTimeout ?? this.SaveTimeout;

        if (timeout) {
            if (this._timeoutSave) clearTimeout(this._timeoutSave);
            this._timeoutSave = setTimeout(this._onTimeoutSave, timeout);
        } else {
            this._onTimeoutSave();
        }

        await this.promiseSaved.promise;

        const valuesSaved = this._pendingSaves2.get(syncPath)?.values;

        if (valuesSaved?.length) {
            // Only want to return from saved one time
            this._pendingSaves2.delete(syncPath);
            mergeDeep(valueSaved, ...valuesSaved);
            return valueSaved;
        }
    }
    private _constructBatch(
        options: PersistOptions,
        batch: Record<string, string | object>,
        basePath: string,
        saves: SaveInfoDictionary,
        ...path: string[]
    ) {
        const {
            firebase: { fieldTransforms, ignoreKeys },
        } = options.remote;
        const dateModifiedKey = getDateModifiedKey(options.dateModifiedKey || config.persist?.dateModifiedKey);

        // @ts-ignore
        let valSave = saves[symbolSaveValue];
        if (valSave !== undefined) {
            let queryByModified = options.remote.firebase.queryByModified;
            if (queryByModified) {
                if (queryByModified !== true && queryByModified !== '*' && fieldTransforms) {
                    queryByModified = transformObject(queryByModified, fieldTransforms, ignoreKeys, dateModifiedKey);
                }
                valSave = this.insertDatesToSave(batch, queryByModified, dateModifiedKey, basePath, path, valSave);
            }
            const pathThis = basePath + path.join('/');
            if (!batch[pathThis]) {
                batch[basePath + path.join('/')] = valSave;
            }
        } else {
            Object.keys(saves).forEach((key) => {
                this._constructBatch(options, batch, basePath, saves[key] as any, ...path, key);
            });
        }
    }
    private _constructBatchForSave() {
        const batch = {};
        this._pendingSaves2.forEach(({ options, saves }) => {
            const basePath = options.remote.firebase.syncPath(this.fns.getCurrentUser());
            this._constructBatch(options, batch, basePath, saves);
        });

        return batch;
    }
    private async _adjustSaveData(
        options: PersistOptions,
        basePath: string,
        saves: SaveInfoDictionary,
        ...path: string[]
    ): Promise<any> {
        const { adjustData } = options.remote;

        if (adjustData) {
            let valSave = saves[symbolSaveValue as any];
            if (valSave !== undefined) {
                saves[symbolSaveValue as any] = await adjustData.save(valSave, basePath, path);
            } else {
                await Promise.all(
                    Object.keys(saves).map((key) =>
                        this._adjustSaveData(options, basePath, saves[key] as any, ...path, key)
                    )
                );
            }
        }
    }
    private async _onTimeoutSave() {
        this._timeoutSave = undefined;

        const promiseSaved = this.promiseSaved;
        this.promiseSaved = undefined;

        const promisesAdjustData: Promise<void>[] = [];
        this._pendingSaves2.forEach(({ options, saves }) => {
            const basePath = options.remote.firebase.syncPath(this.fns.getCurrentUser());
            promisesAdjustData.push(this._adjustSaveData(options, basePath, saves));
        });

        await Promise.all(promisesAdjustData);

        const batch = JSON.parse(JSON.stringify(this._constructBatchForSave()));

        // console.log('Save', batch);
        await this.fns.update(batch);
        promiseSaved.resolve();
    }
    private _convertFBTimestamps(obj: any, dateModifiedKey: string) {
        let value = obj;
        // Database value can be either { @: number, _: object } or { @: number, ...rest }
        let dateModified = value[dateModifiedKey];
        delete value[dateModifiedKey];
        if (value._) {
            value = value._;
        } else if (Object.keys(value).length === 1 && value[dateModifiedKey]) {
            value = undefined;
        }

        if (isObject(value)) {
            Object.keys(value).forEach((k) => {
                const { dateModified: d, value: v } = this._convertFBTimestamps(value[k], dateModifiedKey);
                value[k] = v;
                if (d) {
                    dateModified = Math.max(dateModified || 0, d);
                }
            });
            if (dateModified) {
                value[symbolDateModified as any] = dateModified;
                dateModified = undefined;
            }
        }

        return { dateModified, value };
    }
    private _getChangeValue(key: string, snapVal: any, dateModifiedKey: string) {
        let { value, dateModified } = this._convertFBTimestamps(snapVal, dateModifiedKey);

        value = constructObject([key], value, dateModified);

        return value;
    }
    private _onceValue(
        obs: ObsProxy<Record<any, any>>,
        path: string,
        fieldTransformsAtPath: object,
        adjustData: PersistOptionsRemote['adjustData'],
        dateModifiedKey: string,
        onLoad: () => void,
        onChange: (cb: () => void) => void,
        snapshot: any
    ) {
        let outerValue = snapshot.val();

        if (fieldTransformsAtPath) {
            outerValue = transformObject(outerValue, fieldTransformsAtPath, undefined, dateModifiedKey);
        }

        if (outerValue && isObject(outerValue)) {
            this._hasLoadedValue[path] = new Promise<boolean>(async (resolve) => {
                if (adjustData) {
                    await adjustData.load(outerValue, path);
                }
                onChange(() => {
                    const { value } = this._convertFBTimestamps(outerValue, dateModifiedKey);
                    obs.assign(value);

                    resolve(true);
                    this._hasLoadedValue[path] = true;
                    onLoad();
                });
            });
        } else {
            this._hasLoadedValue[path] = true;
        }
    }
    private async _onChange(
        obs: ObsProxyChecker,
        pathFirebase: string,
        fieldTransforms: object,
        fieldTransformsAtPath: object,
        adjustData: PersistOptionsRemote['adjustData'],
        dateModifiedKey: string,
        syncPathExtra: string,
        onChange: (cb: () => void) => void,
        snapshot: any
    ) {
        const path = pathFirebase + syncPathExtra;
        const waitForLoad = this._hasLoadedValue[path];
        if (!waitForLoad) return;
        if (waitForLoad !== true) await waitForLoad;

        let val = snapshot.val();
        let key = snapshot.key;
        if (val) {
            if (fieldTransformsAtPath) {
                key = transformPath([snapshot.key], fieldTransformsAtPath, undefined, dateModifiedKey)[0];
                val = transformObject({ [snapshot.key]: val }, fieldTransformsAtPath, undefined, dateModifiedKey)[key];
                if (syncPathExtra) {
                    syncPathExtra = transformPath(
                        syncPathExtra.split('/'),
                        invertMap(fieldTransforms),
                        undefined,
                        dateModifiedKey
                    ).join('/');
                }
            }
            const value = this._getChangeValue(key, val, dateModifiedKey);

            const pathTransformed = pathFirebase + syncPathExtra;
            if (adjustData) {
                await adjustData.load(value, pathFirebase);
            }
            if (!this.addValuesToPendingSaves(pathTransformed.split('/'), value)) {
                onChange(() => {
                    obs.assign(value);
                });
            }
        }
    }
    private validateMap(record: Record<string, any>, dateModifiedKey: string) {
        if (process.env.NODE_ENV === 'development') {
            const values = Object.entries(record)
                .filter(([key]) => key !== '__dict' && key !== '__obj' && key !== '__arr' && key !== '_')
                .map(([key, value]) => value);

            const uniques = Array.from(new Set(values));
            if (values.length !== uniques.length) {
                console.error('Field transform map has duplicate values', record, values.length, uniques.length);
                debugger;
            }
            values.forEach((val) => {
                if (val === dateModifiedKey || val === '_') {
                    console.error('Field transform map uses a reserved value:', val);
                } else if (isObject(val)) {
                    this.validateMap(val, dateModifiedKey);
                }
            });
        }
        return record;
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
        value: any
    ): object {
        let o = queryByModified;
        if (o === true) {
            value = this.insertDateToObject(value, dateModifiedKey);
        } else if (o === '*' || isObject(value)) {
            Object.keys(value).forEach((key) => {
                value[key] = this.insertDatesToSaveObject(
                    batch,
                    o === '*' ? true : o[key] || o['*'],
                    dateModifiedKey,
                    path + '/' + key,
                    value[key]
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
        value: any
    ) {
        let o = queryByModified;
        for (let i = 0; i < path.length; i++) {
            if (o === true) {
                if (i === path.length - 1) {
                    if (!isObject(value)) {
                        return this.insertDateToObject(value, dateModifiedKey);
                    } else {
                        const pathThis = basePath + path.slice(0, i + 1).join('/');
                        if (isObject(value)) {
                            value[dateModifiedKey] = this.fns.serverTimestamp();
                        } else {
                            batch[pathThis + '/' + dateModifiedKey] = this.fns.serverTimestamp();
                        }
                    }
                } else {
                    const pathThis = basePath + path.slice(0, i + 1).join('/');
                    batch[pathThis + '/' + dateModifiedKey] = this.fns.serverTimestamp();
                }
                return value;
            } else if (isObject(o)) {
                o = o[path[i]] || o['*'];
            } else if (o === '*') {
                const pathThis = basePath + path.slice(0, i + 1).join('/');
                if (isNullOrUndefined(value) || isObjectEmpty(value)) {
                    batch[pathThis] = { [dateModifiedKey]: this.fns.serverTimestamp() };
                } else {
                    batch[pathThis + '/' + dateModifiedKey] = this.fns.serverTimestamp();
                }
                return value;
            }
        }

        if (o === true && isObject(value)) {
            Object.keys(value).forEach((key) => {
                this.insertDatesToSaveObject(
                    batch,
                    o,
                    dateModifiedKey,
                    basePath + path.join('/') + '/' + key,
                    value[key]
                );
            });
        } else {
            this.insertDatesToSaveObject(batch, o, dateModifiedKey, basePath + path.join('/'), value);
        }

        return value;
    }
    private addValuesToPendingSaves(pathArr: string[], value: object) {
        let found = false;
        for (let i = pathArr.length - 1; i >= 0; i--) {
            const p = pathArr[i];
            if (p === '') continue;
            const path = pathArr.slice(0, i + 1).join('/') + '/';
            if (this._pendingSaves2.has(path)) {
                this._pendingSaves2.get(path).values.push(value);
                found = true;
            }
            value = { [p]: value };
        }
        return found;
    }
}
