import { DISPLAY_NAME, EXTENSION_ID, STATUS_LABELS } from './constants.js';
import { createFrameManager } from './frame-manager.js';
import { normalizeSettings, readHostContext } from './settings.js';

export function createApplication({ document, host, runtimeUrl }) {
    const context = readHostContext(host);
    if (!context) return null;
    const { settings, changed } = normalizeSettings(context.extensionSettings[EXTENSION_ID]);
    context.extensionSettings[EXTENSION_ID] = settings;
    let panel = null;
    let checkbox = null;
    let status = null;
    let started = false;
    let saveFailed = false;
    let saveGeneration = 0;
    let lastDiagnostics = { active: 0, pending: 0, skipped: 0, reasons: {} };

    function renderStatus() {
        if (!status) return;
        if (saveFailed) { status.textContent = '设置保存失败，刷新后可能恢复。'; return; }
        if (!settings.enabled) { status.textContent = '已关闭，已恢复原有显示。'; return; }
        const result = lastDiagnostics;
        const parts = ['已处理 ' + result.active + ' 个前端'];
        if (result.pending) parts.push('等待加载 ' + result.pending + ' 个');
        if (result.skipped) {
            const reasons = Object.entries(result.reasons).map(([reason, count]) => (STATUS_LABELS[reason] || '暂不可处理') + ' ' + count);
            parts.push('跳过 ' + result.skipped + ' 个（' + reasons.join('、') + '）');
        }
        if (!result.active && !result.pending && !result.skipped) parts.push('等待酒馆助手或小白X渲染前端');
        status.textContent = parts.join('；') + '。';
    }

    function save() {
        const generation = ++saveGeneration;
        saveFailed = false;
        try {
            const result = context.saveSettingsDebounced();
            if (result?.then) result.catch(() => {
                if (!started || generation !== saveGeneration) return;
                saveFailed = true; renderStatus();
            });
        } catch { saveFailed = true; }
        renderStatus();
    }

    const manager = createFrameManager({ document, runtimeUrl, onStatus(result) { lastDiagnostics = result; renderStatus(); } });

    function onToggle() {
        settings.enabled = checkbox.checked;
        if (settings.enabled) manager.start(); else manager.stop();
        save();
    }

    function mountPanel() {
        if (!started || panel?.isConnected) return;
        const container = document.getElementById('extensions_settings') || document.getElementById('extensions_settings2');
        if (!container) return;
        if (!panel) {
            panel = document.createElement('details');
            panel.className = 'inline-drawer';
            panel.id = 'darksilly-settings';
            panel.setAttribute('data-extension-id', EXTENSION_ID);
            panel.setAttribute('aria-labelledby', 'darksilly-title');
            const header = document.createElement('summary');
            header.className = 'inline-drawer-header standoutHeader';
            const heading = document.createElement('b');
            heading.id = 'darksilly-title';
            heading.textContent = DISPLAY_NAME;
            const icon = document.createElement('span');
            icon.className = 'fa-solid fa-circle-chevron-down inline-drawer-icon';
            icon.setAttribute('aria-hidden', 'true');
            header.append(heading, icon);
            const content = document.createElement('div');
            content.className = 'inline-drawer-content';
            content.id = 'darksilly-settings-content';
            // Native details owns expansion; no inline-drawer-toggle class, so
            // SillyTavern's delegated drawer handler cannot toggle it a second time.
            const label = document.createElement('label');
            label.className = 'darksilly-toggle';
            checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = 'darksilly-enabled';
            checkbox.checked = settings.enabled;
            checkbox.addEventListener('change', onToggle);
            const labelText = document.createElement('span');
            labelText.textContent = '压暗前端的浅色背景';
            label.append(checkbox, labelText);
            const help = document.createElement('p');
            help.className = 'darksilly-help';
            help.textContent = '作用于酒馆助手或小白X渲染的消息前端。尽量保留原有深色设计与图片颜色；关闭即可恢复。';
            status = document.createElement('p');
            status.id = 'darksilly-status';
            status.setAttribute('role', 'status');
            status.setAttribute('aria-live', 'polite');
            content.append(label, help, status);
            panel.append(header, content);
        }
        container.append(panel);
        renderStatus();
    }

    const uiObserver = new document.defaultView.MutationObserver(mountPanel);
    const onPageHide = () => manager.stop();
    const onPageShow = (event) => { if (event.persisted && settings.enabled) manager.start(); };
    return {
        start() {
            if (started) return;
            started = true;
            mountPanel();
            uiObserver.observe(document.documentElement, { childList: true, subtree: true });
            document.defaultView.addEventListener('pagehide', onPageHide);
            document.defaultView.addEventListener('pageshow', onPageShow);
            if (settings.enabled) manager.start();
            if (changed) save();
        },
        dispose() {
            started = false;
            saveGeneration++;
            uiObserver.disconnect();
            document.defaultView.removeEventListener('pagehide', onPageHide);
            document.defaultView.removeEventListener('pageshow', onPageShow);
            manager.stop();
            checkbox?.removeEventListener('change', onToggle);
            panel?.remove();
            panel = checkbox = status = null;
        },
        getDiagnostics() { return { enabled: settings.enabled, mounted: Boolean(panel?.isConnected), ...manager.getDiagnostics() }; },
    };
}
