// @ts-ignore
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import {
    DatabaseReference,
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
    Unsubscribe,
    // @ts-ignore
} from 'firebase/database';
import { isObjectEmpty } from '../globals';
import { ObsPersistFirebaseBase } from '../ObsPersistFirebaseBase';

export class ObsPersistFirebaseWeb extends ObsPersistFirebaseBase {
    constructor() {
        super();

        this.setFns({
            getCurrentUser: () => getAuth().currentUser?.uid,
            ref: (path: string) => ref(getDatabase(), path),
            orderByChild: (ref: DatabaseReference, child: string, start: number) =>
                query(ref, orderByChild(child), startAt(start)),
            update: (object: object) => update(ref(getDatabase()), object),
            once: (ref: DatabaseReference, callback) => {
                let unsubscribe: Unsubscribe;
                const cb = (snap) => {
                    if (unsubscribe) {
                        unsubscribe();
                        unsubscribe = undefined;
                    }
                    callback(snap);
                };
                unsubscribe = onValue(ref, cb);
            },
            onChildAdded,
            onChildChanged,
            serverTimestamp,
            onAuthStateChanged: (cb) => onAuthStateChanged(getAuth(), cb),
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
}
