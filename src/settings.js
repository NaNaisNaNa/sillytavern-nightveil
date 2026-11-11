export function normalizeSettings(value) {
    const settings = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const changed = settings !== value || typeof settings.enabled !== 'boolean';
    if (typeof settings.enabled !== 'boolean') settings.enabled = true;
    return { settings, changed };
}

export function readHostContext(host = globalThis.SillyTavern) {
    if (typeof host?.getContext !== 'function') return null;
    try {
        const context = host.getContext();
        return context?.extensionSettings && typeof context.extensionSettings === 'object' && !Array.isArray(context.extensionSettings)
            && typeof context.saveSettingsDebounced === 'function' ? context : null;
    } catch {
        return null;
    }
}
