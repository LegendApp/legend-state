import path from 'node:path';
import fs from 'node:fs';
import { defineConfig } from 'tsup';
// @ts-expect-error It says import assertions don't work, but they do
import pkg from './package.json' assert { type: 'json' };

const Exclude = new Set(['.DS_Store']);

const external = [
    '@babel/types',
    'next',
    'next/router',
    'react',
    'react-native',
    'react-native-mmkv',
    '@react-native-async-storage/async-storage',
    '@tanstack/react-query',
    '@tanstack/query-core',
    '@legendapp/state',
    '@legendapp/state/config',
    '@legendapp/state/persist',
    '@legendapp/state/sync',
    '@legendapp/state/sync-plugins/crud',
    '@legendapp/state/sync-plugins/tanstack-query',
    '@legendapp/state/react',
    '@legendapp/state/helpers/fetch',
    '@legendapp/state/react-reactive/enableReactive',
    'firebase/auth',
    'firebase/database',
];

const keys = pkg['lsexports']
    .filter((exp) => !exp.endsWith('.d.ts'))
    .flatMap((exp) => {
        if (exp === '.') {
            exp = 'index';
        }
        if (exp.endsWith('/*')) {
            const expPath = exp.replace('/*', '');

            const files = fs.readdirSync(path.join('src', expPath));
            const mapped = files.map((file) => !Exclude.has(file) && `src/${expPath}/${file}`);
            return mapped;
        } else {
            return exp + '.ts';
        }
    }) as string[];

const entry: Record<string, string> = {};
keys.forEach((key) => {
    entry[key.replace('src/', '').replace('.ts', '')] = key;
});

export default defineConfig({
    entry,
    format: ['cjs', 'esm'],
    external,
    dts: true,
    treeshake: true,
    splitting: false,
    clean: true,
});
