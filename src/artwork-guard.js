export const ARTWORK_ATTRIBUTE = 'data-nightveil-artwork';
export const ARTWORK_SELECTOR = '[' + ARTWORK_ATTRIBUTE + ']';
const MEDIA = 'img, video, canvas';

// Only small, isolated, media-only compositions are exempted from recoloring.
// Text panels and page-wide ancestors must continue to receive the dark theme.
export function createArtworkGuard(document, onProtect = () => {}) {
    const owned = new Map();
    const pending = new Set();
    let observer;
    let running = false;
    let scheduled = false;

    function surfaceFor(media) {
        if (!media.isConnected || getComputedStyle(media).mixBlendMode === 'normal') return null;
        const image = media.getBoundingClientRect();
        for (let node = media.parentElement, depth = 0; node && depth < 3; node = node.parentElement, depth++) {
            if (node.matches('html, body') || node.textContent.trim()) break;
            const box = node.getBoundingClientRect();
            if (getComputedStyle(node).isolation === 'isolate' && image.width > 0 && image.height > 0
                && box.width <= 512 && box.height <= 512
                && box.width <= image.width * 1.35 && box.height <= image.height * 1.35
                && node.querySelectorAll(MEDIA).length === 1) return node;
        }
        return null;
    }

    function unmark(node, record) {
        if (node.getAttribute(ARTWORK_ATTRIBUTE) === '') {
            if (record.previous === null) node.removeAttribute(ARTWORK_ATTRIBUTE);
            else node.setAttribute(ARTWORK_ATTRIBUTE, record.previous);
        }
        owned.delete(node);
    }

    function discover(root) {
        if (!root?.isConnected || root.nodeType !== 1) return;
        const media = root.matches(MEDIA) ? [root] : [...root.querySelectorAll(MEDIA)];
        for (const image of media) {
            const surface = surfaceFor(image);
            if (!surface || owned.has(surface)) continue;
            const previous = surface.getAttribute(ARTWORK_ATTRIBUTE);
            owned.set(surface, { previous, image });
            onProtect(surface);
            surface.setAttribute(ARTWORK_ATTRIBUTE, '');
        }
    }

    function flush() {
        scheduled = false;
        if (!running) return;
        for (const [node, record] of owned) if (surfaceFor(record.image) !== node) unmark(node, record);
        for (const root of pending) discover(root);
        pending.clear();
    }

    return {
        start() {
            if (running) return;
            running = true;
            discover(document.documentElement);
            observer = new document.defaultView.MutationObserver(mutations => {
                for (const mutation of mutations) {
                    if (mutation.type === 'attributes') pending.add(mutation.target);
                    else {
                        if (mutation.target.nodeName === 'STYLE' && !mutation.target.classList.contains('darkreader')) pending.add(document.documentElement);
                        for (const node of mutation.addedNodes) if (node.nodeType === 1 && !node.matches('style, script, link, meta')) pending.add(node);
                    }
                }
                if (!scheduled) { scheduled = true; queueMicrotask(flush); }
            });
            observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'src'] });
            document.addEventListener('load', onLoad, true);
        },
        stop() {
            running = false;
            observer?.disconnect();
            document.removeEventListener('load', onLoad, true);
            pending.clear();
            for (const [node, record] of owned) unmark(node, record);
        },
    };
    function onLoad(event) { if (event.target.matches?.(MEDIA)) discover(event.target); }
}
