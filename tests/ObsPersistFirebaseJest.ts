import { objectAtPath } from '../src/globals';
import { isObjectEmpty } from '../src/FieldTransformer';
import { ObsPersistFirebaseBase } from '../src/ObsPersistFirebaseBase';

function clone(obj) {
    return obj ? JSON.parse(JSON.stringify(obj)) : obj;
}
function deepCompare(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

export class ObsPersistFirebaseJest extends ObsPersistFirebaseBase {
    private remoteData: object;
    private listeners: Record<string, ((value: any) => void)[]> = {};
    constructor() {
        super({
            getCurrentUser: () => 'testuid',
            ref: (path: string) => ({
                path,
            }),
            orderByChild: (ref: any, child: string, start: number) => {},
            update: (object: object) => new Promise<void>((resolve) => {}),
            once: (ref: { path: string }, callback) => {
                callback({
                    val: () => {
                        const val = objectAtPath(
                            ref.path.split('/').filter((a) => !!a),
                            this.remoteData
                        );
                        return clone(val);
                    },
                });
            },
            onChildAdded: () => {},
            onChildChanged: ({ path }: { path: string }, cb: (value: any) => void) => {
                if (!this.listeners[path]) {
                    this.listeners[path] = [];
                }
                this.listeners[path].push(cb);
            },
            serverTimestamp: () => '__serverTimestamp',
            onAuthStateChanged: (cb) => {
                cb({ name: 'User' });
            },
        });
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', (event) => {
                if (!isObjectEmpty(this._batch)) {
                    event.preventDefault();
                    return (event.returnValue = 'Please wait a moment, Bravely is still syncing.');
                }
            });
        }
    }
    initializeRemote(obj: object) {
        this.remoteData = obj;
    }
    modify(basePath: string, path: string, obj: object) {
        const prev = clone(this.remoteData);
        const data = objectAtPath(
            basePath.split('/').filter((a) => !!a),
            this.remoteData
        );
        const o = objectAtPath(
            path.split('/').filter((a) => !!a),
            data
        );

        Object.assign(o, obj);

        Object.keys(this.listeners).forEach((listenerPath) => {
            const pathArr = listenerPath.split('/').filter((a) => !!a);
            const dataAtPath = clone(objectAtPath(pathArr, this.remoteData));
            const prevAtPath = clone(objectAtPath(pathArr, prev));
            Object.keys(dataAtPath).forEach((key) => {
                if (!deepCompare(dataAtPath[key], prevAtPath[key])) {
                    const out = { key, val: () => dataAtPath[key] };
                    this.listeners[listenerPath]?.forEach((listener) => listener(out));
                }
            });
        });
    }
}
