import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
// @ts-ignore
import pkg from './package.json';

const outputs = Object.keys(pkg.exports).flatMap((exp) => {
    let f = exp.slice(1);
    if (!f) f = '/index';

    return [
        {
            file: './dist' + f + '.js',
            format: 'cjs',
        },
        {
            file: './dist' + f + '.esm.js',
            format: 'es',
        },
    ];
});

export default Object.keys(pkg.exports).map((exp) => {
    // export default ['./react'].map((exp) => {
    let f = exp.slice(2);

    const external = ['react', 'react-native-mmkv', '@legendapp/state', '@legendapp/state/persist'];

    if (!f) f = 'index';

    return {
        input: './packages/' + f + '.ts',
        output: [
            {
                file: './dist/' + f + '.cjs',
                format: 'cjs',
            },
            {
                file: './dist/' + f + '.esm.mjs',
                format: 'es',
            },
        ],
        external: external,
        plugins: [
            resolve(),
            commonjs(),
            typescript({
                paths: {
                    react: ['node_modules/react'],
                    '@legendapp/state': ['./packages/index'],
                    '@legendapp/state/persist': ['./packages/persist'],
                },
            }),
        ],
    };
});
