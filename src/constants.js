// Keep the original settings/DOM namespace so existing installations retain their settings.
export const EXTENSION_ID = 'darksilly';
export const DISPLAY_NAME = '夜帷 · Nightveil';
export const FRAME_SELECTOR = 'iframe[id^="TH-message--"]';
export const REGISTER_KEY = '__darksillyRegisterV1';
export const OWNER_ATTRIBUTE = 'data-darksilly-owner';
export const LOAD_TIMEOUT_MS = 8000;
export const THEME = Object.freeze({
    mode: 1, brightness: 100, contrast: 100, grayscale: 0, sepia: 0,
    darkSchemeBackgroundColor: '#181a1b',
    darkSchemeTextColor: '#e8e6e3',
});
export const STATUS_LABELS = Object.freeze({
    inaccessible: '跨域或无法访问',
    sandbox: '沙箱权限不足',
    'other-engine': '已有其他配色引擎',
    'script-blocked': '脚本被 CSP 或加载策略阻止',
    'style-blocked': '页面 CSP 阻止配色样式',
    timeout: '本地配色脚本加载超时',
    'engine-failed': '配色引擎启动失败',
});
