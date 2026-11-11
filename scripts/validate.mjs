import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function validateManifest(root, manifest) {
    const errors = [];
    for (const name of ['display_name', 'author', 'version', 'js']) if (typeof manifest[name] !== 'string' || !manifest[name].trim()) errors.push('Missing ' + name);
    if (!/^[0-9]+[.][0-9]+[.][0-9]+$/.test(manifest.version || '')) errors.push('Invalid semantic version');
    const actualRoot = await realpath(root);
    for (const key of ['js', 'css']) {
        const relative = manifest[key];
        if (!relative) continue;
        const target = path.resolve(root, relative);
        const inside = path.relative(root, target);
        if (path.isAbsolute(relative) || inside.startsWith('..') || path.isAbsolute(inside)) { errors.push(key + ' escapes extension root'); continue; }
        try {
            const resolved = await realpath(target);
            const resolvedRelative = path.relative(actualRoot, resolved);
            if (resolvedRelative.startsWith('..') || path.isAbsolute(resolvedRelative) || !(await stat(target)).isFile()) errors.push(key + ' is unsafe');
        } catch { errors.push(key + ' file is missing'); }
    }
    if (manifest.requires || manifest.optional) errors.push('Deprecated Extras fields must not be introduced');
    if (errors.length) return errors;
    const source = await readFile(path.join(root, manifest.js), 'utf8');
    for (const hook of Object.values(manifest.hooks || {})) {
        if (typeof hook !== 'string' || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(hook)) { errors.push('Invalid hook identifier'); continue; }
        if (!new RegExp('export[^{]*[{][^}]*' + hook + '[^}]*[}]', 's').test(source)) errors.push('Hook is not exported: ' + hook);
    }
    return errors;
}

export async function validateProject(root) {
    const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
    const errors = await validateManifest(root, manifest);
    const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    if (pkg.dependencies.darkreader !== '4.9.135') errors.push('Dark Reader must be pinned to 4.9.135');
    if (pkg.version !== manifest.version) errors.push('Package and extension versions differ');
    if (manifest.minimum_client_version !== '1.14.0') errors.push('Unexpected host compatibility baseline');
    for (const file of ['dist/frame-runtime.js', 'dist/DARKREADER-LICENSE', 'dist/DARKREADER-PATCH.md', 'LICENSE', 'capability-contract.json', 'README.md']) {
        try { if (!(await stat(path.join(root, file))).isFile()) errors.push('Missing ' + file); } catch { errors.push('Missing ' + file); }
    }
    return { pass: errors.length === 0, errors, version: manifest.version, baseline: manifest.minimum_client_version };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const result = await validateProject(process.cwd());
    console.log(JSON.stringify(result, null, 2));
    if (!result.pass) process.exitCode = 1;
}
