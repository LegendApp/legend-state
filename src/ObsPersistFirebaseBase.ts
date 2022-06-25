import { isObject } from '@legendapp/tools';
import { invertObject, transformObject } from './FieldTransformer';
import { constructObject, removeNullUndefined, symbolDateModified } from './globals';
import { getObsModified } from './ObsProxyFns';
import type {
    ObsListenerInfo,
    ObsPersistRemote,
    ObsProxy,
    ObsProxyChecker,
    ObsProxyUnsafe,
    PersistOptionsRemote,
    QueryByModified,
} from './ObsProxyInterfaces';
import { PromiseCallback } from './PromiseCallback';

const Delimiter = '~';

function replaceWildcard(str: string) {
    return str.replace(/\/?\*/, '');
}

function findStartsWithPathInverse(...args: any): string {
    return '';
    // return args.find((a) => {
    //     a = replaceWildcard(a);
    //     return a === '' || a.startsWith(str);
    // });
}

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
    options: PersistOptionsRemote;
    saves: SaveInfoDictionary;
    values: any[];
}

function findMaxModified(obj: object, max: { v: number }) {
    if (isObject(obj)) {
        Object.keys(obj).forEach((key) => (max.v = Math.max(max.v, obj['@'])));
    }
}

export class ObsPersistFirebaseBase implements ObsPersistRemote {
    private promiseAuthed: PromiseCallback<void>;
    private promiseSaved: PromiseCallback<void>;
    private fieldTransformsIn: Record<string, any> = {};
    protected _batch: Record<string, any> = {};
    private _timeoutSave: any;
    private fns: FirebaseFns;
    private _hasLoadedValue: Record<string, boolean> = {};
    protected SaveTimeout = 3000;
    private _pendingSaves2: Map<string, PendingSaves> = new Map();

    constructor() {
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
            Object.keys(obs).forEach((key) => (max.v = Math.max(max.v, getObsModified(obs[key]))));
        }
        return max.v > 0 ? max.v : undefined;
    }
    public listen<T extends object>(
        obs: ObsProxyChecker<T>,
        options: PersistOptionsRemote<T>,
        onLoad: () => void,
        onChange: (obs: ObsProxy<T>, value: any) => void
    ) {
        const {
            firebase: { queryByModified },
        } = options;

        if (isObject(queryByModified)) {
            // TODO: Track which paths were handled and then afterwards listen to the non-handled ones
            // without modified

            this.iterateListen(obs, options, queryByModified, onLoad, onChange, '');
        } else {
            let dateModified: number;
            if (queryByModified === true) {
                dateModified = this.calculateDateModified(obs);
            }
            this._listen(obs, options, undefined, onLoad, onChange, '');
        }
    }
    private iterateListen<T extends object>(
        obs: ObsProxyChecker<T>,
        options: PersistOptionsRemote<T>,
        queryByModified: object,
        onLoad: () => void,
        onChange: (obs: ObsProxy<T>, value: any) => void,
        syncPathExtra: string
    ) {
        Object.keys(obs).forEach((key) => {
            const o = obs[key];
            const q = queryByModified[key];
            const extra = syncPathExtra + key + '/';
            let dateModified;
            if (isObject(q)) {
                this.iterateListen(o, options, q, onLoad, onChange, extra);
            } else {
                if (q === true) {
                    dateModified = this.calculateDateModified(o);
                }
                this._listen(o, options, dateModified, onLoad, onChange, extra);
            }
        });
    }
    private async _listen<T extends object>(
        obs: ObsProxyChecker<T>,
        options: PersistOptionsRemote<T>,
        dateModified: number,
        onLoad: () => void,
        onChange: (obsProxy: ObsProxy<T>, value: any) => void,
        syncPathExtra: string
    ) {
        const {
            once,
            requireAuth,
            firebase: { syncPath, fieldTransforms },
        } = options;

        if (requireAuth) {
            await this.waitForAuth();
        }

        const pathFirebase = syncPath(this.fns.getCurrentUser()) + syncPathExtra;

        if (fieldTransforms) {
            this.validateMap(fieldTransforms);
            this.fieldTransformsIn[pathFirebase] = invertObject(fieldTransforms);
        }

        let refPath = this.fns.ref(pathFirebase);
        if (dateModified && !isNaN(dateModified)) {
            refPath = this.fns.orderByChild(refPath, '@', dateModified + 1);
        }

        if (!once) {
            const cb = this._onChange.bind(this, pathFirebase, obs, onChange);
            this.fns.onChildAdded(refPath, cb, (err) => console.error(err));
            this.fns.onChildChanged(refPath, cb, (err) => console.error(err));
        }

        this.fns.once(refPath, this._onceValue.bind(this, pathFirebase, obs, onLoad, onChange));
    }
    private _updatePendingSave(path: string[], value: object, pending: SaveInfoDictionary) {
        if (path.length === 0) {
            Object.assign(pending, { [symbolSaveValue]: value });
        } else {
            const p = path[0];
            const v = value[p];

            // If already have a save info here then don't need to go deeper on the path. Just overwrite the value.
            if (pending[p] && pending[p][symbolSaveValue] !== undefined) {
                pending[p][symbolSaveValue] = v;
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
    public async save<T>(options: PersistOptionsRemote, value: T, info: ObsListenerInfo) {
        const { requireAuth } = options;
        if (requireAuth) {
            await this.waitForAuth();
        }

        value = removeNullUndefined(value);

        const path = info.path.slice();
        const syncPath = options.firebase.syncPath(this.fns.getCurrentUser());
        if (!this._pendingSaves2.has(syncPath)) {
            this._pendingSaves2.set(syncPath, { options, saves: {}, values: [] });
        }
        const pending = this._pendingSaves2.get(syncPath).saves;

        this._updatePendingSave(path, value as unknown as object, pending);

        if (!this.promiseSaved) {
            this.promiseSaved = new PromiseCallback();
        }

        if (this.SaveTimeout) {
            if (this._timeoutSave) clearTimeout(this._timeoutSave);
            this._timeoutSave = setTimeout(this._onTimeoutSave, this.SaveTimeout);
        } else {
            this._onTimeoutSave();
        }

        await this.promiseSaved.promise;

        const valuesSaved = this._pendingSaves2.get(syncPath)?.values;
        if (valuesSaved?.length) {
            // Only want to return from saved one time
            this._pendingSaves2.delete(syncPath);
            const valueSaved = JSON.parse(JSON.stringify(value));
            Object.assign(valueSaved, ...valuesSaved);
            return valueSaved;
        }
    }
    private _constructBatch(
        options: PersistOptionsRemote,
        batch: Record<string, string | object>,
        basePath: string,
        saves: SaveInfoDictionary,
        ...path: string[]
    ) {
        // @ts-ignore
        let valSave = saves[symbolSaveValue];
        if (valSave !== undefined) {
            const queryByModified = options.firebase.queryByModified;
            if (queryByModified) {
                valSave = this.insertDatesToSave(batch, queryByModified, basePath, path, valSave);
            }
            batch[basePath + path.join('/')] = valSave;
        } else {
            Object.keys(saves).forEach((key) => {
                this._constructBatch(options, batch, basePath, saves[key] as any, ...path, key);
            });
        }
    }
    private _constructBatchForSave() {
        const batch = {};
        this._pendingSaves2.forEach(({ options, saves }) => {
            const basePath = options.firebase.syncPath(this.fns.getCurrentUser());
            this._constructBatch(options, batch, basePath, saves);
        });

        return batch;
    }
    private async _onTimeoutSave() {
        this._timeoutSave = undefined;

        const batch = this._constructBatchForSave();

        const promiseSaved = this.promiseSaved;
        this.promiseSaved = undefined;
        // console.log('Save', batch);
        await this.fns.update(batch);
        promiseSaved.resolve();
    }
    private _getChangeValue(pathFirebase: string, key: string, snapVal: any) {
        let value = snapVal;
        // Database value can be either { @: number, _: object } or { @: number, ...rest }
        const dateModified = value['@'];
        delete value['@'];
        if (value._) {
            value = value._;
        } else if (Object.keys(value).length === 1 && value['@']) {
            value = undefined;
        }

        const keys = key.split(Delimiter);
        value = constructObject(keys, value, dateModified);

        const fieldTransformsIn = this.fieldTransformsIn[pathFirebase];
        if (fieldTransformsIn) {
            const transformed = transformObject(value, fieldTransformsIn);
            value = transformed;
        }

        return value;
    }
    private _onceValue(
        pathFirebase: string,
        obs: ObsProxy<any> | ObsProxyUnsafe<any>,
        onLoad: () => void,
        onChange: (cb: () => void) => void,
        snapshot: any
    ) {
        let outerValue = snapshot.val();

        onChange(() => {
            if (outerValue) {
                if (isObject(outerValue)) {
                    Object.keys(outerValue).forEach((key) => {
                        const value = this._getChangeValue(pathFirebase, key, outerValue[key]);

                        obs.set(key, value[key]);

                        const d = value[symbolDateModified];
                        const od = getObsModified(obs);
                        if (d && (!od || d > od)) {
                            obs.set(symbolDateModified, value[symbolDateModified]);
                        }
                    });
                }
            } else {
            }
        });

        onLoad();

        this._hasLoadedValue[pathFirebase] = true;
    }
    private _onChange(
        pathFirebase: string,
        obs: ObsProxy | ObsProxyUnsafe,
        onChange: (cb: () => void) => void,
        snapshot: any
    ) {
        if (!this._hasLoadedValue[pathFirebase]) return;

        let val = snapshot.val();
        if (val) {
            const value = this._getChangeValue(pathFirebase, snapshot.key, val);

            if (this._pendingSaves2.has(pathFirebase)) {
                this._pendingSaves2.get(pathFirebase).values.push(value);
            } else {
                onChange(() => {
                    obs.assign(value);
                });
            }
        }
    }
    private validateMap(record: Record<string, any>) {
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
                if (val === '@' || val === '_') {
                    console.error('Field transform map uses a reserved value:', val);
                } else if (isObject(val)) {
                    this.validateMap(val);
                }
            });
        }
        return record;
    }
    private insertDateToObject(value: any) {
        const timestamp = this.fns.serverTimestamp();
        if (isObject(value)) {
            return Object.assign(value, {
                '@': timestamp,
            });
        } else {
            return {
                '@': timestamp,
                _: value,
            };
        }
    }
    private insertDatesToSaveObject(
        batch: Record<string, string | object>,
        queryByModified: QueryByModified<any>,
        path: string,
        value: any
    ): object {
        let o = queryByModified;
        if (o === true) {
            this.insertDateToObject(value);
        } else if (isObject(value)) {
            Object.keys(value).forEach((key) => {
                value[key] = this.insertDatesToSaveObject(batch, queryByModified, path + '/' + key, value[key]);
            });
        }
        return value;
    }

    private insertDatesToSave(
        batch: Record<string, string | object>,
        queryByModified: QueryByModified<any>,
        basePath: string,
        path: string[],
        value: any
    ) {
        let o = queryByModified;
        for (let i = 0; i < path.length; i++) {
            if (o === true) {
                if (i === path.length - 1 && !isObject(value)) {
                    return this.insertDateToObject(value);
                } else {
                    batch[basePath + path.slice(0, i + 1).join('/') + '/@'] = this.fns.serverTimestamp();
                }
                return value;
            }
            o = o[path[i]];
        }
        this.insertDatesToSaveObject(batch, o, basePath + path.join('/'), value);

        return value;
    }
}
