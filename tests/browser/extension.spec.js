import { test, expect } from '@playwright/test';

async function boot(page, query = '?empty=1') {
    await page.goto('/demo/' + query);
    await page.waitForFunction(() => window.demoReady);
    await page.evaluate(() => window.demoReady);
    await openSettings(page);
    await expect(page.locator('#darksilly-title')).toHaveText('夜帷 · Nightveil');
}
async function openSettings(page) {
    const panel = page.locator('#darksilly-settings');
    await expect(panel).toBeVisible();
    if (!await panel.evaluate(element => element.open)) await panel.locator('summary').click();
    await expect(page.locator('#darksilly-enabled')).toBeVisible();
}
async function add(page, options = {}, kind = 'light') {
    return page.evaluate(({ options, kind }) => window.demo.addCard(kind, options), { options, kind });
}
async function active(page, count) {
    await expect.poll(() => page.evaluate(() => window.extension.getDiagnostics().active)).toBe(count);
}
function frame(page, id) { return page.frame({ name: id }); }
async function ready(page, id, selector = 'body') {
    await expect.poll(() => Boolean(frame(page, id))).toBe(true);
    await frame(page, id).waitForSelector(selector);
    return frame(page, id);
}
async function color(target, selector, property = 'backgroundColor') {
    return target.locator(selector).evaluate((node, property) => getComputedStyle(node)[property], property);
}
function rgb(color) { return (color.match(/[0-9.]+/g) || []).slice(0, 3).map(Number); }
function luminance(color) {
    const channels = rgb(color).map((value) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
async function expectDark(target, selector) {
    await expect.poll(async () => luminance(await color(target, selector))).toBeLessThan(0.18);
}

test('white surfaces darken with readable text; host and media stay unchanged', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await boot(page, '?empty=1&enabled=0');
    const id = await add(page);
    const target = await ready(page, id, '#light-panel');
    const originalSource = await page.locator('[id="' + id + '"]').getAttribute('srcdoc');
    const hostColor = await color(page, 'body');
    const originalBox = await target.locator('#light-panel').boundingBox();
    const originalCanvas = await target.locator('#canvas').evaluate((canvas) => Array.from(canvas.getContext('2d').getImageData(0, 0, 160, 54).data));
    await target.locator('#illustration').evaluate((image) => image.decode());
    const image = target.locator('#illustration');
    await image.scrollIntoViewIfNeeded();
    let box = await image.boundingBox();
    const beforePixels = await page.screenshot({ clip: { x: box.x + 5, y: box.y + 5, width: box.width - 10, height: box.height - 10 } });
    await page.locator('#darksilly-enabled').check();
    await active(page, 1);
    await expectDark(target, '#light-panel');
    await expectDark(target, '#inline');
    const foreground = luminance(await color(target, '#light-panel', 'color'));
    const background = luminance(await color(target, '#light-panel'));
    expect((foreground + 0.05) / (background + 0.05)).toBeGreaterThanOrEqual(4.5);
    expect(await color(page, 'body')).toBe(hostColor);
    expect(await target.locator('#light-panel').evaluate((node) => getComputedStyle(node).filter)).toBe('none');
    expect(await page.locator('[id="' + id + '"]').getAttribute('srcdoc')).toBe(originalSource);
    const afterBox = await target.locator('#light-panel').boundingBox();
    expect(afterBox.width).toBeCloseTo(originalBox.width, 2);
    expect(afterBox.height).toBeCloseTo(originalBox.height, 2);
    await image.scrollIntoViewIfNeeded();
    box = await image.boundingBox();
    const afterPixels = await page.screenshot({ clip: { x: box.x + 5, y: box.y + 5, width: box.width - 10, height: box.height - 10 } });
    expect(Buffer.compare(beforePixels, afterPixels)).toBe(0);
    for (const selector of ['#illustration', '#video', '#canvas']) expect(await color(target, selector, 'filter')).toBe('none');
    expect(await target.locator('#canvas').evaluate((canvas) => Array.from(canvas.getContext('2d').getImageData(0, 0, 160, 54).data))).toEqual(originalCanvas);
    const gradient = await color(target, '#gradient', 'backgroundImage');
    expect(gradient).toContain('linear-gradient');
    const stops = gradient.match(/rgba?[(][^)]*[)]/g) || [];
    expect(stops.length).toBeGreaterThanOrEqual(2);
    const gradientText = luminance(await color(target, '#gradient', 'color'));
    for (const stop of stops) {
        expect(luminance(stop)).toBeLessThan(0.18);
        expect((gradientText + 0.05) / (luminance(stop) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
    expect(await color(target, '#transparent')).toBe('rgba(0, 0, 0, 0)');
    expect(pageErrors).toEqual([]);
});

test('disable restores author colors and removes owned runtime styles', async ({ page }) => {
    await boot(page, '?empty=1&enabled=0');
    const id = await add(page);
    const target = await ready(page, id, '#inline');
    const selectors = ['html', 'body', '#light-panel', '#inline', '#dark-panel', '#gradient'];
    const originals = await Promise.all(selectors.map(async (selector) => ({ background: await color(target, selector), color: await color(target, selector, 'color'), image: await color(target, selector, 'backgroundImage') })));
    const authorStyles = await target.locator('style').allTextContents();
    for (let index = 0; index < 3; index++) {
        await page.locator('#darksilly-enabled').check();
        await active(page, 1);
        await expectDark(target, '#inline');
        await page.locator('#darksilly-enabled').uncheck();
        await active(page, 0);
        await expect(target.locator('style.darkreader, script[data-darksilly-owner]')).toHaveCount(0);
        const restored = await Promise.all(selectors.map(async (selector) => ({ background: await color(target, selector), color: await color(target, selector, 'color'), image: await color(target, selector, 'backgroundImage') })));
        expect(restored).toEqual(originals);
        expect(await target.locator('style').allTextContents()).toEqual(authorStyles);
    }
});

test('existing dark designs retain their layout, dark surfaces, and accent hue', async ({ page }) => {
    await boot(page, '?empty=1&enabled=0');
    const id = await add(page, {}, 'dark');
    const target = await ready(page, id, '#original-dark');
    const before = await target.locator('#original-dark').boundingBox();
    const beforeBackground = luminance(await color(target, '#original-dark'));
    await page.locator('#darksilly-enabled').check();
    await active(page, 1);
    await expectDark(target, '#original-dark');
    const after = await target.locator('#original-dark').boundingBox();
    expect(after.width).toBeCloseTo(before.width, 2);
    expect(after.height).toBeCloseTo(before.height, 2);
    expect(luminance(await color(target, '#original-dark'))).toBeLessThan(beforeBackground + 0.03);
    const accent = rgb(await color(target, '.accent', 'color'));
    expect(accent[2]).toBeGreaterThan(accent[0]);
});

test('new white panels, thinking details, dialogs, inputs and buttons remain functional', async ({ page }) => {
    await boot(page);
    const id = await add(page);
    await active(page, 1);
    const target = frame(page, id);
    await target.locator('#thinking summary').click();
    await expect(target.locator('#thought')).toBeVisible();
    await target.locator('#choose').click();
    await expect(target.locator('#result')).toHaveText('1');
    await target.locator('#name').fill('夜行旅人');
    await expect(target.locator('#name')).toHaveValue('夜行旅人');
    await target.locator('#route').selectOption({ label: '探索' });
    await expect(target.locator('#route')).toHaveValue('探索');
    await target.locator('#notes').fill('准备出发');
    await target.evaluate(() => window.cardApi.addPanel());
    await expectDark(target, '#dynamic-panel');
    await target.locator('#open-dialog').click();
    await expect(target.locator('#quest-dialog')).toBeVisible();
    await expectDark(target, '#quest-dialog');
    await target.locator('#close-dialog').click();
    await expect(target.locator('#quest-dialog')).not.toBeVisible();
});

test('Blob documents and dynamically inserted same-origin nested frames are supported', async ({ page }) => {
    await boot(page);
    const id = await add(page, { blob: true });
    await active(page, 1);
    const target = frame(page, id);
    await expectDark(target, '#light-panel');
    expect(target.url()).toContain('blob:');
    await target.evaluate(() => {
        const child = document.createElement('iframe');
        child.name = child.id = 'nested-card';
        child.srcdoc = '<html><head><style>body{background:white;color:black}</style></head><body>嵌套前端</body></html>';
        document.body.append(child);
    });
    await active(page, 2);
    await expectDark(frame(page, 'nested-card'), 'body');
    await target.locator('#nested-card').evaluate((node) => node.remove());
    await active(page, 1);
    expect((await page.evaluate(() => window.extension.getDiagnostics())).frames).toBe(1);
});

test('iframe navigation disposes the previous document', async ({ page }) => {
    await boot(page);
    const id = await add(page);
    await active(page, 1);
    await page.evaluate(async (id) => {
        const node = document.getElementById(id);
        window.oldFixtureDocument = node.contentDocument;
        node.srcdoc = await (await fetch('/tests/fixtures/dark.html')).text();
    }, id);
    const target = await ready(page, id, '#original-dark');
    await expectDark(target, '#original-dark');
    await expect.poll(() => page.evaluate(() => window.oldFixtureDocument.querySelectorAll('style.darkreader, script[data-darksilly-owner]').length)).toBe(0);
    await expect(target.locator('script[data-darksilly-owner]')).toHaveCount(1);
    expect((await page.evaluate(() => window.extension.getDiagnostics())).frames).toBe(1);
});

test('late IDs and chat replacement work without scanning the host again; backend frames stay unchanged', async ({ page }) => {
    await boot(page);
    const backend = await add(page, { id: 'TH-script--backend' });
    const unrelated = await add(page, { id: 'unrelated-iframe' });
    await ready(page, backend, '#light-panel');
    await ready(page, unrelated, '#light-panel');
    expect((await page.evaluate(() => window.extension.getDiagnostics())).frames).toBe(0);
    expect(luminance(await color(frame(page, backend), '#light-panel'))).toBeGreaterThan(0.9);
    await page.locator('#unrelated-iframe').evaluate((node) => { node.id = node.name = 'TH-message--late'; });
    await active(page, 1);
    await page.evaluate(() => { const next = document.createElement('main'); next.id = 'chat'; document.getElementById('chat').replaceWith(next); });
    await active(page, 0);
    const id = await add(page);
    await active(page, 1);
    await expectDark(frame(page, id), '#light-panel');
    expect((await page.evaluate(() => window.extension.getDiagnostics())).hostScans).toBe(1);
});

test('cross-origin, sandbox and CSP failures are isolated and reported', async ({ page }) => {
    await boot(page);
    await add(page, { id: 'TH-message--cross', src: 'http://127.0.0.1:4174/tests/fixtures/card.html' });
    await add(page, { id: 'TH-message--sandbox', sandbox: 'allow-same-origin' });
    await add(page, { id: 'TH-message--opaque', sandbox: 'allow-scripts' });
    await add(page, { id: 'TH-message--csp', html: `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'"><style>body{background:white;color:black}</style><body>CSP 示例</body>` });
    const good = await add(page);
    await active(page, 1);
    await expect.poll(() => page.evaluate(() => window.extension.getDiagnostics().skipped)).toBe(4);
    const result = await page.evaluate(() => window.extension.getDiagnostics());
    expect(result.reasons.inaccessible).toBe(1);
    expect(result.reasons.sandbox).toBe(2);
    expect(result.reasons['script-blocked']).toBe(1);
    await expectDark(frame(page, good), '#light-panel');
    await expect(page.locator('#darksilly-status')).toContainText('跳过 4 个');
});

test('an existing Dark Reader owner is left intact', async ({ page }) => {
    await boot(page);
    const id = await add(page, { html: '<!doctype html><html><head><meta name="darkreader" content="existing-owner"><style class="darkreader">body{background:#123;color:#def}</style></head><body>已有引擎</body></html>' });
    await ready(page, id);
    await expect.poll(() => page.evaluate(() => window.extension.getDiagnostics().reasons['other-engine'])).toBe(1);
    const target = frame(page, id);
    const original = await color(target, 'body');
    await expect(target.locator('script[data-darksilly-owner]')).toHaveCount(0);
    await page.locator('#darksilly-enabled').uncheck();
    await expect(target.locator('meta[name=darkreader]')).toHaveAttribute('content', 'existing-owner');
    await expect(target.locator('style.darkreader')).toHaveCount(1);
    expect(await color(target, 'body')).toBe(original);
});

test('inaccessible external styles degrade locally without stopping other conversion', async ({ page }) => {
    await boot(page);
    const id = await add(page, { html: '<!doctype html><html><head><link rel="stylesheet" href="http://127.0.0.1:4174/denied.css"><style>body{background:white;color:black}.local{background:white;color:black;padding:10px}</style></head><body><div class="external">外部样式</div><div class="local">本地样式</div></body></html>' });
    await active(page, 1);
    await expectDark(frame(page, id), '.local');
    await page.locator('#darksilly-enabled').uncheck();
    expect(luminance(await color(frame(page, id), '.local'))).toBeGreaterThan(0.9);
});

test('settings persist; lifecycle hooks are idempotent and cleanup is scoped', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
        window.demo.context.extensionSettings.otherExtension = { keep: true };
        window.demo.context.extensionSettings.darksilly.futureOption = 'keep';
        for (let i = 0; i < 4; i++) { window.extension.onActivate(); window.extension.onEnable(); }
    });
    const id = await add(page);
    await active(page, 1);
    await expect(page.locator('#darksilly-settings')).toHaveCount(1);
    await expect(frame(page, id).locator('script[data-darksilly-owner]')).toHaveCount(1);
    await page.locator('#darksilly-enabled').uncheck();
    await page.reload();
    await page.waitForFunction(() => window.demoReady);
    await page.evaluate(() => window.demoReady);
    await openSettings(page);
    await expect(page.locator('#darksilly-enabled')).not.toBeChecked();
    expect(await page.evaluate(() => window.demo.context.extensionSettings.darksilly.futureOption)).toBe('keep');
    const secondId = await add(page);
    const secondFrame = await ready(page, secondId, '#light-panel');
    expect(luminance(await color(secondFrame, '#light-panel'))).toBeGreaterThan(0.9);
    await page.locator('#darksilly-enabled').check();
    await active(page, 1);
    await page.evaluate(() => { window.extension.onDisable(); window.extension.onDisable(); });
    await expect(page.locator('#darksilly-settings')).toHaveCount(0);
    await expect(secondFrame.locator('style.darkreader, script[data-darksilly-owner]')).toHaveCount(0);
    await page.evaluate(() => window.extension.onEnable());
    await active(page, 1);
    await page.evaluate(() => window.extension.onClean());
    await expect(page.locator('#darksilly-settings')).toHaveCount(0);
    expect(await page.evaluate(() => Object.hasOwn(window.demo.context.extensionSettings, 'darksilly'))).toBe(false);
    expect(await page.evaluate(() => window.demo.context.extensionSettings.otherExtension)).toEqual({ keep: true });
});

test('turning off during a delayed frame-runtime request cannot reactivate dark mode', async ({ page }) => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let requested = false;
    let fulfilled = false;
    await page.route('**/dist/frame-runtime.js*', async (route) => {
        requested = true;
        await gate;
        try { await route.fulfill({ path: 'dist/frame-runtime.js', contentType: 'text/javascript' }); } catch { /* Removal may cancel the request. */ }
        fulfilled = true;
    });
    await boot(page);
    const id = await add(page);
    await ready(page, id, '#light-panel');
    await expect.poll(() => requested).toBe(true);
    await page.locator('#darksilly-enabled').uncheck();
    release();
    await expect.poll(() => fulfilled).toBe(true);
    // Deliberately allow a late/cancelled network script its next execution turn.
    await page.waitForTimeout(250);
    await expect(frame(page, id).locator('style.darkreader, script[data-darksilly-owner]')).toHaveCount(0);
    expect(luminance(await color(frame(page, id), '#light-panel'))).toBeGreaterThan(0.9);
    await page.unroute('**/dist/frame-runtime.js*');
    await page.locator('#darksilly-enabled').check();
    await active(page, 1);
    await page.evaluate(() => { window.extension.onDisable(); window.extension.onEnable(); window.extension.onDisable(); });
    await expect(page.locator('#darksilly-settings')).toHaveCount(0);
    await expect(frame(page, id).locator('style.darkreader')).toHaveCount(0);
});

test('many frontends and text streaming do not repeat whole-document scans or injections', async ({ page }) => {
    await boot(page);
    const ids = await Promise.all(Array.from({ length: 6 }, () => add(page)));
    await active(page, 6);
    const before = await page.evaluate(() => window.extension.getDiagnostics());
    await frame(page, ids[0]).evaluate(() => {
        const output = document.getElementById('result');
        for (let index = 0; index < 120; index++) output.textContent = String(index);
    });
    await expect(frame(page, ids[0]).locator('#result')).toHaveText('119');
    const after = await page.evaluate(() => window.extension.getDiagnostics());
    expect(after.hostScans).toBe(1);
    expect(after.documentScans).toBe(6);
    expect(after.injections).toBe(before.injections);
    for (const id of ids) await expect(frame(page, id).locator('script[data-darksilly-owner]')).toHaveCount(1);
    await page.evaluate(() => window.demo.clear());
    await expect.poll(() => page.evaluate(() => window.extension.getDiagnostics().frames)).toBe(0);
    expect((await page.evaluate(() => window.extension.getDiagnostics())).scopes).toBe(1);
});

test('desktop and narrow-screen layouts fit with an unchanged host theme', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await boot(page, '');
    await active(page, 2);
    await expectDark(frame(page, 'TH-message--demo-0'), '#light-panel');
    await page.screenshot({ path: testInfo.outputPath('desktop-dark.png'), fullPage: true });
    await page.locator('#darksilly-enabled').uncheck();
    await page.screenshot({ path: testInfo.outputPath('desktop-original.png'), fullPage: true });
    await page.locator('#darksilly-enabled').check();
    await active(page, 2);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const target = frame(page, 'TH-message--demo-0');
    expect(await target.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('mobile-dark.png'), fullPage: true });
});

test('inline important conversion preserves rolecard edits and restores priorities without engine residue', async ({ page }) => {
    await boot(page, '?empty=1&enabled=0');
    const id = await add(page);
    const target = await ready(page, id, '#inline');
    await target.locator('#inline').evaluate((node) => node.style.setProperty('--author-flag', 'keep'));
    await page.locator('#darksilly-enabled').check();
    await active(page, 1);
    await expectDark(target, '#inline');
    await target.locator('#inline').evaluate((node) => {
        node.style.setProperty('background-color', 'rgb(250, 240, 230)', 'important');
        node.style.setProperty('color', 'rgb(20, 20, 20)', '');
        node.style.setProperty('border-radius', '17px');
    });
    await target.evaluate(() => window.cardApi.addPanel());
    await expectDark(target, '#dynamic-panel');
    await expectDark(target, '#inline');
    await page.locator('#darksilly-enabled').uncheck();
    expect(await color(target, '#inline')).toBe('rgb(250, 240, 230)');
    expect(await color(target, '#inline', 'color')).toBe('rgb(20, 20, 20)');
    expect(await color(target, '#inline', 'borderRadius')).toBe('17px');
    expect(await target.locator('#inline').evaluate((node) => node.style.getPropertyPriority('background-color'))).toBe('important');
    expect(await target.locator('#inline').evaluate((node) => node.style.getPropertyPriority('color'))).toBe('');
    expect(await target.locator('#inline').evaluate((node) => node.style.getPropertyValue('--author-flag'))).toBe('keep');
    expect(await target.evaluate(() => [...document.querySelectorAll('*')].some((node) => [...node.attributes].some((attribute) => attribute.name.startsWith('data-darkreader-')) || (node.style && [...node.style].some((property) => property.startsWith('--darkreader-')))))).toBe(false);
});

test('settings panel remounts when its host container is replaced', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { const container = document.createElement('div'); container.id = 'extensions_settings'; document.getElementById('extensions_settings').replaceWith(container); });
    await expect(page.locator('#darksilly-settings')).toHaveCount(1);
    await expect(page.locator('#darksilly-enabled')).toBeChecked();
    await page.locator('#darksilly-enabled').uncheck();
    expect(await page.evaluate(() => window.demo.context.extensionSettings.darksilly.enabled)).toBe(false);
});

test('CSP-blocked style injection is reported instead of a false active count', async ({ page }) => {
    await boot(page);
    const id = await add(page, { html: `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src http://127.0.0.1:4173; style-src 'none'"><body>不允许注入样式的前端</body>` });
    await ready(page, id);
    await expect.poll(() => page.evaluate(() => window.extension.getDiagnostics().reasons['style-blocked'])).toBe(1);
    await active(page, 0);
    await expect(frame(page, id).locator('style.darkreader, script[data-darksilly-owner]')).toHaveCount(0);
});

test('background-image URLs stay original while gradient layers darken without image fetch or analysis', async ({ page }) => {
    await boot(page, '?empty=1&enabled=0');
    const id = await add(page);
    const target = await ready(page, id, '#background-photo');
    const originalImage = await color(target, '#background-photo', 'backgroundImage');
    const originalLayered = await color(target, '#layered-photo', 'backgroundImage');
    await target.evaluate(() => {
        const photo = document.createElement('div');
        photo.id = 'inline-photo';
        photo.className = 'background-photo';
        photo.style.backgroundImage = 'url(/tests/fixtures/colors.svg)';
        document.getElementById('dynamic-root').append(photo);
    });
    const originalInline = await color(target, '#inline-photo', 'backgroundImage');
    await target.evaluate(() => {
        window.fixtureImageFetches = [];
        const fetch = window.fetch.bind(window);
        window.fetch = (input, init) => {
            if (String(input).includes('colors.svg')) window.fixtureImageFetches.push(String(input));
            return fetch(input, init);
        };
    });
    const image = target.locator('#background-photo');
    await image.scrollIntoViewIfNeeded();
    const boundsBefore = await image.boundingBox();
    const before = await page.screenshot({ clip: { x: boundsBefore.x + 5, y: boundsBefore.y + 5, width: boundsBefore.width - 10, height: boundsBefore.height - 10 } });
    await page.locator('#darksilly-enabled').check();
    await active(page, 1);
    await expectDark(target, '#light-panel');
    expect(await color(target, '#background-photo', 'backgroundImage')).toBe(originalImage);
    expect(await color(target, '#inline-photo', 'backgroundImage')).toBe(originalInline);
    const layered = await color(target, '#layered-photo', 'backgroundImage');
    expect(layered).toContain('/tests/fixtures/colors.svg');
    expect(layered).not.toBe(originalLayered);
    const stops = layered.match(/rgba?[(][^)]*[)]/g) || [];
    for (const stop of stops) expect(luminance(stop)).toBeLessThan(0.18);
    expect(await target.evaluate(() => window.fixtureImageFetches)).toEqual([]);
    await image.scrollIntoViewIfNeeded();
    const boundsAfter = await image.boundingBox();
    const after = await page.screenshot({ clip: { x: boundsAfter.x + 5, y: boundsAfter.y + 5, width: boundsAfter.width - 10, height: boundsAfter.height - 10 } });
    expect(Buffer.compare(before, after)).toBe(0);
    await page.locator('#darksilly-enabled').uncheck();
    expect(await color(target, '#layered-photo', 'backgroundImage')).toBe(originalLayered);
});

test('isolated blended artwork keeps its composition while surrounding panels darken', async ({ page }, testInfo) => {
    await boot(page, '?empty=1&enabled=0');
    const html = `<!doctype html><html><head><style>
      body { margin: 0; padding: 24px; background: white; color: #222; }
      .reading-panel { padding: 12px; margin-top: 16px; background: #fff; color: #222; }
      .artwork { width: 96px; height: 96px; position: relative; isolation: isolate; overflow: hidden; border-radius: 48%; background: radial-gradient(circle, white 0%, #fff 28%, #ffe4ed 75%, #f5b9cb 100%); }
      .artwork img { display: block; width: 100%; height: 100%; object-fit: cover; mix-blend-mode: multiply; filter: saturate(.82) contrast(.95) brightness(1.06); }
      .artwork::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(145deg, rgba(255,255,255,.28), transparent 45%, rgba(228,128,161,.12)); }
    </style></head><body><div class='artwork'><img src='/tests/fixtures/colors.svg' alt='Color sample'></div><section class='reading-panel'>Reading panel</section><div id='dynamic-artwork'></div></body></html>`;
    const id = await add(page, { html, height: 300 });
    const target = await ready(page, id, '.artwork img');
    await target.locator('.artwork img').evaluate(image => image.decode());
    const imageFilter = await color(target, '.artwork img', 'filter');
    const originalBackdrop = await color(target, '.artwork', 'backgroundImage');
    const snapshot = async (selector = '.artwork') => {
        const element = target.locator(selector).first();
        await element.scrollIntoViewIfNeeded();
        const box = await element.boundingBox();
        return page.screenshot({ clip: { x: box.x + 22, y: box.y + 22, width: 52, height: 52 } });
    };
    const expectSameArtwork = async (before, after) => {
        if (before.equals(after)) return;
        // Chromium can dither gradients by up to 2/255 at identical coordinates.
        // Compare decoded pixels, retaining strict author-style checks below.
        const delta = await page.evaluate(async (encoded) => {
            const images = await Promise.all(encoded.map(async value => {
                const image = new Image();
                image.src = 'data:image/png;base64,' + value;
                await image.decode();
                return image;
            }));
            if (images[0].width !== images[1].width || images[0].height !== images[1].height) return 256;
            const pixels = images.map(image => {
                const canvas = document.createElement('canvas');
                canvas.width = image.width; canvas.height = image.height;
                const context = canvas.getContext('2d');
                context.drawImage(image, 0, 0);
                return context.getImageData(0, 0, canvas.width, canvas.height).data;
            });
            let maximum = 0;
            for (let i = 0; i < pixels[0].length; i++) maximum = Math.max(maximum, Math.abs(pixels[0][i] - pixels[1][i]));
            return maximum;
        }, [before.toString('base64'), after.toString('base64')]);
        expect(delta).toBeLessThanOrEqual(2);
    };
    const before = await snapshot();
    await page.locator('#darksilly-enabled').check();
    await active(page, 1);
    await expectDark(target, '.reading-panel');
    const after = await snapshot();
    await testInfo.attach('artwork-original', { body: before, contentType: 'image/png' });
    await testInfo.attach('artwork-dark-mode', { body: after, contentType: 'image/png' });
    await expectSameArtwork(before, after);
    expect(await color(target, '.artwork img', 'mixBlendMode')).toBe('multiply');
    expect(await color(target, '.artwork img', 'filter')).toBe(imageFilter);
    await expect(target.locator('[data-nightveil-artwork]')).toHaveCount(1);
    await target.evaluate((background) => {
        const surface = document.createElement('div');
        surface.className = 'artwork';
        surface.style.setProperty('background-image', background, 'important');
        surface.innerHTML = '<img src="/tests/fixtures/colors.svg" alt="Color sample">';
        document.getElementById('dynamic-artwork').append(surface);
        const panel = document.createElement('section');
        panel.id = 'late-reading';
        panel.style.setProperty('background-color', 'white', 'important');
        panel.textContent = 'Another reading panel';
        document.body.append(panel);
    }, originalBackdrop);
    await expect(target.locator('[data-nightveil-artwork]')).toHaveCount(2);
    await target.locator('#dynamic-artwork img').evaluate(image => image.decode());
    const dynamicPixels = await snapshot('#dynamic-artwork .artwork');
    expect(await color(target, '#dynamic-artwork .artwork', 'backgroundImage')).toBe(originalBackdrop);
    await expectDark(target, '#late-reading');
    await page.locator('#darksilly-enabled').uncheck();
    await expect(target.locator('[data-nightveil-artwork]')).toHaveCount(0);
    await expectSameArtwork(dynamicPixels, await snapshot('#dynamic-artwork .artwork'));
    expect(await color(target, 'body > .artwork', 'backgroundImage')).toBe(originalBackdrop);
    await expect(target.locator('.artwork img')).toHaveCount(2);
    await expect.poll(() => target.evaluate(() => [...document.querySelectorAll('*')].filter(node => [...node.attributes].some(attr => attr.name.startsWith('data-darkreader-'))).length)).toBe(0);
});

test('1.14.0 module loader starts without hooks and preserves the saved toggle across reloads', async ({ page }) => {
    await boot(page, '?host=1.14.0');
    await expect(page.locator('#nightveil-legacy-js')).toHaveCount(1);
    await active(page, 2);
    const id = await page.locator('#chat iframe').first().getAttribute('id');
    const target = await ready(page, id, '#light-panel');
    await expectDark(target, '#light-panel');
    await expect(page.locator('#darksilly-settings')).toHaveCount(1);
    await expect(target.locator('script[data-darksilly-owner]')).toHaveCount(1);
    await page.locator('#darksilly-enabled').uncheck();
    await expect(target.locator('style.darkreader, script[data-darksilly-owner]')).toHaveCount(0);
    await page.reload();
    await page.evaluate(() => window.demoReady);
    await openSettings(page);
    await expect(page.locator('#darksilly-enabled')).not.toBeChecked();
    const nextId = await page.locator('#chat iframe').first().getAttribute('id');
    const next = await ready(page, nextId, '#light-panel');
    expect(luminance(await color(next, '#light-panel'))).toBeGreaterThan(0.9);
    await page.locator('#darksilly-enabled').check();
    await active(page, 2);
    const dynamicId = await add(page);
    await active(page, 3);
    await expectDark(await ready(page, dynamicId, '#light-panel'), '#light-panel');
    expect(await page.evaluate(() => window.extension.getDiagnostics().hostScans)).toBe(1);
    await page.reload();
    await page.evaluate(() => window.demoReady);
    await expect(page.locator('#darksilly-enabled')).toBeChecked();
    await active(page, 2);
});

test('1.14.0 disabled extension is not imported and becomes active after the host reloads it', async ({ page }) => {
    let runtimeRequests = 0;
    page.on('request', request => { if (request.url().includes('/dist/')) runtimeRequests++; });
    await page.goto('/demo/?host=1.14.0&extension-disabled=1');
    await page.evaluate(() => window.demoReady);
    await expect(page.locator('#darksilly-settings, #nightveil-legacy-js')).toHaveCount(0);
    expect(runtimeRequests).toBe(0);
    expect(await page.evaluate(() => window.demo.context.extensionSettings.darksilly)).toBeUndefined();
    await boot(page, '?host=1.14.0');
    await active(page, 2);
    await expect(page.locator('#darksilly-settings')).toHaveCount(1);
});

test('a modern hook-only import stays inert and an immediate disable cancels activation', async ({ page }) => {
    await page.goto('/demo/?host=import-only');
    await page.evaluate(() => window.demoReady);
    await expect(page.locator('#darksilly-settings')).toHaveCount(0);
    expect(await page.evaluate(() => window.demo.context.extensionSettings.darksilly)).toBeUndefined();
    await page.evaluate(() => window.extension.onClean());
    expect(await page.evaluate(() => window.demoSaveCount)).toBe(0);
    await page.evaluate(() => { window.extension.onActivate(); window.extension.onDisable(); });
    await expect(page.locator('#darksilly-settings')).toHaveCount(0);
    expect(await page.evaluate(() => window.extension.getDiagnostics().running)).toBe(false);
    await page.evaluate(() => window.extension.onEnable());
    await active(page, 2);
    await expect(page.locator('#darksilly-settings')).toHaveCount(1);
});


for (const host of ['modern', '1.14.0']) {
    test('settings drawer prevents accidental toggles and starts collapsed on ' + host, async ({ page }, testInfo) => {
        await page.goto('/demo/?host=' + host);
        await page.evaluate(() => window.demoReady);
        await active(page, 2);
        const panel = page.locator('#darksilly-settings');
        const header = panel.locator('summary');
        const checkbox = page.locator('#darksilly-enabled');
        await expect(panel).toHaveJSProperty('open', false);
        await expect(header).toBeVisible();
        await expect(header).toHaveClass(/standoutHeader/);
        await expect(checkbox).toBeHidden();
        await expect(checkbox).toBeChecked();
        await page.evaluate(() => {
            window.nativeDrawerClicks = 0;
            document.addEventListener('click', event => {
                if (event.target.closest('.inline-drawer-toggle')) window.nativeDrawerClicks++;
            });
        });
        const saved = await page.evaluate(() => window.demoSaveCount);
        await page.screenshot({ path: testInfo.outputPath('settings-collapsed.png'), fullPage: true });
        await header.click();
        await expect(panel).toHaveJSProperty('open', true);
        await expect(checkbox).toBeVisible();
        await expect(checkbox).toBeChecked();
        await page.screenshot({ path: testInfo.outputPath('settings-expanded.png'), fullPage: true });
        await header.click();
        await expect(checkbox).toBeHidden();
        expect(await page.evaluate(() => window.nativeDrawerClicks)).toBe(0);
        expect(await page.evaluate(() => window.demoSaveCount)).toBe(saved);
        await active(page, 2);
        await header.click();
        await checkbox.uncheck();
        await active(page, 0);
        await header.click();
        await header.click();
        await expect(checkbox).not.toBeChecked();
        await page.reload();
        await page.evaluate(() => window.demoReady);
        await expect(panel).toHaveJSProperty('open', false);
        await expect(checkbox).toBeHidden();
        await expect(checkbox).not.toBeChecked();
        await active(page, 0);
    });
}

test('settings drawer supports keyboard navigation on narrow screens', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/demo/?empty=1');
    await page.evaluate(() => window.demoReady);
    const panel = page.locator('#darksilly-settings');
    const header = panel.locator('summary');
    const checkbox = page.locator('#darksilly-enabled');
    await header.focus();
    await header.press('Enter');
    await expect(checkbox).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(checkbox).toBeFocused();
    await page.keyboard.press('Space');
    await expect(checkbox).not.toBeChecked();
    const saved = await page.evaluate(() => window.demoSaveCount);
    await header.focus();
    await header.press('Space');
    await expect(panel).toHaveJSProperty('open', false);
    await expect(checkbox).toBeHidden();
    expect(await page.evaluate(() => window.demoSaveCount)).toBe(saved);
    await page.keyboard.press('Tab');
    await expect(page.locator('#add-light')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('settings-narrow-collapsed.png'), fullPage: true });
    await header.click();
    await expect(checkbox).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('settings-narrow-expanded.png'), fullPage: true });
});
