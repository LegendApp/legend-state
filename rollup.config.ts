import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error It says import assertions don't work, but they do
import pkg from './package.json' assert { type: 'json' };

const Exclude = new Set(['.DS_Store']);

export default Object.keys(pkg.exports)
    .filter((exp) => exp !== './types' && exp !== './types-safe')
    .flatMap((exp) => {
        if (exp.endsWith('json')) return;

        let f = exp.slice(2);

        const external = [
            '@babel/types',
            'next',
            'next/router',
            'react',
            'react-native',
            'react-native-mmkv',
            '@tanstack/react-query',
            '@tanstack/query-core',
            '@legendapp/state',
            '@legendapp/state/persist',
            '@legendapp/state/react',
            '@legendapp/state/helpers/fetch',
        ];

        if (!f) f = 'index';

        const create = (file: string, outName: string) => {
            const output = [
                {
                    file: './dist/' + outName + '.js',
                    format: 'cjs',
                    sourcemap: true,
                } as {
                    file: string;
                    format: string;
                    sourcemap: boolean;
                    exports?: string;
                },
            ];

            if (exp === './babel') {
                output[0].exports = 'default';
            } else {
                output.push({
                    file: './dist/' + outName + '.mjs',
                    format: 'es',
                    sourcemap: true,
                });
            }

            return {
                input: './' + file + '.ts',
                output,
                external: external,
                plugins: [
                    resolve(),
                    commonjs(),
                    typescript({
                        outputToFilesystem: true,
                        paths: {
                            react: ['node_modules/react'],
                            'react-native': ['node_modules/react-native'],
                            '@legendapp/state': ['./index'],
                            '@legendapp/state/persist': ['./persist'],
                            '@legendapp/state/react': ['./react'],
                            '@legendapp/state/helpers/*': ['./src/helpers/*'],
                        },
                    }),
                ],
            };
        };

        if (exp.endsWith('/*')) {
            const expPath = exp.replace('/*', '');

            const files = fs.readdirSync(path.join('src', expPath));
            const mapped = files.map(
                (file) =>
                    !Exclude.has(file) &&
                    create(
                        path.join('./src', expPath, file.replace(/\.ts$/, '')),
                        path.join(expPath, 'temp', file.replace(/\.ts$/, ''))
                    )
            );
            return mapped;
        } else {
            return create(f, f);
        }
    })
    .filter((a) => a);
