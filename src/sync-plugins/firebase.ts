import {
    Observable,
    UpdateFn,
    computeSelector,
    isNullOrUndefined,
    isNumber,
    isPromise,
    observable,
    symbolDelete,
    when,
} from '@legendapp/state';
import { FieldTransforms, SyncedGetParams, SyncedSubscribeParams } from '@legendapp/state/sync';
import {
    CrudAsOption,
    SyncedCrudPropsBase,
    SyncedCrudPropsMany,
    SyncedCrudReturnType,
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
import { invertFieldMap, transformObjectFields } from './_transformObjectFields';

// TODO: fieldId should be required if Many, not if as: value
// as should default to value?
// Should it have mode merge by default?

export interface SyncedFirebaseProps<TRemote extends object, TLocal, TAs extends CrudAsOption = 'value'>
    extends Omit<SyncedCrudPropsMany<TRemote, TLocal, TAs>, 'list' | 'retry'>,
        SyncedCrudPropsBase<TRemote, TLocal> {
    refPath: (uid: string | undefined) => string;
    query?: (ref: DatabaseReference) => DatabaseReference | Query;
    fieldId?: string;
    fieldTransforms?: FieldTransforms<TRemote>;
    // Also in global config
    realtime?: boolean;
    requireAuth?: boolean;
    readonly?: boolean;
}

interface SyncedFirebaseConfiguration {
    realtime?: boolean;
    requireAuth?: boolean;
    readonly?: boolean;
}

const firebaseConfig: SyncedFirebaseConfiguration = {} as SyncedFirebaseConfiguration;
export function configureSyncedFirebase(config: SyncedFirebaseConfiguration) {
    Object.assign(firebaseConfig, config);
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
    serverTimestamp: () => any;
    update: (ref: DatabaseReference, object: object) => Promise<void>;
    remove(ref: DatabaseReference): Promise<void>;
    onAuthStateChanged: (cb: (user: User | null) => void) => Unsubscribe;
    generateId: () => string;
}

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
    let updateFn: UpdateFn<any> | undefined = undefined;
    let didList = false;

    const {
        refPath,
        query,
        as: asType,
        fieldId,
        realtime,
        requireAuth,
        readonly,
        transform: transformProp,
        fieldTransforms,
        waitFor,
        ...rest
    } = props;
    const { fieldCreatedAt } = props;
    const fieldUpdatedAt = props.fieldUpdatedAt || '@';

    const computeRef = (lastSync: number) => {
        const pathFirebase = refPath(fns.getCurrentUser());

        let ref = fns.ref(pathFirebase);
        if (query) {
            ref = query(ref) as DatabaseReference;
        }
        if (lastSync && fieldUpdatedAt && isNumber(lastSync)) {
            ref = fns.orderByChild(ref, fieldUpdatedAt, lastSync + 1) as DatabaseReference;
        }

        return ref;
    };

    const onError = () => {
        // TODO
    };

    const list = async ({ lastSync }: SyncedGetParams): Promise<TRemote[]> => {
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
                onError,
            );
        });
    };

    const subscribe = realtime
        ? ({ lastSync, update }: SyncedSubscribeParams<TRemote[]>) => {
              const ref = computeRef(lastSync!);
              const onChildChange = (snap: DataSnapshot) => {
                  if (!didList) return;

                  const key = snap.key!;
                  const val = snap.val();
                  if (!saving$[key].get()) {
                      update({
                          value: [val],
                          mode: 'assign',
                      });
                  } else {
                      updateFn = update;
                      pendingIncoming$[key].set(val);
                  }
              };
              const onChildDelete = (snap: DataSnapshot) => {
                  if (!didList) return;

                  const key = snap.key!;
                  update({
                      value: [{ [key]: symbolDelete } as TRemote],
                      mode: 'assign',
                  });
              };
              const unsubscribes = [
                  fns.onChildAdded(ref, onChildChange),
                  fns.onChildChanged(ref, onChildChange),
                  fns.onChildRemoved(ref, onChildDelete),
              ];
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

            // Wait for save to finish but return undefined so it doesn't process the return value
            // because firebase update returns void so we need tog et the saved value from the change handlers.
            return when(
                () => !pendingOutgoing$[id].get(),
                () => undefined,
            );
        } else {
            saving$[id].set(true);

            const path = refPath(fns.getCurrentUser()) + (fieldId ? '/' + id : '');
            await fns.update(fns.ref(path), input);

            saving$[id].set(false);

            flushAfterSave();
        }
    };

    const flushAfterSave = () => {
        const incoming = pendingIncoming$.get();
        if (fieldId) {
            Object.values(incoming).forEach((value) => {
                updateFn!({ value: { [value[fieldId]]: value }, mode: 'merge' });
            });
        } else {
            updateFn!({ value: incoming, mode: 'merge' });
        }
        pendingIncoming$.set({});

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
              const path =
                  refPath(fns.getCurrentUser()) + (fieldId && asType !== 'value' ? '/' + (input as any)[fieldId] : '');
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
        ...rest,
        list,
        subscribe,
        create,
        update,
        delete: deleteFn,
        waitFor: () =>
            (isAuthedIfRequired$ ? isAuthedIfRequired$.get() : true) && (waitFor ? computeSelector(waitFor) : true),
        generateId: fns.generateId,
        transform,
        as: asType,
    }) as SyncedCrudReturnType<TLocal, TAs>;
}
export { invertFieldMap, transformObjectFields };
export type { FieldTransforms };