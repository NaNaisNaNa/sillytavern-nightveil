import { readFile } from 'node:fs/promises';
import { ARTWORK_SELECTOR } from '../src/artwork-guard.js';

function artworkSelectorHelper() {
    const guard = ':not(:where(' + ARTWORK_SELECTOR + ', ' + ARTWORK_SELECTOR + ' *))';
    return [
        'function nightveilProtectArtwork(selectorText) {',
        '    const guard = ' + JSON.stringify(guard) + ';',
        '    return parseSelectors(selectorText).map((selector) => {',
        '        const ranges = getTokenExclusionRanges(selector);',
        '        let cut = selector.length;',
        '        for (const match of selector.matchAll(/::[a-z-]+|:(?:before|after|first-line|first-letter)(?![a-z-])/gi)) {',
        '            if (!ranges.some(range => match.index >= range.start && match.index < range.end)) { cut = match.index; break; }',
        '        }',
        '        return selector.slice(0, cut) + guard + selector.slice(cut);',
        '    }).join(String.fromCharCode(44, 32));',
        '}',
    ].join('\n');
}

// Pinned upstream adapters preserve URL images, gradient processing, and small
// blended artwork surfaces without changing author selectors or declarations.
export function patchDarkReaderSource(source) {
    source = source.replaceAll('\r\n', '\n');
    const earlyReturn = [
        '        if (shouldIgnoreImage(rule.selectorText, ignoreImageSelectors)) {',
        '            return value;',
        '        }',
    ].join('\n');
    const cache = 'if (!didTryLoadCache) {';
    const url = '            url = getAbsoluteURL(baseURL, url);';
    const sheet = 'function createStyleSheetModifier() {';
    const selector = 'let selectorText = selector;';
    const inlineAsync = '        function setAsyncValue(promise, sourceValue) {\n            promise.then((value) => {';
    for (const needle of [earlyReturn, cache, url, sheet, selector, inlineAsync]) {
        if (source.split(needle).length !== 2) throw new Error('Dark Reader 4.9.135 patch no longer matches; refusing an unverified bundle.');
    }
    return source
        .replace(earlyReturn, '        const ignoreImages = ignoreImageSelectors.includes("*") || shouldIgnoreImage(rule.selectorText, ignoreImageSelectors);')
        .replace(cache, 'if (!ignoreImages && !didTryLoadCache) {')
        .replace(url, url + '\n' + [
            '            if (ignoreImages) {',
            '                return () => isURLEmpty ? "none" : "url(" + JSON.stringify(url) + ")";',
            '            }',
        ].join('\n'))
        .replace(sheet, artworkSelectorHelper() + '\n' + sheet)
        .replace(selector, 'let selectorText = nightveilProtectArtwork(selector);')
        .replace(inlineAsync, inlineAsync + '\n                if (isAsyncCancelled() || shouldIgnoreInlineStyle(element, ignoreInlineSelectors)) return;');
}

export function preserveImagesPlugin() {
    let patched = false;
    return {
        name: 'nightveil-preserve-image-urls',
        setup(build) {
            build.onLoad({ filter: /darkreader[.]mjs$/ }, async ({ path }) => {
                const contents = patchDarkReaderSource(await readFile(path, 'utf8'));
                patched = true;
                return { contents, loader: 'js' };
            });
            build.onEnd(() => patched ? undefined : { errors: [{ text: 'Pinned Dark Reader module was not patched; refusing this build.' }] });
        },
    };
}
