import { isObjectEmpty } from '../src/FieldTransformer';
import { ObsPersistFirebaseBase } from '../src/ObsPersistFirebaseBase';

function objectAtPath(path: string[], value: object) {
    let o = value;
    for (let i = 0; i < path.length; i++) {
        if (o) {
            const p = path[i];
            o = o[p];
        }
    }

    return o;
}

function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
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
                    val: () =>
                        objectAtPath(
                            ref.path.split('/').filter((a) => !!a),
                            this.remoteData
                        ),
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
        const data = objectAtPath(
            basePath.split('/').filter((a) => !!a),
            this.remoteData
        );
        const prev = clone(data);
        const o = objectAtPath(
            (basePath + path).split('/').filter((a) => !!a),
            this.remoteData
        );
        Object.assign(o, obj);

        Object.keys(data).forEach((key) => {
            if (!deepCompare(data[key], prev[key])) {
                const out = { key, val: () => data[key] };
                this.listeners[basePath]?.forEach((listener) => listener(out));
            }
        });
    }
}
