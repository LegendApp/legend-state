import path from 'node:path';
import fs from 'node:fs';
import pkg from './package.json';

async function copy(...files: string[]) {
    return files.map((file) => Bun.write('dist/' + file.replace('src/', ''), Bun.file(file), { createPath: true }));
}

copy(
    'LICENSE',
    'CHANGELOG.md',
    'README.md',
    'src/types/babel.d.ts',
    'src/types/reactive-native.d.ts',
    'src/types/reactive-web.d.ts',
);

const lsexports = pkg.lsexports;
const exports: Record<string, string | { import?: string; require?: string; types: string }> = {
    './package.json': './package.json',
    './babel': './babel.js',
    './types/babel': {
        types: './types/babel.d.ts',
    },
    './types/reactive-web': {
        types: './types/reactive-web.d.ts',
    },
    './types/reactive-native': {
        types: './types/reactive-native.d.ts',
    },
};
function addExport(key: string, file: string) {
    exports[key] = {
        import: `./${file}.mjs`,
        require: `./${file}.js`,
        types: `./${file}.d.ts`,
    };
}
lsexports.forEach((exp) => {
    if (exp.endsWith('/*')) {
        const p = exp.replace('/*', '');
        const files = fs.readdirSync(path.join('src', p));

        files.forEach((filename) => {
            const file = filename.replace(/\.[^/.]+$/, '');
            if (!file.startsWith('_')) {
                addExport(`${file === '.' ? '' : './'}${p}/${file}`, `${p}/${file}`);
            }
        });
    } else {
        addExport(exp === '.' ? exp : './' + exp, exp === '.' ? 'index' : exp);
    }
});

const pkgOut = pkg as Record<string, any>;

pkg.private = false;
pkgOut.exports = exports;
delete pkgOut.lsexports;
delete pkgOut.devDependencies;
delete pkgOut.overrides;
delete pkgOut.scripts;
delete pkgOut.engines;

Bun.write('dist/package.json', JSON.stringify(pkg, undefined, 2));

async function fix_To$(path: string) {
    const pathOld = path.replace('$', '_');
    await Bun.write(path, Bun.file(pathOld));
    fs.unlinkSync(pathOld);
}
fix_To$('dist/config/enable$GetSet.d.ts');
fix_To$('dist/config/enable$GetSet.d.mts');
