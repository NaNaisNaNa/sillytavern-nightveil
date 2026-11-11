import { createApplication } from './application.js';
import { EXTENSION_ID } from './constants.js';
import { readHostContext } from './settings.js';

const runtimeUrl = new URL('./frame-runtime.js?v=' + __NIGHTVEIL_VERSION__, import.meta.url).href;
let application = null;
let startScheduled = false;
let generation = 0;

function scheduleStart() {
    if (application || startScheduled) return;
    startScheduled = true;
    const current = ++generation;
    // The blocking activate hook only schedules setup; no async work is awaited.
    queueMicrotask(() => {
        if (current !== generation) return;
        startScheduled = false;
        application = createApplication({ document, host: globalThis.SillyTavern, runtimeUrl });
        if (!application) { console.warn('[nightveil] Required SillyTavern settings capabilities are unavailable.'); return; }
        application.start();
    });
}

export function onActivate() { scheduleStart(); }
export function onEnable() { scheduleStart(); }
export function onDisable() {
    generation++;
    startScheduled = false;
    application?.dispose();
    application = null;
}
export function onDelete() { onDisable(); }
export function onClean() {
    onDisable();
    const context = readHostContext();
    if (!context || !Object.hasOwn(context.extensionSettings, EXTENSION_ID)) return;
    delete context.extensionSettings[EXTENSION_ID];
    return context.saveSettingsDebounced();
}

// Content-free diagnostics for support and deterministic lifecycle tests.
export function getDiagnostics() {
    return application?.getDiagnostics() ?? { running: false, enabled: false, mounted: false, frames: 0, active: 0, pending: 0, skipped: 0, scopes: 0, reasons: {} };
}
