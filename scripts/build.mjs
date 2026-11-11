import { build } from 'esbuild';
import { preserveImagesPlugin } from './darkreader-patch.mjs';
import { copyFile, mkdir, readFile } from 'node:fs/promises';

const version = JSON.parse(await readFile('package.json', 'utf8')).version;

await mkdir('dist', { recursive: true });
await build({
    entryPoints: ['src/index.js'], outfile: 'dist/index.js',
    define: { __NIGHTVEIL_VERSION__: JSON.stringify(version) },
    bundle: true, format: 'esm', platform: 'browser', target: ['es2022'],
    legalComments: 'eof', charset: 'utf8',
});
await build({
    entryPoints: ['src/frame-runtime.js'], outfile: 'dist/frame-runtime.js',
    bundle: true, format: 'iife', platform: 'browser', target: ['es2022'],
    minify: true, legalComments: 'eof', charset: 'utf8',
    plugins: [preserveImagesPlugin()],
    banner: { js: '(() => { const __darksillyChromeDescriptor = Object.getOwnPropertyDescriptor(window, "chrome");' },
    footer: { js: '})();' },
});
await copyFile('node_modules/darkreader/LICENSE', 'dist/DARKREADER-LICENSE');
await copyFile('docs/DARKREADER-PATCH.md', 'dist/DARKREADER-PATCH.md');
console.log('Built host module and isolated frame runtime (Dark Reader 4.9.135).');
