import fs from 'node:fs';
import path from 'node:path';
import pkg from './package.json' assert { type: 'json' };

const extensions = ['js', 'js.map', 'mjs', 'mjs.map'];

Object.keys(pkg.exports).forEach((exp) => {
    // Adjust the rollup build to move the /* exports into a folder
    if (exp.split('/').length > 2) {
        const expPath = exp.replace('/*', '');
        const files = fs.readdirSync(path.join('src', expPath));
        const distPath = path.join('dist', expPath);
        const distTempPath = path.join(distPath, 'temp');
        files.forEach((file) => {
            const base = path.parse(file).name;
            extensions.map((ext) => {
                const filename = base + '.' + ext;
                fs.cpSync(path.join(distTempPath, filename), path.join(distPath, filename));
            });
            const dts = base + '.d.ts';
            fs.cpSync(path.join(distTempPath, 'src', expPath, dts), path.join(distPath, dts));
        });
        fs.rmSync(distTempPath, { recursive: true, force: true });
    }
});
