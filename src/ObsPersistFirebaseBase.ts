import { isObject } from '@legendapp/tools';
import autobind from 'autobind-decorator';
import globals from 'common/globals';
import { invertObject, transformObject, transformPath } from 'common/Obs/FieldTransformer';
import type { ObsListenerInfo, ObsPersistRemote, PersistOptions } from './ObsProxyInterfaces';
import { PromiseCallback } from 'common/Obs/PromiseCallback';

const Delimiter = '~';

type Unsubscribe = () => void;

export interface FirebaseFns {
    getCurrentUser: () => string;
    ref: (path: string) => any;
    orderByChild: (ref: any, child: string, startAt: number) => any;
    once: (query: any, callback: (snapshot: any) => unknown) => void;
    onChildAdded: (
        query: any,
        callback: (snapshot: any) => unknown,
        cancelCallback?: (error: Error) => unknown
    ) => Unsubscribe;
    onChildChanged: (
        query: any,
        callback: (snapshot: any) => unknown,
        cancelCallback?: (error: Error) => unknown
    ) => Unsubscribe;
    serverTimestamp: () => any;
    update: (object: object) => Promise<void>;
    onAuthStateChanged: (cb: (user: any) => void) => void;
}

const symbolSaveValue = Symbol('___obsSaveValue');

interface SaveInfo {
    [symbolSaveValue]: any;
}

type SaveInfoDictionary<T = any> = {
    [K in keyof T]: SaveInfo | SaveInfoDictionary<T[K]>;
};

export class ObsPersistFirebaseBase implements ObsPersistRemote {
    private promiseAuthed: PromiseCallback<void>;
    private promiseSaved: PromiseCallback<void>;
    private fieldTransformsIn: Record<string, any> = {};
    private _pendingSaves: Record<string, { values: any[] }> = {};
    protected _batch: Record<string, any> = {};
    private _timeoutSave: any;
    private fns: FirebaseFns;
    private _hasLoadedValue: Record<string, boolean> = {};

    private _pendingSaves2: SaveInfoDictionary = {};

    constructor(fns: FirebaseFns) {
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
    public async listen(
        options: PersistOptions['remote'],
        dateModified: number,
        onLoad: () => void,
        onChange: (value: any) => void
    ) {
        const {
            once,
            requireAuth,
            firebase: { syncPath, fieldTransforms },
        } = options;

        if (requireAuth) {
            await this.waitForAuth();
        }

        const pathFirebase = syncPath(this.fns.getCurrentUser());

        if (fieldTransforms) {
            this.validateMap(fieldTransforms);
            this.fieldTransformsIn[pathFirebase] = invertObject(fieldTransforms);
        }

        let refPath = this.fns.ref(pathFirebase);
        if (dateModified && !isNaN(dateModified)) {
            refPath = this.fns.orderByChild(refPath, '@', dateModified + 1);
        }

        if (!once) {
            const cb = this._onChange.bind(this, pathFirebase, onChange);
            this.fns.onChildAdded(refPath, cb, (err) => console.error(err));
            this.fns.onChildChanged(refPath, cb, (err) => console.error(err));
        }

        this.fns.once(refPath, this._onceValue.bind(this, pathFirebase, onLoad, onChange));
    }
    private _updatePendingSave(path: string[], value: object, pending: SaveInfoDictionary) {
        const p = path[0];
        const v = value[p];
        // TODO use a symbol or something to determine whether we have SaveInfo here since it might overlap an object key

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
    public async save<T>(value: T, info: ObsListenerInfo) {
        console.log('VALUE', value, info);

        const path = info.path.slice();
        debugger;
        this._updatePendingSave(path, value as unknown as object, this._pendingSaves2);

        console.log(this._pendingSaves2);
        debugger;

        return value;
    }
    public async setValue<T extends object>(
        value: T,
        options: PersistOptions['remote'],
        { changedKey, changedProperty }: { changedKey: string; changedProperty: string }
    ) {
        await this.waitForAuth();

        let values: { key: string; value: any }[] = [];

        let extraPath = '';

        const { syncPath, fieldTransforms, spreadPaths } = options.firebase;
        const pathFirebase = syncPath(this.fns.getCurrentUser()) + (extraPath || '');

        let out: any = value;
        if (fieldTransforms) {
            out = transformObject(value, fieldTransforms);
        }

        const path = transformPath(
            [changedKey, changedProperty].filter((a) => !!a),
            fieldTransforms
        );

        if (changedKey) {
            extraPath = '/' + path.join('/');
            out = out[path[0]];
            if (out === undefined) out = null;

            if (changedProperty) {
                if (spreadPaths?.includes(changedKey)) {
                    out = out[path[1]];
                    if (out === undefined) out = null;
                    values = [{ key: '/' + path.join(Delimiter), value: out }];
                } else {
                    values = [{ key: '/' + path[0], value: out }];
                }
            } else {
                if (isObject(out) && spreadPaths?.includes(changedKey)) {
                    Object.keys(out).forEach((key) => {
                        values.push({
                            key: '/' + path[0] + Delimiter + key,
                            value: out[key],
                        });
                    });
                } else {
                    values = [{ key: '/' + path[0], value: out }];
                }
            }
        } else if (changedProperty) {
            debugger;
            values = [{ key: '/' + path.join(Delimiter), value: value[changedProperty] }];
        } else {
            debugger;
        }

        values.forEach((v) => {
            const val = isObject(v.value)
                ? Object.assign({}, v.value, { '@': this.fns.serverTimestamp() })
                : { '@': this.fns.serverTimestamp(), _: v.value };
            this._batch[pathFirebase + v.key] = val;
        });

        const pendingSave = (this._pendingSaves[pathFirebase] = { values: [] });

        if (!this.promiseSaved) {
            this.promiseSaved = new PromiseCallback();
        }

        if (this._timeoutSave) {
            clearTimeout(this._timeoutSave);
        }
        this._timeoutSave = setTimeout(this._onTimeoutSave, 3000);

        await this.promiseSaved.promise;

        const valuesSaved = pendingSave.values;
        delete this._pendingSaves[pathFirebase];
        const valueSaved = globals.cloneDeep(value);
        Object.assign(valueSaved, ...valuesSaved);

        return valueSaved;
    }
    @autobind
    private async _onTimeoutSave() {
        this._timeoutSave = undefined;
        const batch = this._batch;
        this._batch = {};
        const promiseSaved = this.promiseSaved;
        this.promiseSaved = undefined;

        // console.log('Save', batch);
        await this.fns.update(batch);

        promiseSaved.resolve();
    }
    private _onceValue(pathFirebase: string, onLoad: () => void, onChange: (value: any) => void, snapshot: any) {
        let outerValue = snapshot.val();

        const outValue = {};
        if (outerValue) {
            Object.keys(outerValue).forEach((key) => {
                let value = outerValue[key];
                // Database value can be either { @: number, _: object } or { @: number, ...rest }
                let dateModified: number;
                if (value._) {
                    dateModified = value['@'];
                    value = value._;
                }

                const keys = key.split(Delimiter);
                value = globals.constructObject(keys, value, dateModified ? { '@': dateModified } : undefined);

                const fieldTransformsIn = this.fieldTransformsIn[pathFirebase];
                if (fieldTransformsIn) {
                    const transformed = transformObject(value, fieldTransformsIn);
                    value = transformed;
                    if (value['[object Object]']) debugger;
                }

                globals.mergeDeep(outValue, value);
            });
        }
        onChange(outValue);

        onLoad();

        this._hasLoadedValue[pathFirebase] = true;
    }
    private _onChange(pathFirebase: string, onChange: (value: any) => void, snapshot: any) {
        if (!this._hasLoadedValue[pathFirebase]) return;

        let value = snapshot.val();
        if (value) {
            // Database value can be either { @: number, _: object } or { @: number, ...rest }
            let dateModified: number;
            if (value._) {
                dateModified = value['@'];
                value = value._;
            } else if (Object.keys(value).length === 1 && value['@']) {
                value = undefined;
            }

            if (value) {
                const keys = snapshot.key.split(Delimiter);
                value = globals.constructObject(keys, value, dateModified ? { '@': dateModified } : undefined);

                const fieldTransformsIn = this.fieldTransformsIn[pathFirebase];
                if (fieldTransformsIn) {
                    const transformed = transformObject(value, fieldTransformsIn);
                    value = transformed;
                    if (value['[object Object]']) debugger;
                }

                if (this._pendingSaves[pathFirebase]) {
                    this._pendingSaves[pathFirebase].values.push(value);
                } else {
                    onChange(value);
                }
            }
        }
    }
    private validateMap(record: Record<string, any>) {
        if (__DEV__) {
            const values = Object.entries(record)
                .filter(([key]) => key !== '__dict' && key !== '__obj' && key !== '__arr' && key !== '_')
                .map(([key, value]) => value);
            if (values.length !== globals.arrayUniques(values).length) {
                console.error(
                    'Field transform map has duplicate values',
                    record,
                    values.length,
                    globals.arrayUniques(values).length
                );
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
