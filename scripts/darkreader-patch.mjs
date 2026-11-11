import { readFile } from 'node:fs/promises';

// Dark Reader 4.9.135 returns the entire background-image unchanged when
// ignoreImageAnalysis matches. Preserve URL layers, but still recolor gradients.
export function patchDarkReaderSource(source) {
    source = source.replaceAll('\r\n', '\n');
    const earlyReturn = [
        '        if (shouldIgnoreImage(rule.selectorText, ignoreImageSelectors)) {',
        '            return value;',
        '        }',
    ].join('\n');
    const cache = 'if (!didTryLoadCache) {';
    const url = '            url = getAbsoluteURL(baseURL, url);';
    for (const needle of [earlyReturn, cache, url]) {
        if (source.split(needle).length !== 2) throw new Error('Dark Reader 4.9.135 patch no longer matches; refusing an unverified bundle.');
    }
    return source
        .replace(earlyReturn, '        const ignoreImages = ignoreImageSelectors.includes("*") || shouldIgnoreImage(rule.selectorText, ignoreImageSelectors);')
        .replace(cache, 'if (!ignoreImages && !didTryLoadCache) {')
        .replace(url, url + '\n' + [
            '            if (ignoreImages) {',
            '                return () => isURLEmpty ? "none" : "url(" + JSON.stringify(url) + ")";',
            '            }',
        ].join('\n'));
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
