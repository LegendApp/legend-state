import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
// @ts-ignore
import pkg from './package.json';

// export default ['./react'].map((exp) => {
export default Object.keys(pkg.exports)
    .map((exp) => {
        if (exp.endsWith('json')) return;

        let f = exp.slice(2);

        const external = ['react', 'react-native-mmkv', '@legendapp/state', '@legendapp/state/persist'];

        if (!f) f = 'index';

        return {
            input: './' + f + '.ts',
            output: [
                {
                    file: './dist/' + f + '.js',
                    format: 'cjs',
                    sourcemap: true,
                },
                {
                    file: './dist/' + f + '.mjs',
                    format: 'es',
                    sourcemap: true,
                },
            ],
            external: external,
            plugins: [
                resolve(),
                commonjs(),
                typescript({
                    outputToFilesystem: true,
                    paths: {
                        react: ['node_modules/react'],
                        '@legendapp/state': ['./index'],
                        '@legendapp/state/persist': ['./persist'],
                    },
                }),
            ],
        };
    })
    .filter((a) => a);
