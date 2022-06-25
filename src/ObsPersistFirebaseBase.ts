import { isNumber, isObject } from '@legendapp/tools';
import { getObsModified } from './ObsProxyFns';
import { invertObject, transformObject, transformPath } from './FieldTransformer';
import { constructObject, mergeDeep, objectAtPath, removeNullUndefined, symbolDateModified } from './globals';
import type {
    ObsListenerInfo,
    ObsPersistRemote,
    ObsProxy,
    ObsProxyUnsafe,
    PersistOptions,
    PersistOptionsRemote,
    ProxyValue,
} from './ObsProxyInterfaces';
import { PromiseCallback } from './PromiseCallback';

const Delimiter = '~';

function replaceWildcard(str: string) {
    return str.replace(/\/?\*/, '');
}

function findStartsWithPath(str: string, args: string[]) {
    return args.find((a) => {
        a = replaceWildcard(a);
        return a === '' || str.startsWith(a);
    });
}

function findStartsWithPathInverse(str: string, args: string[]) {
    return args.find((a) => {
        a = replaceWildcard(a);
        return a === '' || a.startsWith(str);
    });
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
    private _pendingSaves: Record<string, { values: any[] }> = {};
    protected _batch: Record<string, any> = {};
    private _timeoutSave: any;
    private fns: FirebaseFns;
    private _hasLoadedValue: Record<string, boolean> = {};

    private _pendingSaves2: Map<string, PendingSaves> = new Map();

    constructor(fns: FirebaseFns) {
        this.fns = fns;
        this._onTimeoutSave = this._onTimeoutSave.bind(this);
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
    private calculateDateModified(obs: ObsProxy | ObsProxyUnsafe) {
        const max = { v: 0 };
        if (isObject(obs.get())) {
            Object.keys(obs).forEach((key) => (max.v = Math.max(max.v, getObsModified(obs[key]))));
        }
        return max.v > 0 ? max.v : undefined;
    }
    public listen<T extends ObsProxy | ObsProxyUnsafe>(
        obs: T,
        options: PersistOptionsRemote<ProxyValue<T>>,
        onLoad: () => void,
        onChange: (obs: T, value: any) => void
    ) {
        const {
            firebase: { queryByModified },
        } = options;

        if (isObject(queryByModified)) {
            // TODO: Track which paths were handled and then afterwards listen to the non-handled ones
            // without modified

            this.iterateListen(obs, options as PersistOptionsRemote<object>, queryByModified, onLoad, onChange, '');
        } else {
            let dateModified: number;
            if (queryByModified === true) {
                dateModified = this.calculateDateModified(obs);
            }
            this._listen(obs, options as PersistOptionsRemote<object>, undefined, onLoad, onChange, '');
        }
    }
    private iterateListen<T extends ObsProxy | ObsProxyUnsafe>(
        obs: T,
        options: PersistOptionsRemote<T>,
        queryByModified: object,
        onLoad: () => void,
        onChange: (obs: T, value: any) => void,
        syncPathExtra: string
    ) {
        Object.keys(obs).forEach((key) => {
            const o = obs[key];
            const q = queryByModified[key];
            const extra = syncPathExtra + key + '/';
            let dateModified;
            if (isObject(q)) {
                console.log(key, 'object');
                this.iterateListen(o, options, q, onLoad, onChange, extra);
            } else {
                if (q === true) {
                    dateModified = this.calculateDateModified(o);
                }
                this._listen(o, options, dateModified, onLoad, onChange, extra);
            }
        });
    }
    private async _listen<T extends ObsProxy | ObsProxyUnsafe>(
        obs: T,
        options: PersistOptionsRemote<ProxyValue<T>>,
        dateModified: number,
        onLoad: () => void,
        onChange: (obsProxy: T, value: any) => void,
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
        value = removeNullUndefined(value);

        const path = info.path.slice();
        const syncPath = options.firebase.syncPath('__SAVE__');
        if (!this._pendingSaves2.has(syncPath)) {
            this._pendingSaves2.set(syncPath, { options, saves: {} });
        }
        const pending = this._pendingSaves2.get(syncPath).saves;

        this._updatePendingSave(path, value as unknown as object, pending);

        if (this._timeoutSave) clearTimeout(this._timeoutSave);
        // TODO: Change this to 3000
        this._timeoutSave = setTimeout(this._onTimeoutSave, 0);

        return value;
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
                let thisPath = path.join('/');
                let datePath = findStartsWithPath(thisPath, queryByModified);
                if (datePath) {
                    const isWildcard = datePath.endsWith('*');
                    if (isWildcard) {
                        datePath = replaceWildcard(datePath);
                        thisPath = thisPath.split('/').slice(0, -1).join('/');
                    }
                    const timestamp = this.fns.serverTimestamp();
                    if (datePath === thisPath) {
                        if (isObject(valSave)) {
                            valSave['@'] = timestamp;
                        } else {
                            valSave = {
                                '@': timestamp,
                                _: valSave,
                            };
                        }
                    } else {
                        if (isWildcard) {
                            datePath = thisPath
                                .split('/')
                                .slice(0, datePath === '' ? 1 : datePath.split('/').length + 1)
                                .join('/');
                        }
                        batch[basePath + datePath + '/@'] = timestamp;
                    }
                } else if (findStartsWithPathInverse(thisPath, queryByModified)) {
                    if (process.env.NODE_ENV === 'development' || process.env.JEST_WORKER_ID) {
                        console.error(
                            'Set a value at a higher level than queryByModified which will overwrite all dates'
                        );
                    }
                }
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
                Object.keys(outerValue).forEach((key) => {
                    const value = this._getChangeValue(pathFirebase, key, outerValue[key]);

                    obs.set(key, value[key]);

                    const d = value[symbolDateModified];
                    const od = getObsModified(obs);
                    if (d && (!od || d > od)) {
                        debugger;
                        obs.set(symbolDateModified, value[symbolDateModified]);
                    }
                });
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

            if (this._pendingSaves[pathFirebase]) {
                this._pendingSaves[pathFirebase].values.push(value);
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
}
