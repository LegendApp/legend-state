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

export default {
    input: './index.ts',
    output: outputs,
    external: ['react'],
    plugins: [
        resolve(),
        commonjs(),
        typescript({
            // useTsconfigDeclarationDir: true,
        }),
    ],
};
