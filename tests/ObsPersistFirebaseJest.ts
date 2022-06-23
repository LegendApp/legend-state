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

export class ObsPersistFirebaseJest extends ObsPersistFirebaseBase {
    private remoteData: object;
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
            onChildChanged: () => {},
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
}
