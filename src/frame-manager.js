import { EXTENSION_ID, FRAME_SELECTOR, REGISTER_KEY, OWNER_ATTRIBUTE, LOAD_TIMEOUT_MS } from './constants.js';

function hasOtherEngine(document) {
    return Boolean(document.querySelector('meta[name="darkreader"], style.darkreader')
        || document.documentElement?.hasAttribute('data-darkreader-mode'));
}

function isBackendFrame(frame) {
    return (frame.id || frame.name || '').startsWith('TH-script--');
}

export function createFrameManager({ document, runtimeUrl, onStatus = () => {}, loadTimeout = LOAD_TIMEOUT_MS }) {
    const window = document.defaultView;
    const records = new Map();
    const scopes = new Map();
    const pendingRoots = new Map();
    const metrics = { hostScans: 0, documentScans: 0, incrementalScans: 0, injections: 0 };
    let running = false;
    let batchTimer = null;
    let shouldPrune = false;

    function diagnostics() {
        const result = { running, frames: records.size, active: 0, pending: 0, skipped: 0, scopes: scopes.size, reasons: {}, ...metrics };
        for (const record of records.values()) {
            if (record.state === 'active') result.active++;
            else if (record.state === 'loading' || record.state === 'waiting') result.pending++;
            else { result.skipped++; result.reasons[record.state] = (result.reasons[record.state] || 0) + 1; }
        }
        return result;
    }

    function notify() { onStatus(diagnostics()); }

    function isLive(record) {
        if (!running || records.get(record.frame) !== record || !record.frame.isConnected || isBackendFrame(record.frame)) return false;
        if (!record.parent) return record.frame.ownerDocument === document && record.frame.matches(FRAME_SELECTOR);
        return record.parent.document === record.frame.ownerDocument && isLive(record.parent);
    }

    function disposeDocument(record) {
        record.generation++;
        for (const child of [...records.values()]) if (child.parent === record) drop(child);
        record.cancelInjection?.();
        record.cancelInjection = null;
        try { record.controller?.dispose(); } catch { /* A navigated document may already be inaccessible. */ }
        record.controller = null;
        record.script?.remove();
        record.script = null;
        if (record.document) {
            scopes.get(record.document)?.observer.disconnect();
            scopes.delete(record.document);
        }
        record.document = null;
    }

    function drop(record) {
        if (records.get(record.frame) !== record) return;
        records.delete(record.frame);
        record.frame.removeEventListener('load', record.onLoad);
        disposeDocument(record);
    }

    function schedule() {
        if (!running || batchTimer !== null) return;
        batchTimer = window.setTimeout(flush, 16);
    }

    function queueRoot(root, owner) {
        if (!root || root.nodeType !== 1) return;
        if (['STYLE', 'SCRIPT', 'LINK', 'META'].includes(root.tagName)) return;
        pendingRoots.set(root, owner);
        schedule();
    }

    function flush() {
        batchTimer = null;
        if (!running) return;
        if (shouldPrune) {
            shouldPrune = false;
            for (const record of [...records.values()]) if (!isLive(record)) drop(record);
        }
        const roots = [...pendingRoots];
        pendingRoots.clear();
        for (const [root, owner] of roots) {
            if (!root.isConnected || (owner && !isLive(owner))) continue;
            if (!scopes.has(root.ownerDocument)) continue;
            if (roots.some(([ancestor]) => ancestor !== root && ancestor.ownerDocument === root.ownerDocument && ancestor.contains(root))) continue;
            metrics.incrementalScans++;
            discover(root, owner);
        }
        notify();
    }

    function observeScope(scopeDocument, owner) {
        if (scopes.has(scopeDocument) || !scopeDocument.documentElement) return;
        const observer = new window.MutationObserver((mutations) => {
            if (!running) return;
            for (const mutation of mutations) {
                if (mutation.type === 'attributes') {
                    if (mutation.target.tagName === 'IFRAME') {
                        shouldPrune = true;
                        queueRoot(mutation.target, owner);
                    }
                    continue;
                }
                for (const node of mutation.addedNodes) queueRoot(node, owner);
                if ([...mutation.removedNodes].some((node) => node.nodeType === 1)) { shouldPrune = true; schedule(); }
            }
        });
        observer.observe(scopeDocument.documentElement, {
            childList: true, subtree: true, attributes: true, attributeFilter: ['id', 'class', 'src', 'srcdoc', 'sandbox'],
        });
        scopes.set(scopeDocument, { observer, owner });
        if (owner) metrics.documentScans++; else metrics.hostScans++;
        discover(scopeDocument.documentElement, owner);
    }

    function discover(root, owner) {
        const selector = owner ? 'iframe' : FRAME_SELECTOR;
        if (root.matches?.(selector)) track(root, owner);
        for (const frame of root.querySelectorAll(selector)) track(frame, owner);
    }

    function track(frame, parent) {
        if (isBackendFrame(frame)) return;
        let record = records.get(frame);
        if (record && record.parent !== parent) { drop(record); record = null; }
        if (!record) {
            record = { frame, parent, document: null, script: null, controller: null, state: 'waiting', generation: 0 };
            record.onLoad = () => refresh(record);
            records.set(frame, record);
            frame.addEventListener('load', record.onLoad);
        }
        refresh(record);
    }

    function refresh(record) {
        if (!isLive(record)) { drop(record); return; }
        const frame = record.frame;
        if (frame.hasAttribute('sandbox') && (!frame.sandbox.contains('allow-same-origin') || !frame.sandbox.contains('allow-scripts'))) {
            disposeDocument(record); record.state = 'sandbox'; notify(); return;
        }
        let nextDocument;
        try { nextDocument = frame.contentWindow?.document; } catch { /* Cross-origin boundary. */ }
        if (!nextDocument) { disposeDocument(record); record.state = 'inaccessible'; notify(); return; }
        if (record.document === nextDocument) return;
        disposeDocument(record);
        const initialBlank = nextDocument.URL === 'about:blank' && (frame.hasAttribute('srcdoc')
            || (frame.getAttribute('src') && frame.getAttribute('src') !== 'about:blank'));
        if (initialBlank || nextDocument.readyState === 'loading' || !nextDocument.head) {
            record.state = 'waiting'; notify(); return;
        }
        record.document = nextDocument;
        if (hasOtherEngine(nextDocument)) { record.state = 'other-engine'; notify(); return; }
        record.state = 'loading';
        const generation = record.generation;
        const script = nextDocument.createElement('script');
        record.script = script;
        script.setAttribute(OWNER_ATTRIBUTE, EXTENSION_ID);
        script.src = runtimeUrl;
        script.async = true;
        let timeout;
        const cancel = () => {
            window.clearTimeout(timeout);
            script.removeEventListener('error', onError);
            script.removeEventListener('load', onLoaded);
            script[REGISTER_KEY] = null;
        };
        const current = () => isLive(record) && record.generation === generation && record.document === nextDocument
            && frame.contentDocument === nextDocument;
        const fail = (state) => {
            cancel();
            if (!current()) return;
            record.state = state;
            script.remove();
            record.script = null;
            notify();
        };
        function onError() { fail('script-blocked'); }
        function onLoaded() { if (record.state === 'loading') fail('script-blocked'); }
        script[REGISTER_KEY] = (controller) => {
            if (!current()) return false;
            if (hasOtherEngine(nextDocument)) { fail('other-engine'); return false; }
            cancel();
            try {
                controller.enable();
                record.controller = controller;
                record.state = 'active';
                observeScope(nextDocument, record);
                notify();
                return true;
            } catch (error) {
                try { controller.dispose(); } catch { /* Keep the host responsive. */ }
                fail(error?.code === 'darksilly-style-blocked' ? 'style-blocked' : 'engine-failed');
                return false;
            }
        };
        script.addEventListener('error', onError);
        script.addEventListener('load', onLoaded);
        record.cancelInjection = cancel;
        timeout = window.setTimeout(() => fail('timeout'), loadTimeout);
        metrics.injections++;
        try { nextDocument.head.append(script); } catch { fail('script-blocked'); }
        notify();
    }

    return {
        start() { if (running) return; running = true; observeScope(document, null); notify(); },
        stop() {
            running = false;
            if (batchTimer !== null) window.clearTimeout(batchTimer);
            batchTimer = null;
            pendingRoots.clear();
            shouldPrune = false;
            for (const record of [...records.values()]) drop(record);
            for (const scope of scopes.values()) scope.observer.disconnect();
            scopes.clear();
            notify();
        },
        getDiagnostics: diagnostics,
    };
}
