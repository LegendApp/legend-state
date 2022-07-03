import firebase from '@react-native-firebase/app';
import { FirebaseDatabaseTypes } from '@react-native-firebase/database';

import globals from 'common/globals';
import { ObsPersistFirebaseBase } from '../ObsPersistFirebaseBase';

export class ObsPersistFirebaseMobile extends ObsPersistFirebaseBase {
    constructor() {
        super();

        this.setFns({
            getCurrentUser: () => firebase.auth().currentUser?.uid,
            ref: (path: string) => firebase.database().ref(path),
            orderByChild: (ref: FirebaseDatabaseTypes.Query, child: string, start: number) =>
                ref.orderByChild(child).startAt(start),
            update: (object: object) => firebase.database().ref().update(object),
            once: (ref: FirebaseDatabaseTypes.Query, callback) =>
                ref.once('value', callback, (err) => console.error(ref.ref.toString(), err)),
            onChildAdded: (ref: FirebaseDatabaseTypes.Query, callback) => ref.on('child_added', callback),
            onChildChanged: (ref: FirebaseDatabaseTypes.Query, callback) => ref.on('child_changed', callback),
            serverTimestamp: () => firebase.database.ServerValue.TIMESTAMP,
            onAuthStateChanged: (callback) => firebase.auth().onUserChanged(callback),
        });
    }
}
