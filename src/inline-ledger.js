// Reversible bridge for author inline !important colors. CSS rules alone cannot
// override those declarations, even when Dark Reader marks its rules important.
const COLOR_PROPERTIES = [
    'color', 'background-color', 'background-image', 'border-top-color',
    'border-right-color', 'border-bottom-color', 'border-left-color',
    'outline-color', 'box-shadow', 'fill', 'stroke', 'stop-color',
];
const INLINE_NAMES = ['bgcolor', 'bgimage', 'bg', 'border', 'border-bottom',
    'border-left', 'border-right', 'border-top', 'boxshadow', 'color', 'fill',
    'stroke', 'outline', 'stopcolor', 'border-short', 'border-bottom-short',
    'border-left-short', 'border-right-short', 'border-top-short', 'invert'];
const INLINE_ATTRIBUTES = INLINE_NAMES.map((name) => 'data-darkreader-inline-' + name);

export function createInlineLedger(document) {
    const nodes = new Map();
    let observer = null;

    function ensure(node, originalStyle = node.getAttribute('style')) {
        if (nodes.has(node)) return nodes.get(node);
        const parsed = document.createElement('span').style;
        parsed.cssText = originalStyle || '';
        const properties = new Map();
        for (const property of parsed) if (property.startsWith('--darkreader-')) {
            properties.set(property, { value: parsed.getPropertyValue(property), priority: parsed.getPropertyPriority(property) });
        }
        const record = { hadStyle: originalStyle !== null, properties, attributes: new Map(), important: new Map() };
        nodes.set(node, record);
        return record;
    }

    function normalize(node) {
        if (!node.style || !node.hasAttribute('style')) return;
        const record = ensure(node);
        for (const property of COLOR_PROPERTIES) {
            const value = node.style.getPropertyValue(property);
            const priority = node.style.getPropertyPriority(property);
            if (property === 'background-image' && !value.includes('gradient(')) continue;
            if (priority === 'important') {
                record.important.set(property, value);
                node.style.setProperty(property, value, '');
            } else if (record.important.has(property) && record.important.get(property) !== value) {
                // A rolecard script replaced/removed it with a normal declaration.
                record.important.delete(property);
            }
        }
    }

    function discover(root) {
        if (root.nodeType !== 1) return;
        normalize(root);
        for (const node of root.querySelectorAll('[style]')) normalize(node);
    }

    function capture(mutation) {
        const node = mutation.target;
        const record = ensure(node, mutation.attributeName === 'style' ? mutation.oldValue : node.getAttribute('style'));
        if (mutation.attributeName !== 'style' && !record.attributes.has(mutation.attributeName)) {
            record.attributes.set(mutation.attributeName, mutation.oldValue);
        }
    }

    function restore(node, record) {
        if (!node.style) return;
        for (const property of [...node.style]) if (property.startsWith('--darkreader-') && !record.properties.has(property)) node.style.removeProperty(property);
        for (const [property, original] of record.properties) node.style.setProperty(property, original.value, original.priority);
        for (const [attribute, original] of record.attributes) {
            if (original === null) node.removeAttribute(attribute); else node.setAttribute(attribute, original);
        }
        for (const [property, original] of record.important) {
            if (node.style.getPropertyValue(property) === original && node.style.getPropertyPriority(property) === '') node.style.setProperty(property, original, 'important');
        }
        if (!record.hadStyle && node.style.length === 0) node.removeAttribute('style');
    }

    return {
        start() {
            observer = new document.defaultView.MutationObserver((mutations) => {
                // Capture pre-engine values before considering the current DOM.
                for (const mutation of mutations) if (mutation.type === 'attributes') capture(mutation);
                let removed = false;
                for (const mutation of mutations) {
                    if (mutation.type === 'attributes') normalize(mutation.target);
                    else {
                        for (const node of mutation.addedNodes) discover(node);
                        if (mutation.removedNodes.length) removed = true;
                    }
                }
                if (removed) for (const [node, record] of nodes) if (!node.isConnected) { restore(node, record); nodes.delete(node); }
            });
            observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['style', ...INLINE_ATTRIBUTES] });
            discover(document.documentElement);
        },
        pause() {
            if (!observer) return;
            for (const mutation of observer.takeRecords()) if (mutation.type === 'attributes') capture(mutation);
            observer.disconnect();
            observer = null;
        },
        restore() {
            for (const [node, record] of nodes) restore(node, record);
            nodes.clear();
        },
    };
}
