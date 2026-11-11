import { enable, disable, setFetchMethod } from 'darkreader';
import { ARTWORK_SELECTOR, createArtworkGuard } from './artwork-guard.js';
import { createInlineLedger } from './inline-ledger.js';
import { EXTENSION_ID, OWNER_ATTRIBUTE, REGISTER_KEY, THEME } from './constants.js';

// This bundle runs as a classic script INSIDE the target document, not the host.
const script = document.currentScript;
const engineChrome = window.chrome;
let enabled = false;
let disposed = false;
const ledger = createInlineLedger(document);
const artwork = createArtworkGuard(document, root => ledger.release(root));

function restoreOwnedShim() {
    if (!__darksillyChromeDescriptor && window.chrome === engineChrome) {
        try { delete window.chrome; } catch { /* A host-owned descriptor wins. */ }
    }
}

const controller = {
    enable() {
        if (disposed || enabled) return;
        setFetchMethod((url) => window.fetch(url, { credentials: 'same-origin', mode: 'cors' }));
        // No image inversion or pixel analysis; no stylesheet API monkey-patch.
        try {
            artwork.start();
            ledger.start();
            enable(THEME, { invert: [], ignoreImageAnalysis: ['*'], ignoreInlineStyle: [ARTWORK_SELECTOR, ARTWORK_SELECTOR + ' *'], disableStyleSheetsProxy: true });
            if (!document.querySelector('style.darkreader--inline')?.sheet) {
                const error = new Error('Dynamic styles were blocked by the document policy.');
                error.code = 'darksilly-style-blocked';
                throw error;
            }
            enabled = true;
        } catch (error) {
            artwork.stop();
            ledger.pause();
            disable();
            ledger.restore();
            throw error;
        }
    },
    dispose() {
        if (disposed) return;
        disposed = true;
        artwork.stop();
        ledger.pause();
        try { if (enabled) disable(); } finally { ledger.restore(); enabled = false; restoreOwnedShim(); }
    },
};

// A late/cancelled script never enables itself or publishes a global controller.
if (!script?.isConnected || script.getAttribute(OWNER_ATTRIBUTE) !== EXTENSION_ID
    || typeof script[REGISTER_KEY] !== 'function') {
    controller.dispose();
} else {
    try {
        if (script[REGISTER_KEY](controller) !== true) controller.dispose();
    } catch {
        controller.dispose();
    }
}
