import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
// @ts-ignore
import pkg from './package.json';

export default Object.keys(pkg.exports)
    .filter((exp) => !exp.includes('-types'))
    .map((exp) => {
        if (exp.endsWith('json')) return;

        let f = exp.slice(2);

        const external = [
            'react',
            'react-native',
            'react-native-mmkv',
            '@legendapp/state',
            '@legendapp/state/persist',
            '@legendapp/state/react',
        ];

        if (!f) f = 'index';

        const output = [
            {
                file: './dist/' + f + '.js',
                format: 'cjs',
                sourcemap: true,
            },
        ];

        if (exp === './babel') {
            // @ts-ignore
            output[0].exports = 'default';
        } else {
            output.push({
                file: './dist/' + f + '.mjs',
                format: 'es',
                sourcemap: true,
            });
        }

        return {
            input: './' + f + '.ts',
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
                    },
                }),
            ],
        };
    })
    .filter((a) => a);
