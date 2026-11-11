import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateManifest, validateProject } from '../../scripts/validate.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = JSON.parse(await readFile(new URL('../../manifest.json', import.meta.url), 'utf8'));

test('deliverable has all hook exports, local runtime, and licenses', async () => {
    const result = await validateProject(root);
    assert.deepEqual(result.errors, []);
    assert.equal(result.pass, true);
});
test('manifest rejects missing files and path escapes', async () => {
    for (const js of ['../outside.js', 'missing.js', 'C:/outside.js']) {
        assert.ok((await validateManifest(root, { ...manifest, js })).length);
    }
});
test('manifest rejects unexported hooks and deprecated Extras fields', async () => {
    assert.ok((await validateManifest(root, { ...manifest, hooks: { activate: 'doesNotExist' } })).length);
    assert.ok((await validateManifest(root, { ...manifest, requires: [] })).length);
});
