import {
    Observable,
    computeSelector,
    isFunction,
    isNullOrUndefined,
    isNumber,
    isPromise,
    observable,
    symbolDelete,
    when,
} from '@legendapp/state';
import { FieldTransforms, SyncedErrorParams, SyncedGetParams, SyncedSubscribeParams } from '@legendapp/state/sync';
import {
    CrudAsOption,
    SyncedCrudPropsBase,
    SyncedCrudPropsMany,
    SyncedCrudReturnType,
    WaitForSetCrudFnParams,
    syncedCrud,
} from '@legendapp/state/sync-plugins/crud';
import { Unsubscribe, User, getAuth } from 'firebase/auth';
import {
    DataSnapshot,
    DatabaseReference,
    Query,
    push as firebasePush,
    query as firebaseQuery,
    ref as firebaseRef,
    remove as firebaseRemove,
    update as firebaseUpdate,
    getDatabase,
    onChildAdded,
    onChildChanged,
    onChildRemoved,
    onValue,
    orderByChild,
    serverTimestamp,
    startAt,
} from 'firebase/database';
import { invertFieldMap, transformObjectFields } from '../sync/transformObjectFields';

// TODO: fieldId should be required if Many, not if as: value
// as should default to value?
// Should it have mode merge by default?

export interface SyncedFirebaseProps<TRemote extends object, TLocal, TAs extends CrudAsOption = 'value'>
    extends Omit<SyncedCrudPropsMany<TRemote, TLocal, TAs>, 'list' | 'retry'>,
        Omit<SyncedCrudPropsBase<TRemote, TLocal>, 'onError'> {
    refPath: (uid: string | undefined) => string;
    query?: (ref: DatabaseReference) => DatabaseReference | Query;
    fieldId?: string;
    fieldTransforms?: FieldTransforms<TRemote>;
    onError?: (error: Error, params: FirebaseErrorParams) => void;
    // Also in global config
    realtime?: boolean;
    requireAuth?: boolean;
    readonly?: boolean;
}

interface SyncedFirebaseConfiguration {
    realtime?: boolean;
    requireAuth?: boolean;
    readonly?: boolean;
    enabled?: boolean;
}

const isEnabled$ = observable(true);

const firebaseConfig: SyncedFirebaseConfiguration = {} as SyncedFirebaseConfiguration;
export function configureSyncedFirebase(config: SyncedFirebaseConfiguration) {
    const { enabled, ...rest } = config;
    Object.assign(firebaseConfig, rest);
    if (enabled !== undefined) {
        isEnabled$.set(enabled);
    }
}

function joinPaths(str1: string, str2: string) {
    return str2 ? [str1, str2].join('/').replace(/\/\//g, '/') : str1;
}

interface FirebaseFns {
    isInitialized: () => boolean;
    getCurrentUser: () => string | undefined;
    ref: (path: string) => DatabaseReference;
    orderByChild: (ref: any, child: string, startAt: number) => any;
    once: (query: any, callback: (snapshot: DataSnapshot) => unknown, onError: (error: Error) => void) => () => void;
    onChildAdded: (
        query: any,
        callback: (snapshot: DataSnapshot) => unknown,
        cancelCallback?: (error: Error) => unknown,
    ) => () => void;
    onChildChanged: (
        query: any,
        callback: (snapshot: DataSnapshot) => unknown,
        cancelCallback?: (error: Error) => unknown,
    ) => () => void;
    onChildRemoved: (
        query: any,
        callback: (snapshot: DataSnapshot) => unknown,
        cancelCallback?: (error: Error) => unknown,
    ) => () => void;
    onValue: (
        query: any,
        callback: (snapshot: DataSnapshot) => unknown,
        cancelCallback?: (error: Error) => unknown,
    ) => () => void;
    serverTimestamp: () => any;
    update: (ref: DatabaseReference, object: object) => Promise<void>;
    remove(ref: DatabaseReference): Promise<void>;
    onAuthStateChanged: (cb: (user: User | null) => void) => Unsubscribe;
    generateId: () => string;
}

export interface FirebaseErrorParams extends Omit<SyncedErrorParams, 'source'> {
    source: 'list' | 'get' | 'create' | 'update' | 'delete';
}

type OnErrorFn = (error: Error, params: FirebaseErrorParams) => void;

const fns: FirebaseFns = {
    isInitialized: () => {
        try {
            return !!getAuth().app;
        } catch {
            return false;
        }
    },
    getCurrentUser: () => getAuth().currentUser?.uid,
    ref: (path: string) => firebaseRef(getDatabase(), path),
    orderByChild: (ref: DatabaseReference, child: string, start: number) =>
        firebaseQuery(ref, orderByChild(child), startAt(start)),
    update: (ref: DatabaseReference, object: object) => firebaseUpdate(ref, object),
    once: (ref: DatabaseReference, callback, callbackError) => {
        let unsubscribe: Unsubscribe | undefined;
        const cb = (snap: DataSnapshot) => {
            if (unsubscribe) {
                unsubscribe();
                unsubscribe = undefined;
            }
            callback(snap);
        };
        unsubscribe = onValue(ref, cb, callbackError);
        return unsubscribe;
    },
    onChildAdded,
    onChildChanged,
    onChildRemoved,
    onValue,
    serverTimestamp,
    remove: firebaseRemove,
    onAuthStateChanged: (cb) => getAuth().onAuthStateChanged(cb),
    generateId: () => firebasePush(firebaseRef(getDatabase())).key!,
};

export function syncedFirebase<TRemote extends object, TLocal = TRemote, TAs extends CrudAsOption = 'object'>(
    props: SyncedFirebaseProps<TRemote, TLocal, TAs>,
): SyncedCrudReturnType<TLocal, TAs> {
    props = { ...firebaseConfig, ...props } as any;
    const saving$ = observable<Record<string, boolean>>({});
    const pendingOutgoing$ = observable<Record<string, any>>({});
    const pendingIncoming$ = observable<Record<string, any>>({});
    let didList = false;

    const {
        refPath,
        query,
        fieldId,
        realtime,
        requireAuth,
        readonly,
        transform: transformProp,
        fieldTransforms,
        waitFor,
        waitForSet,
        ...rest
    } = props;
    const { fieldCreatedAt, changesSince } = props;
    const asType = props.as || ('value' as TAs);
    const fieldUpdatedAt = props.fieldUpdatedAt || '@';

    const computeRef = (lastSync: number) => {
        const pathFirebase = refPath(fns.getCurrentUser());

        let ref = fns.ref(pathFirebase);
        if (query) {
            ref = query(ref) as DatabaseReference;
        }
        if (changesSince === 'last-sync' && lastSync && fieldUpdatedAt && isNumber(lastSync)) {
            ref = fns.orderByChild(ref, fieldUpdatedAt, lastSync + 1) as DatabaseReference;
        }

        return ref;
    };

    const list = async (getParams: SyncedGetParams<TRemote>): Promise<TRemote[]> => {
        const { lastSync, onError } = getParams;
        const ref = computeRef(lastSync!);

        return new Promise((resolve) => {
            fns.once(
                ref,
                async (snap) => {
                    const val = snap.val();
                    let values: any[] = [];
                    if (!isNullOrUndefined(val)) {
                        values =
                            asType === 'value'
                                ? [val]
                                : Object.entries(val).map(([key, value]: [string, any]) => {
                                      if (fieldId && !value[fieldId!]) {
                                          value[fieldId!] = key;
                                      }
                                      return value;
                                  });
                    }
                    didList = true;
                    resolve(values);
                },
                (error) => (onError as OnErrorFn)(error, { source: 'list', type: 'get', retry: getParams }),
            );
        });
    };

    const subscribe = realtime
        ? ({ lastSync, update, onError }: SyncedSubscribeParams<TRemote[]>) => {
              const ref = computeRef(lastSync!);
              let unsubscribes: (() => void)[];

              if (asType === 'value') {
                  const onValue = (snap: DataSnapshot) => {
                      if (!didList) return;

                      const val = snap.val();
                      if (saving$[''].get()) {
                          pendingIncoming$[''].set(val);
                      } else {
                          update({
                              value: [val],
                              mode: 'set',
                          });
                      }
                  };
                  unsubscribes = [fns.onValue(ref, onValue, onError)];
              } else {
                  const onChildChange = (snap: DataSnapshot) => {
                      if (!didList) return;

                      const key = snap.key!;
                      const val = snap.val();

                      if (fieldId && !val[fieldId!]) {
                          val[fieldId!] = key;
                      }
                      if (saving$[key].get()) {
                          pendingIncoming$[key].set(val);
                      } else {
                          update({
                              value: [val],
                              mode: 'assign',
                          });
                      }
                  };
                  const onChildDelete = (snap: DataSnapshot) => {
                      if (!didList) return;

                      const key = snap.key!;
                      const val = snap.val();
                      if (fieldId && !val[fieldId!]) {
                          val[fieldId!] = key;
                      }
                      val[symbolDelete] = true;
                      update({
                          value: [val],
                          mode: 'assign',
                      });
                  };
                  unsubscribes = [
                      fns.onChildAdded(ref, onChildChange, onError),
                      fns.onChildChanged(ref, onChildChange, onError),
                      fns.onChildRemoved(ref, onChildDelete, onError),
                  ];
              }
              return () => {
                  unsubscribes.forEach((fn) => fn());
              };
          }
        : undefined;

    const addUpdatedAt = (input: TRemote) => {
        if (fieldUpdatedAt) {
            (input as any)[fieldUpdatedAt] = serverTimestamp();
        }
    };

    const addCreatedAt = (input: TRemote) => {
        if (fieldCreatedAt && !(input as any)[fieldCreatedAt]) {
            (input as any)[fieldCreatedAt] = serverTimestamp();
        }

        return addUpdatedAt(input);
    };

    const upsert = async (input: TRemote) => {
        const id: string = fieldId ? (input as any)[fieldId] : '';

        if (saving$[id].get()) {
            pendingOutgoing$[id].set(input);
        } else {
            saving$[id].set(true);

            const path = joinPaths(refPath(fns.getCurrentUser()), fieldId ? id : '');
            await fns.update(fns.ref(path), input);

            saving$[id].set(false);

            flushAfterSave();
        }

        // Wait for save to finish and return the latest incoming value
        return when(
            () => !pendingOutgoing$[id].get(),
            () => {
                // Return the latest value that came into subscribe while saving
                const value = pendingIncoming$[id].get();
                if (value) {
                    // Deleting it will make any subsequent pending saves return undefined and do nothing
                    // because we only need to apply it back once
                    pendingIncoming$[id].delete();
                    return value;
                }
            },
        );
    };

    const flushAfterSave = () => {
        const outgoing = pendingOutgoing$.get();
        Object.values(outgoing).forEach((value) => {
            upsert(value);
        });
        pendingOutgoing$.set({});
    };

    const create = readonly
        ? undefined
        : (input: TRemote) => {
              addCreatedAt(input);
              return upsert(input);
          };
    const update = readonly
        ? undefined
        : (input: TRemote) => {
              addUpdatedAt(input);
              return upsert(input);
          };
    const deleteFn = readonly
        ? undefined
        : (input: TRemote) => {
              const path = joinPaths(
                  refPath(fns.getCurrentUser()),
                  fieldId && asType !== 'value' ? (input as any)[fieldId] : '',
              );
              return fns.remove(fns.ref(path));
          };

    let isAuthedIfRequired$: Observable<boolean> | undefined;
    if (requireAuth) {
        if (fns.isInitialized()) {
            isAuthedIfRequired$ = observable(false);
            // TODO if needed: const unsubscribe =
            fns.onAuthStateChanged((user) => {
                isAuthedIfRequired$!.set(!!user);
            });
        }
    }

    let transform = transformProp;
    if (fieldTransforms) {
        const inverted = invertFieldMap(fieldTransforms);
        transform = {
            load(value, method) {
                const fieldTransformed = transformObjectFields(value, inverted);
                return transformProp?.load ? transformProp.load(fieldTransformed, method) : fieldTransformed;
            },
            save(value) {
                const transformed = transformProp?.save ? transformProp.save(value) : value;
                // TODO: Clean this repetition up
                if (isPromise(transformed)) {
                    return transformed.then((transformedValue) => {
                        return transformObjectFields(transformedValue as any, fieldTransforms);
                    });
                } else {
                    return transformObjectFields(transformed as any, fieldTransforms);
                }
            },
        };
    }

    return syncedCrud<TRemote, TLocal, TAs>({
        ...(rest as any), // Workaround for type errors
        list,
        subscribe,
        create,
        update,
        delete: deleteFn,
        waitFor: () =>
            isEnabled$.get() &&
            (isAuthedIfRequired$ ? isAuthedIfRequired$.get() : true) &&
            (waitFor ? computeSelector(waitFor) : true),
        waitForSet: (params: WaitForSetCrudFnParams<any>) =>
            isEnabled$.get() &&
            (isAuthedIfRequired$ ? isAuthedIfRequired$.get() : true) &&
            (waitForSet ? (isFunction(waitForSet) ? waitForSet(params) : waitForSet) : true),
        generateId: fns.generateId,
        transform,
        as: asType,
    }) as SyncedCrudReturnType<TLocal, TAs>;
}
export { invertFieldMap, transformObjectFields };
export type { FieldTransforms };
