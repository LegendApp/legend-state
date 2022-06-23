import { isObjectEmpty } from '../src/FieldTransformer';
import { ObsPersistFirebaseBase } from '../src/ObsPersistFirebaseBase';

export class ObsPersistFirebaseJest extends ObsPersistFirebaseBase {
    constructor() {
        super({
            getCurrentUser: () => 'testuid',
            ref: (path: string) => {},
            orderByChild: (ref: any, child: string, start: number) => {},
            update: (object: object) => new Promise<void>((resolve) => {}),
            once: (ref: any, callback) => {},
            onChildAdded: () => {},
            onChildChanged: () => {},
            serverTimestamp: () => '__serverTimestamp',
            onAuthStateChanged: (cb) => {},
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
