import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSettings, readHostContext } from '../../src/settings.js';

test('missing or malformed settings default to enabled', () => {
    for (const value of [undefined, null, [], 2, 'true', { enabled: 'false' }]) {
        const result = normalizeSettings(value);
        assert.equal(result.settings.enabled, true);
        assert.equal(result.changed, true);
    }
});
test('valid settings retain identity, false, and unknown values', () => {
    const original = { enabled: false, futureOption: { retained: true } };
    const result = normalizeSettings(original);
    assert.equal(result.settings, original);
    assert.equal(result.settings.enabled, false);
    assert.equal(result.changed, false);
    assert.deepEqual(original.futureOption, { retained: true });
});
test('defaults preserve future values and do not replace their objects', () => {
    const future = { color: 'keep' };
    const original = { future };
    assert.equal(normalizeSettings(original).settings.future, future);
    assert.equal(original.enabled, true);
});
test('host capabilities fail closed without exceptions', () => {
    for (const host of [null, {}, { getContext: 1 }, { getContext: () => { throw new Error('fixture'); } }, { getContext: () => ({ extensionSettings: {} }) }]) {
        assert.equal(readHostContext(host), null);
    }
});
test('supported host context is returned unchanged', () => {
    const context = { extensionSettings: {}, saveSettingsDebounced() {} };
    assert.equal(readHostContext({ getContext: () => context }), context);
});
