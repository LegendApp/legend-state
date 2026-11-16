import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

test('React entry loads when CJS interop exposes only a default shim export', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'legend-state-shim-'));
    const root = resolve(__dirname, '..');
    try {
        const result = await build({
            entryPoints: [join(root, 'src/react/useSelector.ts')],
            bundle: true,
            platform: 'node',
            format: 'esm',
            write: false,
            tsconfig: join(root, 'tsconfig.json'),
            define: { 'process.env.NODE_ENV': '"test"' },
            plugins: [
                {
                    name: 'default-only-cjs-interop',
                    setup(build) {
                        build.onResolve({ filter: /^react$/ }, () => ({
                            path: require.resolve('react'),
                            external: true,
                        }));
                        build.onResolve({ filter: /^use-sync-external-store\/shim\/index\.js$/ }, () => ({
                            path: 'data:text/javascript,export default { useSyncExternalStore: function shim() {} };',
                            external: true,
                        }));
                    },
                },
            ],
        });
        const module = join(directory, 'react.mjs');
        writeFileSync(module, result.outputFiles[0].text);
        const code = `const m = await import(${JSON.stringify(pathToFileURL(module).href)}); console.log(typeof m.useValue);`;
        expect(execFileSync('node', ['--input-type=module', '--eval', code], { encoding: 'utf8' }).trim()).toBe(
            'function',
        );
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}, 15000);
