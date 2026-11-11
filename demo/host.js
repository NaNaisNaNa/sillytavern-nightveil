const params = new URLSearchParams(location.search);
const stored = (() => { try { return JSON.parse(localStorage.getItem('darksilly-demo-settings') || '{}'); } catch { return {}; } })();
const context = {
    extensionSettings: stored,
    saveSettingsDebounced() {
        window.demoSaveCount++;
        localStorage.setItem('darksilly-demo-settings', JSON.stringify(this.extensionSettings));
    },
};
if (params.has('enabled')) context.extensionSettings.darksilly = { ...context.extensionSettings.darksilly, enabled: params.get('enabled') !== '0' };
window.demoSaveCount = 0;
window.SillyTavern = { getContext: () => context };
let nextId = 0;
const blobUrls = new Set();
window.demo = {
    context,
    async addCard(kind = 'light', options = {}) {
        const html = options.html ?? await (await fetch('/tests/fixtures/' + (kind === 'dark' ? 'dark.html' : 'card.html'))).text();
        const wrapper = document.createElement('article');
        wrapper.className = 'frame-card TH-render';
        const label = document.createElement('div');
        label.className = 'frame-label';
        label.textContent = kind === 'dark' ? '已有深色设计 / 保留层次' : '白底前端 / 思考 · 选项 · 控件';
        const frame = document.createElement('iframe');
        frame.id = options.id ?? 'TH-message--demo-' + nextId++;
        frame.name = frame.id;
        frame.title = kind === 'dark' ? '已有深色角色前端' : '白底角色前端';
        frame.height = String(options.height ?? (kind === 'dark' ? 320 : 1020));
        if (options.sandbox !== undefined) frame.setAttribute('sandbox', options.sandbox);
        if (options.src) frame.src = options.src;
        else if (options.blob) {
            const url = URL.createObjectURL(new Blob([html.replace('<head>', '<head><base href="' + location.origin + '/">')], { type: 'text/html' }));
            blobUrls.add(url); frame.src = url;
        } else frame.srcdoc = html;
        wrapper.append(label, frame);
        document.getElementById('chat').append(wrapper);
        return frame.id;
    },
    clear() {
        document.getElementById('chat').replaceChildren();
        for (const url of blobUrls) URL.revokeObjectURL(url);
        blobUrls.clear();
    },
};
document.getElementById('add-light').addEventListener('click', () => window.demo.addCard());
document.getElementById('add-dark').addEventListener('click', () => window.demo.addCard('dark'));
window.demoReady = (async () => {
    if (!params.has('empty')) { await window.demo.addCard(); await window.demo.addCard('dark'); }
    if (params.get('host') === '1.14.0') {
        // Model 1.14.0's module-script loader; it never calls manifest hooks.
        const name = 'third-party/sillytavern-nightveil';
        if (params.has('extension-disabled')) context.extensionSettings.disabledExtensions = [name];
        if (context.extensionSettings.disabledExtensions?.includes(name)) return;
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.id = 'nightveil-legacy-js';
            script.type = 'module';
            script.async = true;
            script.src = '/dist/index.js';
            script.onload = resolve;
            script.onerror = reject;
            document.body.append(script);
        });
        // Importing the cached module exposes diagnostics without running it again.
        window.extension = await import('/dist/index.js');
    } else {
        window.extension = await import('/dist/index.js');
        if (params.get('host') !== 'import-only') window.extension.onActivate();
    }
})();
