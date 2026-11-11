import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { patchDarkReaderSource } from '../../scripts/darkreader-patch.mjs';

test('the pinned image-preservation adapter fails closed on changed or unexpected upstream code', async () => {
    const source = await readFile(new URL('../../node_modules/darkreader/darkreader.mjs', import.meta.url), 'utf8');
    assert.doesNotThrow(() => patchDarkReaderSource(source));
    assert.throws(() => patchDarkReaderSource('export const unsupported = true;'), /refusing an unverified bundle/);
    assert.throws(() => patchDarkReaderSource(source.replace('let selectorText = selector;', 'let selectorText = unsupported;')), /refusing an unverified bundle/);
    assert.throws(() => patchDarkReaderSource(source.replace('if (!didTryLoadCache) {', 'if (false) {')), /refusing an unverified bundle/);
});
