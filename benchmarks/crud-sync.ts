import { observable, syncState, when } from '../index';
import { syncedCrud } from '../src/sync-plugins/crud';
import { deepEqual } from '../src/sync/syncHelpers';
/** Run from the repo root: bun benchmarks/crud-sync.ts [baseline-ref]. Not part of CI.
 * Alternates isolated baseline/branch processes; reports every run and medians in ms/operation.
 * Uses actual CRUD + sync runtime, an echo transport, and preconstructed 1K/10K/100K item lists.
 * This measures local CPU/completion cost, not network throughput. Requires the baseline git ref.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sizes = [1000, 10000, 100000];
const workloads = sizes.flatMap((size) => [
    ...['scalar', 'tail'].flatMap((field) =>
        ['full', 'partial'].flatMap((mode) =>
            ['plain', 'transform'].map((transform) => `${size}/${field}/${mode}/${transform}`),
        ),
    ),
    `${size}/compare/clone`,
    `${size}/compare/identity`,
    `${size}/rows/object`,
    `${size}/rows/Map`,
]);

async function main() {
    if (!process.argv.includes('--worker')) {
        const baseline = execFileSync('git', ['rev-parse', process.argv[2] || 'origin/main'], {
            encoding: 'utf8',
        }).trim();
        const scratch = mkdtempSync(join(tmpdir(), 'legend-crud-bench-'));
        try {
            const sources = Object.fromEntries(
                [
                    'index.ts',
                    'src/ObservableObject.ts',
                    'src/sync/syncHelpers.ts',
                    'src/sync/syncObservable.ts',
                    'src/sync-plugins/crud.ts',
                    'src/helpers.ts',
                    'src/globals.ts',
                    'src/sync/retry.ts',
                ].map((path) => [path, execFileSync('git', ['show', `${baseline}:${path}`], { encoding: 'utf8' })]),
            );
            const preload = join(scratch, 'baseline.ts');
            writeFileSync(
                preload,
                `import { plugin } from 'bun';\nimport { dirname } from 'node:path';\nconst root = ${JSON.stringify(process.cwd())};\nconst sources = ${JSON.stringify(sources)};\nplugin({name:'baseline',setup(build){build.onLoad({filter:/\\/(index|src\\/(ObservableObject|globals|sync\\/(syncHelpers|syncObservable|retry)|sync-plugins\\/crud|helpers))\\.ts$/},({path})=>{if(!path.startsWith(root+'/'))return;const key=path.slice(root.length+1);return key in sources ? {contents:sources[key],loader:'ts',resolveDir:dirname(path)} : undefined;});}});`,
            );
            const runs: { version: string; round: number; results: Record<string, number> }[] = [];
            for (let round = 0; round < 6; round++) {
                const results: Record<string, Record<string, number>> = { baseline: {}, branch: {} };
                // Pair the same workload closely; isolate fixture/GC history in fresh processes.
                for (const workload of workloads) {
                    for (const version of round % 2 ? ['branch', 'baseline'] : ['baseline', 'branch']) {
                        const args = [
                            ...(version === 'baseline' ? ['--preload', preload] : []),
                            process.argv[1],
                            '--worker',
                            workload,
                        ];
                        Object.assign(
                            results[version],
                            JSON.parse(
                                execFileSync(process.execPath, args, {
                                    encoding: 'utf8',
                                    maxBuffer: 1024 * 1024,
                                    timeout: 60000,
                                }),
                            ),
                        );
                    }
                }
                for (const version of ['baseline', 'branch']) runs.push({ version, round, results: results[version] });
            }
            const median = (values: number[]) => {
                values.sort((a, b) => a - b);
                return (values[2] + values[3]) / 2;
            };
            const summary = Object.keys(runs[0].results).map((workload) => {
                const before = median(
                    runs.filter((run) => run.version === 'baseline').map((run) => run.results[workload]),
                );
                const after = median(
                    runs.filter((run) => run.version === 'branch').map((run) => run.results[workload]),
                );
                return { workload, baseline: before, branch: after, ratio: after / before };
            });
            console.log(
                JSON.stringify(
                    {
                        baseline,
                        head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
                        runtime: process.version,
                        runs,
                        summary,
                    },
                    null,
                    2,
                ),
            );
        } finally {
            rmSync(scratch, { recursive: true, force: true });
        }
    } else {
        const results: Record<string, number> = {};
        const requested = process.argv[3];
        for (const size of sizes) {
            if (requested && !requested.startsWith(`${size}/`)) continue;
            const list = Array.from({ length: size }, (_, i) => ({ id: String(i), value: i }));
            for (const transformed of [false, true])
                for (const partial of [false, true])
                    for (const tail of [false, true]) {
                        const workload = `${size}/${tail ? 'tail' : 'scalar'}/${partial ? 'partial' : 'full'}/${transformed ? 'transform' : 'plain'}`;
                        if (requested && requested !== workload) continue;
                        let called!: () => void;
                        const obs = observable(
                            syncedCrud({
                                as: 'value',
                                get: async () => ({ id: 'row', scalar: 1, list: structuredClone(list) }),
                                updatePartial: partial,
                                transform: transformed
                                    ? {
                                          save: (row) => ({
                                              ...row,
                                              ...(row.scalar !== undefined ? { scalar: row.scalar * 2 } : {}),
                                          }),
                                          load: (row) => ({
                                              ...row,
                                              ...(row.scalar !== undefined ? { scalar: row.scalar / 2 } : {}),
                                          }),
                                      }
                                    : undefined,
                                update: async (input) => {
                                    called();
                                    return input;
                                },
                            }),
                        );
                        obs.get();
                        const state = syncState(obs);
                        await when(state.isLoaded);
                        const execute = async (i: number) => {
                            const request = new Promise<void>((resolve) => {
                                called = resolve;
                            });
                            if (tail) obs.list[size - 1].value.set(size + i);
                            else obs.scalar.set(i);
                            await request;
                            await when(() => !state.isSetting.get());
                            if (tail ? obs.list[size - 1].value.peek() !== size + i : obs.scalar.peek() !== i) {
                                throw Error('Save completion lost the edited value');
                            }
                        };
                        await execute(2);
                        const start = performance.now();
                        for (let i = 3; i < 8; i++) await execute(i);
                        results[workload] = (performance.now() - start) / 5;
                    }
            for (const as of ['object', 'Map'] as const) {
                const workload = `${size}/rows/${as}`;
                if (requested && requested !== workload) continue;
                let called!: () => void;
                const obs: any = observable(
                    syncedCrud<any, any, any>({
                        as,
                        list: async () => structuredClone(list),
                        updatePartial: true,
                        update: async (input) => {
                            called();
                            return input;
                        },
                    }),
                );
                obs.get();
                const state = syncState(obs);
                await when(state.isLoaded);
                const row = as === 'Map' ? obs.get(String(size - 1)) : obs[String(size - 1)];
                const execute = async (i: number) => {
                    const request = new Promise<void>((resolve) => {
                        called = resolve;
                    });
                    row.value.set(size + i);
                    await request;
                    await when(() => !state.isSetting.get());
                    if (row.value.peek() !== size + i) throw Error('Collection save lost the edited value');
                };
                await execute(2);
                const start = performance.now();
                for (let i = 3; i < 8; i++) await execute(i);
                results[workload] = (performance.now() - start) / 5;
            }
            if (requested && !requested.includes('/compare/')) continue;
            const copy = structuredClone(list);
            for (const identity of [false, true]) {
                const workload = `${size}/compare/${identity ? 'identity' : 'clone'}`;
                if (requested && requested !== workload) continue;
                const right = identity ? list : copy;
                deepEqual(list, right);
                const iterations = identity ? 10000 : 5;
                const start = performance.now();
                for (let i = 0; i < iterations; i++) deepEqual(list, right);
                results[workload] = (performance.now() - start) / iterations;
            }
        }
        console.log(JSON.stringify(results));
    }
}
void main();
