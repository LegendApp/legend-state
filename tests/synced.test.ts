import { observable, observe, syncState, when } from '@legendapp/state';
import { synced, syncObservable, SyncedSubscribeParams } from '@legendapp/state/sync';
import { promiseTimeout } from './testglobals';

describe('unsubscribe', () => {
    test('Canceling observe unsubscribes', async () => {
        let numObserves = 0;
        let numSubscribes = 0;
        let numUnsubscribes = 0;

        const obs$ = observable(
            synced({
                get: () => 'foo',
                subscribe: () => {
                    numSubscribes++;

                    return () => {
                        numUnsubscribes++;
                    };
                },
            }),
        );

        const unsubscribe = observe(() => {
            numObserves++;
            obs$.get();
        });

        expect(numObserves).toEqual(1);
        expect(numSubscribes).toEqual(1);
        expect(numUnsubscribes).toEqual(0);

        unsubscribe();

        await promiseTimeout(0);

        expect(numObserves).toEqual(1);
        expect(numSubscribes).toEqual(1);
        expect(numUnsubscribes).toEqual(1);

        obs$.get();

        expect(numObserves).toEqual(1);
        expect(numSubscribes).toEqual(1);
        expect(numUnsubscribes).toEqual(1);

        observe(() => {
            numObserves++;
            obs$.get();
        });

        await promiseTimeout(0);

        expect(numObserves).toEqual(2);
        expect(numSubscribes).toEqual(2);
        expect(numUnsubscribes).toEqual(1);
    });

    test('Canceling observe unsubscribes observing child node', async () => {
        let numObserves = 0;
        let numSubscribes = 0;
        let numUnsubscribes = 0;

        const obs$ = observable(
            synced({
                get: () => ({ foo: 'bar' }),
                subscribe: () => {
                    numSubscribes++;

                    return () => {
                        numUnsubscribes++;
                    };
                },
            }),
        );

        const unsubscribe = observe(() => {
            numObserves++;
            obs$.foo.get();
        });

        expect(numObserves).toEqual(1);
        expect(numSubscribes).toEqual(1);
        expect(numUnsubscribes).toEqual(0);

        unsubscribe();

        await promiseTimeout(0);

        expect(numObserves).toEqual(1);
        expect(numSubscribes).toEqual(1);
        expect(numUnsubscribes).toEqual(1);

        obs$.foo.get();

        expect(numObserves).toEqual(1);
        expect(numSubscribes).toEqual(1);
        expect(numUnsubscribes).toEqual(1);

        observe(() => {
            numObserves++;
            obs$.foo.get();
        });

        await promiseTimeout(0);

        expect(numObserves).toEqual(2);
        expect(numUnsubscribes).toEqual(1);
        expect(numSubscribes).toEqual(2);
    });
    test('Observing child re-subscribes even after root was previously observed directly', async () => {
        let numSubscribes = 0;
        let numUnsubscribes = 0;

        const obs$ = observable(
            synced({
                get: () => ({ foo: 'bar' }),
                subscribe: () => {
                    numSubscribes++;
                    return () => {
                        numUnsubscribes++;
                    };
                },
            }),
        );

        const unsubscribeRoot = observe(() => {
            obs$.get();
        });

        expect(numSubscribes).toEqual(1);
        expect(numUnsubscribes).toEqual(0);

        unsubscribeRoot();
        await promiseTimeout(0);

        expect(numSubscribes).toEqual(1);
        expect(numUnsubscribes).toEqual(1);

        const unsubscribeChild = observe(() => {
            obs$.foo.get();
        });

        await promiseTimeout(0);
        expect(numSubscribes).toEqual(2);
        expect(numUnsubscribes).toEqual(1);

        unsubscribeChild();
        await promiseTimeout(0);

        expect(numSubscribes).toEqual(2);
        expect(numUnsubscribes).toEqual(2);
    });
});

describe('synced', () => {
    test('observing synced linked observable', () => {
        const obs$ = observable({
            count: synced({
                initial: 0,
            }),
            total: (): number => {
                return obs$.count as any;
            },
        });

        let total = 0;
        observe(() => {
            total = obs$.total.get();
        });

        expect(total).toEqual(0);

        obs$.count.set(1);

        expect(total).toEqual(1);
    });

    test('observing synced array length', () => {
        const obs$ = observable({
            arr: synced({
                initial: [
                    { id: 1, text: 'a' },
                    { id: 2, text: 'b' },
                    { id: 3, text: 'c' },
                ],
            }),
            total: (): number => {
                return obs$.arr.length;
            },
        });

        let total = 0;
        observe(() => {
            total = obs$.total.get();
        });

        expect(total).toEqual(3);

        obs$.arr.push({ id: 4, text: 'd' });

        expect(total).toEqual(4);
    });
    test('observing synced array length 2', () => {
        const obs$ = observable({
            arr: synced({
                initial: [
                    { id: 1, text: 'a' },
                    { id: 2, text: 'b' },
                    { id: 3, text: 'c' },
                ],
            }),
            total: () => {
                return obs$.arr;
            },
        });

        let total = 0;
        observe(() => {
            total = obs$.total.length;
        });

        expect(total).toEqual(3);

        obs$.arr.push({ id: 4, text: 'd' });

        expect(total).toEqual(4);
    });
    test('no exponential get calls', () => {
        const page$ = observable(0);
        let getCalls = 0;
        const state$ = observable(
            synced({
                initial: 'noo',
                get: () => {
                    page$.get();
                    getCalls++;
                    return 'foo';
                },
            }),
        );
        observe(() => {
            state$.get();
        });
        page$.set((p) => p + 1);
        page$.set((p) => p + 1);
        page$.set((p) => p + 1);
        expect(getCalls).toEqual(4);
    });
});

describe('sync errors', () => {
    test('only a complete subscription snapshot can settle a failed initial load', async () => {
        let update!: SyncedSubscribeParams<string>['update'];
        const error = new Error('initial load failed');
        const obs$ = observable(
            synced({
                get: async (): Promise<string> => {
                    throw error;
                },
                subscribe: (params) => {
                    update = params.update;
                },
            }),
        );
        obs$.get();
        await promiseTimeout(5);
        const state$ = syncState(obs$);
        const readyValues: (string | undefined)[] = [];
        const dispose = state$.isLoaded.onChange(({ value }) => {
            if (value) readyValues.push(obs$.peek());
        });
        update({ value: 'older' });
        expect(state$.isLoaded.peek()).toBe(false);
        expect(obs$.peek()).toBeUndefined();
        update({ value: 'recovered', isLoaded: true });
        await promiseTimeout(0);
        expect(obs$.peek()).toBe('recovered');
        expect(state$.isLoaded.peek()).toBe(true);
        expect(state$.numPendingRemoteLoads.peek()).toBe(0);
        expect(state$.numPendingGets.peek()).toBe(0);
        expect(state$.error.peek()).toBeUndefined();
        expect(readyValues).toEqual(['recovered']);
        update({ value: 'newer', isLoaded: true });
        expect(obs$.peek()).toBe('newer');
        expect(state$.numPendingRemoteLoads.peek()).toBe(0);
        dispose();
    });

    test('a complete subscription snapshot still honors waitFor', async () => {
        const ready$ = observable(true);
        let update!: SyncedSubscribeParams<string>['update'];
        const obs$ = observable(
            synced({
                get: async (): Promise<string> => {
                    throw new Error('initial load failed');
                },
                subscribe: (params) => {
                    update = params.update;
                },
                waitFor: ready$,
            }),
        );
        obs$.get();
        await promiseTimeout(5);
        ready$.set(false);
        update({ value: 'recovered', isLoaded: true });
        expect(syncState(obs$).isLoaded.peek()).toBe(false);
        expect(obs$.peek()).toBeUndefined();
        ready$.set(true);
        await promiseTimeout(0);
        expect(obs$.peek()).toBe('recovered');
        expect(syncState(obs$).isLoaded.peek()).toBe(true);
    });

    test('a complete snapshot settles only its own source when multiple gets are pending', async () => {
        const obs$ = observable<string>();
        let update!: SyncedSubscribeParams<string>['update'];
        let resolveFirst!: (value: string) => void;
        let resolveSecond!: (value: string) => void;
        syncObservable(obs$, {
            get: () =>
                new Promise<string>((resolve) => {
                    resolveFirst = resolve;
                }),
            subscribe: (params) => {
                update = params.update;
            },
        });
        syncObservable(obs$, {
            get: () =>
                new Promise<string>((resolve) => {
                    resolveSecond = resolve;
                }),
        });
        const state$ = syncState(obs$);
        update({ value: 'older' });
        update({ value: 'snapshot', isLoaded: true });
        expect(state$.numPendingRemoteLoads.peek()).toBe(1);
        expect(state$.isLoaded.peek()).toBe(false);
        expect(obs$.peek()).toBeUndefined();
        resolveSecond('other source');
        await promiseTimeout(0);
        expect(state$.isLoaded.peek()).toBe(true);
        expect(obs$.peek()).toBe('snapshot');
        resolveFirst('old get');
        await promiseTimeout(0);
        expect(state$.numPendingRemoteLoads.peek()).toBe(0);
        expect(state$.numPendingGets.peek()).toBe(0);
        expect(obs$.peek()).toBe('snapshot');
    });

    test('asynchronous subscription errors are reported without throwing', async () => {
        let reportError!: (error: Error) => void;
        const onError = jest.fn();
        const obs$ = observable(
            synced({
                initial: 'cached',
                subscribe: ({ onError }) => {
                    reportError = onError;
                },
                onError,
            }),
        );
        obs$.get();
        await promiseTimeout(0);
        const error = new Error('subscription failed');
        expect(() => reportError(error)).not.toThrow();
        expect(syncState(obs$).error.peek()).toBe(error);
        expect(onError).toHaveBeenCalledWith(error, expect.objectContaining({ source: 'subscribe' }));
    });

    test('a rejected get settles its counter while another get is pending', async () => {
        const pending: { resolve: (value: string) => void; reject: (error: Error) => void }[] = [];
        const obs$ = observable(
            synced({
                get: () => new Promise<string>((resolve, reject) => pending.push({ resolve, reject })),
            }),
        );
        const dispose = observe(() => obs$.get());
        const state$ = syncState(obs$);
        await state$.sync();
        expect(state$.numPendingGets.peek()).toBe(2);
        pending[0].reject(new Error('get failed'));
        await promiseTimeout(0);
        expect(state$.numPendingGets.peek()).toBe(1);
        expect(state$.isGetting.peek()).toBe(true);
        pending[1].resolve('recovered');
        await promiseTimeout(0);
        expect(state$.numPendingGets.peek()).toBe(0);
        expect(state$.isGetting.peek()).toBe(false);
        expect(state$.isLoaded.peek()).toBe(true);
        expect(state$.error.peek()).toBeUndefined();
        expect(obs$.peek()).toBe('recovered');
        dispose();
    });
});

describe('complete subscription transforms', () => {
    test.each([false, true])(
        'publishes transformed snapshots before readiness (reject first=%s)',
        async (rejectFirst) => {
            let update!: SyncedSubscribeParams<string>['update'];
            let release!: () => void;
            const gate = new Promise<void>((resolve) => (release = resolve));
            const transformError = new Error('invalid snapshot');
            let reportRejection!: () => void;
            const rejected = new Promise<void>((resolve) => (reportRejection = resolve));
            const obs$ = observable(
                synced({
                    get: async (): Promise<string> => {
                        throw new Error('offline');
                    },
                    subscribe: (params) => {
                        update = params.update;
                    },
                    onError: (error) => {
                        if (error === transformError) reportRejection();
                    },
                    transform: {
                        load: async (value: string) => {
                            if (value === 'bad') throw transformError;
                            await gate;
                            return value.toUpperCase();
                        },
                    },
                }),
            );
            obs$.get();
            const state$ = syncState(obs$);
            await when(state$.error);
            const ready: string[] = [];
            const dispose = state$.isLoaded.onChange(({ value }) => {
                if (value) ready.push(obs$.peek());
            });
            if (rejectFirst) {
                update({ value: 'bad', isLoaded: true });
                await rejected;
                expect(state$.error.peek()).toBe(transformError);
                expect(state$.isLoaded.peek()).toBe(false);
            }
            update({ value: 'recovered', isLoaded: true });
            expect(state$.isLoaded.peek()).toBe(false);
            expect(obs$.peek()).toBeUndefined();
            release();
            await when(state$.isLoaded);
            expect(ready).toEqual(['RECOVERED']);
            expect(obs$.peek()).toBe('RECOVERED');
            expect(state$.numPendingRemoteLoads.peek()).toBe(0);
            expect(state$.error.peek()).toBeUndefined();
            dispose();
        },
    );
});

test('complete snapshots supersede an older asynchronous get transform', async () => {
    let update!: SyncedSubscribeParams<string>['update'];
    let start!: () => void;
    let release!: (value: string) => void;
    const started = new Promise<void>((resolve) => (start = resolve));
    const gate = new Promise<string>((resolve) => (release = resolve));
    const obs$ = observable(
        synced({
            get: () => 'get',
            subscribe: (params) => {
                update = params.update;
            },
            transform: {
                load: (value: string) => {
                    if (value === 'get') {
                        start();
                        return gate;
                    }
                    return value;
                },
            },
        }),
    );
    obs$.get();
    const state$ = syncState(obs$);
    await started;
    update({ value: 'snapshot', isLoaded: true });
    await promiseTimeout(0);
    expect(state$.isLoaded.peek()).toBe(true);
    expect(obs$.peek()).toBe('snapshot');
    expect(state$.numPendingGets.peek()).toBe(1);
    release('transformed get');
    await when(() => !state$.isGetting.get());
    await promiseTimeout(0);
    expect(obs$.peek()).toBe('snapshot');
    expect(state$.numPendingGets.peek()).toBe(0);
});

test('a rejected get from before reset cannot block complete snapshot recovery', async () => {
    const rejects: ((error: Error) => void)[] = [];
    let update!: SyncedSubscribeParams<string>['update'];
    const obs$ = observable(
        synced({
            get: () => new Promise<string>((_resolve, reject) => rejects.push(reject)),
            subscribe: (params) => {
                update = params.update;
            },
        }),
    );
    obs$.get();
    const state$ = syncState(obs$);
    await state$.reset();
    obs$.get();
    expect(rejects).toHaveLength(2);
    const error = new Error('current get failed');
    rejects[1](error);
    await when(state$.error);
    rejects[0](new Error('obsolete get failed'));
    await promiseTimeout(0);
    expect(state$.isLoaded.peek()).toBe(false);
    update({ value: 'recovered', isLoaded: true });
    await when(state$.isLoaded);
    expect(obs$.peek()).toBe('recovered');
});

test.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
])(
    'pre-reset GET completion cannot settle a current request (current first=%s, reject=%s)',
    async (currentFirst, rejectObsolete) => {
        const requests: { resolve: (value: string) => void; reject: (error: Error) => void }[] = [];
        const errors: Error[] = [];
        const obs$ = observable(
            synced({
                initial: 'initial',
                get: () => new Promise<string>((resolve, reject) => requests.push({ resolve, reject })),
                onError: (error) => errors.push(error),
            }),
        );
        obs$.get();
        const state$ = syncState(obs$);
        await state$.reset();
        obs$.get();
        expect(requests).toHaveLength(2);
        expect(state$.numPendingGets.peek()).toBe(1);
        const completeObsolete = () => {
            if (rejectObsolete) requests[0].reject(new Error('obsolete'));
            else requests[0].resolve('obsolete');
        };
        if (currentFirst) {
            requests[1].resolve('current');
            await when(state$.isLoaded);
            completeObsolete();
        } else {
            completeObsolete();
            await promiseTimeout(0);
            expect(state$.numPendingGets.peek()).toBe(1);
            expect(state$.isGetting.peek()).toBe(true);
            expect(state$.isLoaded.peek()).toBe(false);
            expect(obs$.peek()).toBe('initial');
            expect(errors).toEqual([]);
            requests[1].resolve('current');
            await when(state$.isLoaded);
        }
        await promiseTimeout(0);
        expect(state$.numPendingGets.peek()).toBe(0);
        expect(state$.isGetting.peek()).toBe(false);
        expect(obs$.peek()).toBe('current');
        expect(errors).toEqual([]);
    },
);

test.each([false, true])('reset discards an unfinished GET transform (reject=%s)', async (rejectTransform) => {
    let release!: () => void;
    let started!: () => void;
    const transforming = new Promise<void>((resolve) => {
        started = resolve;
    });
    const transformed = new Promise<string>((resolve, reject) => {
        release = () => (rejectTransform ? reject(new Error('obsolete transform')) : resolve('obsolete'));
    });
    let gets = 0;
    const errors: Error[] = [];
    const obs$ = observable(
        synced({
            initial: 'initial',
            get: () => (++gets === 1 ? 'old' : 'current'),
            transform: {
                load: (value) => {
                    if (value === 'old') {
                        started();
                        return transformed;
                    }
                    return value;
                },
            },
            onError: (error) => errors.push(error),
        }),
    );
    obs$.get();
    const state$ = syncState(obs$);
    await transforming;
    await state$.reset();
    obs$.get();
    await when(state$.isLoaded);
    release();
    await promiseTimeout(0);

    expect(obs$.peek()).toBe('current');
    expect(state$.numPendingGets.peek()).toBe(0);
    expect(state$.isGetting.peek()).toBe(false);
    expect(errors).toEqual([]);
});

test.each([false, true])(
    'superseded complete snapshots cannot publish old transforms or errors (reject=%s)',
    async (reject) => {
        let update!: SyncedSubscribeParams<string>['update'];
        let finishOld!: () => void;
        const staleError = new Error('obsolete transform');
        const old = new Promise<string>((resolve, rejectOld) => {
            finishOld = () => (reject ? rejectOld(staleError) : resolve('obsolete'));
        });
        const onError = jest.fn();
        const obs$ = observable(
            synced({
                get: async (): Promise<string> => {
                    throw new Error('offline');
                },
                subscribe: (params) => {
                    update = params.update;
                },
                transform: { load: (value: string) => (value === 'old' ? old : value) },
                onError,
            }),
        );
        obs$.get();
        const state$ = syncState(obs$);
        await when(state$.error);
        const ready: string[] = [];
        const dispose = state$.isLoaded.onChange(({ value }) => {
            if (value) ready.push(obs$.peek());
        });
        update({ value: 'old', isLoaded: true });
        expect(state$.isLoaded.peek()).toBe(false);
        update({ value: 'current', isLoaded: true });
        expect(state$.isLoaded.peek()).toBe(true);
        expect(ready).toEqual(['current']);
        finishOld();
        await promiseTimeout(0);
        expect(obs$.peek()).toBe('current');
        expect(state$.error.peek()).toBeUndefined();
        expect(onError).toHaveBeenCalledTimes(1);
        expect(state$.numPendingRemoteLoads.peek()).toBe(0);
        dispose();
    },
);

test('a subscribe-only complete snapshot applies before its later delta while another source loads', async () => {
    const obs$ = observable<string>();
    let resolveOther!: (value: string) => void;
    let update!: SyncedSubscribeParams<string>['update'];
    syncObservable(obs$, { get: () => new Promise<string>((resolve) => (resolveOther = resolve)) });
    syncObservable(obs$, {
        subscribe: (params) => {
            update = params.update;
        },
    });
    try {
        update({ value: 'snapshot', isLoaded: true });
        expect(obs$.peek()).toBe('snapshot');
        update({ value: 'newer' });
        expect(obs$.peek()).toBe('newer');
    } finally {
        resolveOther('other');
    }
    await promiseTimeout(0);
    expect(obs$.peek()).toBe('other');
});
