import { buildSync } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { observable, when } from '@legendapp/state';
import type { Change } from '@legendapp/state';
import { syncObservable } from '@legendapp/state/sync';
import { ObservablePersistLocalStorageBase } from '../src/persist-plugins/local-storage';
import { mockLocalStorage, promiseTimeout } from './testglobals';

// Bundle the immutable previous release separately so its imports cannot resolve to the current runtime.
const previousRef = '4818e7f4417b44a6c1645dce2ab64ae1aa5f054c';
let previous: {
    observable: typeof observable;
    syncObservable: typeof syncObservable;
    ObservablePersistLocalStorageBase: typeof ObservablePersistLocalStorageBase;
};
let previousDir: string;

beforeAll(() => {
    try {
        execFileSync('git', ['cat-file', '-e', previousRef + '^{commit}'], {
            cwd: join(__dirname, '..'),
            stdio: 'ignore',
        });
    } catch {
        throw new Error(`Downgrade test needs its baseline: git fetch --no-tags --depth=1 origin ${previousRef}`);
    }
    previousDir = mkdtempSync(join(tmpdir(), 'legend-state-downgrade-'));
    const archive = execFileSync('git', ['archive', previousRef, 'src', 'index.ts', 'sync.ts', 'tsconfig.json'], {
        cwd: join(__dirname, '..'),
        maxBuffer: 10 * 1024 * 1024,
    });
    execFileSync('tar', ['-xf', '-', '-C', previousDir], { input: new Uint8Array(archive) });
    writeFileSync(
        join(previousDir, 'entry.ts'),
        "export * from './index'; export { syncObservable } from './sync'; " +
            "export { ObservablePersistLocalStorageBase } from './src/persist-plugins/local-storage';",
    );
    const outfile = join(previousDir, 'previous.cjs');
    buildSync({
        entryPoints: [join(previousDir, 'entry.ts')],
        outfile,
        bundle: true,
        platform: 'node',
        format: 'cjs',
        tsconfig: join(previousDir, 'tsconfig.json'),
        logLevel: 'silent',
    });
    previous = require(outfile);
}, 15000);

afterAll(() => {
    if (previousDir) rmSync(previousDir, { recursive: true, force: true });
});

test('previous release reads current persisted data and replays outstanding pending writes', async () => {
    expect(previous.observable).not.toBe(observable);
    expect(previous.syncObservable).not.toBe(syncObservable);
    const storage = mockLocalStorage();
    const name = 'downgrade';
    const initial = { note: 'initial', nested: { count: 0 }, removed: 'delete me', untouched: 'keep me' };
    const value$ = observable(initial);
    const online$ = observable(false);
    const state$ = syncObservable(value$, {
        persist: { name, plugin: new ObservablePersistLocalStorageBase(storage), retrySync: true },
        waitForSet: online$,
        set: () => {},
    });
    await when(state$.isPersistLoaded);
    value$.note.set('first');
    await promiseTimeout();
    value$.note.set('latest');
    value$.nested.count.set(2);
    value$.removed.delete();
    await promiseTimeout();

    const expected = { note: 'latest', nested: { count: 2 }, untouched: 'keep me' };
    expect(JSON.parse(storage.getItem(name)!)).toEqual(expected);
    const metadata = JSON.parse(storage.getItem(name + '__m')!);
    expect(metadata.pending.note).toEqual({ p: 'initial', t: ['object'], h: [[]], v: 'latest', c: true });
    expect(metadata.pending['nested/count'].v).toBe(2);
    expect(metadata.pending.removed).toMatchObject({ k: ['removed'], d: true, c: true });
    expect(state$.getPendingChanges()).toEqual(metadata.pending);

    // The old process gets only bytes written by the new process, never its plugin cache or observables.
    state$.isPersistEnabled.set(false);
    const oldValue$ = previous.observable({});
    const oldOnline$ = previous.observable(false);
    const sent: any[] = [];
    const errors: Error[] = [];
    const oldState$ = previous.syncObservable(oldValue$, {
        persist: { name, plugin: new previous.ObservablePersistLocalStorageBase(storage), retrySync: true },
        waitForSet: oldOnline$,
        set: ({ value, changes }: { value: unknown; changes: Change[] }) => {
            sent.push({ value, changes });
        },
        onError: (error: Error) => errors.push(error),
    });
    await when(oldState$.isPersistLoaded);
    expect(oldValue$.get()).toStrictEqual(expected);
    expect(oldState$.getPendingChanges()).toEqual(metadata.pending);

    oldOnline$.set(true);
    await promiseTimeout(10);
    expect(errors).toEqual([]);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[sent.length - 1].value).toStrictEqual(expected);
    expect(
        sent.flatMap(({ changes }) => changes).sort((a, b) => a.path.join('/').localeCompare(b.path.join('/'))),
    ).toMatchObject([
        { path: ['nested', 'count'], pathTypes: ['object', 'object'], valueAtPath: 2, prevAtPath: 0 },
        { path: ['note'], pathTypes: ['object'], valueAtPath: 'latest', prevAtPath: 'initial' },
        { path: ['removed'], pathTypes: ['object'], valueAtPath: undefined, prevAtPath: 'delete me' },
    ]);
    expect(oldState$.getPendingChanges()).toEqual({});
    expect(oldState$.numPendingSets.get()).toBe(0);
    expect(JSON.parse(storage.getItem(name)!)).toEqual(expected);
    expect(JSON.parse(storage.getItem(name + '__m')!).pending).toEqual({});

    oldState$.isPersistEnabled.set(false);
    // Drain the new runtime's waiting writes after the downgrade assertions.
    online$.set(true);
    await promiseTimeout();
    expect(state$.getPendingChanges()).toEqual({});
}, 15000);
