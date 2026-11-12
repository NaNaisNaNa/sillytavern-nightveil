// src/constants.js
var EXTENSION_ID = "darksilly";
var DISPLAY_NAME = "夜帷 · Nightveil";
var FRAME_SELECTOR = 'iframe[id^="TH-message--"], iframe.xiaobaix-iframe';
var REGISTER_KEY = "__darksillyRegisterV1";
var OWNER_ATTRIBUTE = "data-darksilly-owner";
var LOAD_TIMEOUT_MS = 8e3;
var THEME = Object.freeze({
  mode: 1,
  brightness: 100,
  contrast: 100,
  grayscale: 0,
  sepia: 0,
  darkSchemeBackgroundColor: "#181a1b",
  darkSchemeTextColor: "#e8e6e3"
});
var STATUS_LABELS = Object.freeze({
  inaccessible: "跨域或无法访问",
  sandbox: "沙箱权限不足",
  "other-engine": "已有其他配色引擎",
  "script-blocked": "脚本被 CSP 或加载策略阻止",
  "style-blocked": "页面 CSP 阻止配色样式",
  timeout: "本地配色脚本加载超时",
  "engine-failed": "配色引擎启动失败"
});

// src/frame-manager.js
function hasOtherEngine(document2) {
  return Boolean(document2.querySelector('meta[name="darkreader"], style.darkreader') || document2.documentElement?.hasAttribute("data-darkreader-mode"));
}
function isBackendFrame(frame) {
  return (frame.id || frame.name || "").startsWith("TH-script--");
}
function createFrameManager({ document: document2, runtimeUrl: runtimeUrl2, onStatus = () => {
}, loadTimeout = LOAD_TIMEOUT_MS }) {
  const window = document2.defaultView;
  const records = /* @__PURE__ */ new Map();
  const scopes = /* @__PURE__ */ new Map();
  const pendingRoots = /* @__PURE__ */ new Map();
  const metrics = { hostScans: 0, documentScans: 0, incrementalScans: 0, injections: 0 };
  let running = false;
  let batchTimer = null;
  let shouldPrune = false;
  function diagnostics() {
    const result = { running, frames: records.size, active: 0, pending: 0, skipped: 0, scopes: scopes.size, reasons: {}, ...metrics };
    for (const record of records.values()) {
      if (record.state === "active") result.active++;
      else if (record.state === "loading" || record.state === "waiting") result.pending++;
      else {
        result.skipped++;
        result.reasons[record.state] = (result.reasons[record.state] || 0) + 1;
      }
    }
    return result;
  }
  function notify() {
    onStatus(diagnostics());
  }
  function isLive(record) {
    if (!running || records.get(record.frame) !== record || !record.frame.isConnected || isBackendFrame(record.frame)) return false;
    if (!record.parent) return record.frame.ownerDocument === document2 && record.frame.matches(FRAME_SELECTOR);
    return record.parent.document === record.frame.ownerDocument && isLive(record.parent);
  }
  function disposeDocument(record) {
    record.generation++;
    for (const child of [...records.values()]) if (child.parent === record) drop(child);
    record.cancelInjection?.();
    record.cancelInjection = null;
    try {
      record.controller?.dispose();
    } catch {
    }
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
    record.frame.removeEventListener("load", record.onLoad);
    disposeDocument(record);
  }
  function schedule() {
    if (!running || batchTimer !== null) return;
    batchTimer = window.setTimeout(flush, 16);
  }
  function queueRoot(root, owner) {
    if (!root || root.nodeType !== 1) return;
    if (["STYLE", "SCRIPT", "LINK", "META"].includes(root.tagName)) return;
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
      if (!root.isConnected || owner && !isLive(owner)) continue;
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
        if (mutation.type === "attributes") {
          if (mutation.target.tagName === "IFRAME") {
            shouldPrune = true;
            queueRoot(mutation.target, owner);
          }
          continue;
        }
        for (const node of mutation.addedNodes) queueRoot(node, owner);
        if ([...mutation.removedNodes].some((node) => node.nodeType === 1)) {
          shouldPrune = true;
          schedule();
        }
      }
    });
    observer.observe(scopeDocument.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["id", "class", "src", "srcdoc", "sandbox"]
    });
    scopes.set(scopeDocument, { observer, owner });
    if (owner) metrics.documentScans++;
    else metrics.hostScans++;
    discover(scopeDocument.documentElement, owner);
  }
  function discover(root, owner) {
    const selector = owner ? "iframe" : FRAME_SELECTOR;
    if (root.matches?.(selector)) track(root, owner);
    for (const frame of root.querySelectorAll(selector)) track(frame, owner);
  }
  function track(frame, parent) {
    if (isBackendFrame(frame)) return;
    let record = records.get(frame);
    if (record && record.parent !== parent) {
      drop(record);
      record = null;
    }
    if (!record) {
      record = { frame, parent, document: null, script: null, controller: null, state: "waiting", generation: 0 };
      record.onLoad = () => refresh(record);
      records.set(frame, record);
      frame.addEventListener("load", record.onLoad);
    }
    refresh(record);
  }
  function refresh(record) {
    if (!isLive(record)) {
      drop(record);
      return;
    }
    const frame = record.frame;
    if (frame.hasAttribute("sandbox") && (!frame.sandbox.contains("allow-same-origin") || !frame.sandbox.contains("allow-scripts"))) {
      disposeDocument(record);
      record.state = "sandbox";
      notify();
      return;
    }
    let nextDocument;
    try {
      nextDocument = frame.contentWindow?.document;
    } catch {
    }
    if (!nextDocument) {
      disposeDocument(record);
      record.state = "inaccessible";
      notify();
      return;
    }
    if (record.document === nextDocument) return;
    disposeDocument(record);
    const initialBlank = nextDocument.URL === "about:blank" && (frame.hasAttribute("srcdoc") || frame.getAttribute("src") && frame.getAttribute("src") !== "about:blank");
    if (initialBlank || nextDocument.readyState === "loading" || !nextDocument.head) {
      record.state = "waiting";
      notify();
      return;
    }
    record.document = nextDocument;
    if (hasOtherEngine(nextDocument)) {
      record.state = "other-engine";
      notify();
      return;
    }
    record.state = "loading";
    const generation2 = record.generation;
    const script = nextDocument.createElement("script");
    record.script = script;
    script.setAttribute(OWNER_ATTRIBUTE, EXTENSION_ID);
    script.src = runtimeUrl2;
    script.async = true;
    let timeout;
    const cancel = () => {
      window.clearTimeout(timeout);
      script.removeEventListener("error", onError);
      script.removeEventListener("load", onLoaded);
      script[REGISTER_KEY] = null;
    };
    const current = () => isLive(record) && record.generation === generation2 && record.document === nextDocument && frame.contentDocument === nextDocument;
    const fail = (state) => {
      cancel();
      if (!current()) return;
      record.state = state;
      script.remove();
      record.script = null;
      notify();
    };
    function onError() {
      fail("script-blocked");
    }
    function onLoaded() {
      if (record.state === "loading") fail("script-blocked");
    }
    script[REGISTER_KEY] = (controller) => {
      if (!current()) return false;
      if (hasOtherEngine(nextDocument)) {
        fail("other-engine");
        return false;
      }
      cancel();
      try {
        controller.enable();
        record.controller = controller;
        record.state = "active";
        observeScope(nextDocument, record);
        notify();
        return true;
      } catch (error) {
        try {
          controller.dispose();
        } catch {
        }
        fail(error?.code === "darksilly-style-blocked" ? "style-blocked" : "engine-failed");
        return false;
      }
    };
    script.addEventListener("error", onError);
    script.addEventListener("load", onLoaded);
    record.cancelInjection = cancel;
    timeout = window.setTimeout(() => fail("timeout"), loadTimeout);
    metrics.injections++;
    try {
      nextDocument.head.append(script);
    } catch {
      fail("script-blocked");
    }
    notify();
  }
  return {
    start() {
      if (running) return;
      running = true;
      observeScope(document2, null);
      notify();
    },
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
    getDiagnostics: diagnostics
  };
}

// src/settings.js
function normalizeSettings(value) {
  const settings = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const changed = settings !== value || typeof settings.enabled !== "boolean";
  if (typeof settings.enabled !== "boolean") settings.enabled = true;
  return { settings, changed };
}
function readHostContext(host = globalThis.SillyTavern) {
  if (typeof host?.getContext !== "function") return null;
  try {
    const context = host.getContext();
    return context?.extensionSettings && typeof context.extensionSettings === "object" && !Array.isArray(context.extensionSettings) && typeof context.saveSettingsDebounced === "function" ? context : null;
  } catch {
    return null;
  }
}

// src/application.js
function createApplication({ document: document2, host, runtimeUrl: runtimeUrl2 }) {
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
    if (saveFailed) {
      status.textContent = "设置保存失败，刷新后可能恢复。";
      return;
    }
    if (!settings.enabled) {
      status.textContent = "已关闭，已恢复原有显示。";
      return;
    }
    const result = lastDiagnostics;
    const parts = ["已处理 " + result.active + " 个前端"];
    if (result.pending) parts.push("等待加载 " + result.pending + " 个");
    if (result.skipped) {
      const reasons = Object.entries(result.reasons).map(([reason, count]) => (STATUS_LABELS[reason] || "暂不可处理") + " " + count);
      parts.push("跳过 " + result.skipped + " 个（" + reasons.join("、") + "）");
    }
    if (!result.active && !result.pending && !result.skipped) parts.push("等待酒馆助手或小白X渲染前端");
    status.textContent = parts.join("；") + "。";
  }
  function save() {
    const generation2 = ++saveGeneration;
    saveFailed = false;
    try {
      const result = context.saveSettingsDebounced();
      if (result?.then) result.catch(() => {
        if (!started || generation2 !== saveGeneration) return;
        saveFailed = true;
        renderStatus();
      });
    } catch {
      saveFailed = true;
    }
    renderStatus();
  }
  const manager = createFrameManager({ document: document2, runtimeUrl: runtimeUrl2, onStatus(result) {
    lastDiagnostics = result;
    renderStatus();
  } });
  function onToggle() {
    settings.enabled = checkbox.checked;
    if (settings.enabled) manager.start();
    else manager.stop();
    save();
  }
  function mountPanel() {
    if (!started || panel?.isConnected) return;
    const container = document2.getElementById("extensions_settings") || document2.getElementById("extensions_settings2");
    if (!container) return;
    if (!panel) {
      panel = document2.createElement("details");
      panel.className = "inline-drawer";
      panel.id = "darksilly-settings";
      panel.setAttribute("data-extension-id", EXTENSION_ID);
      panel.setAttribute("aria-labelledby", "darksilly-title");
      const header = document2.createElement("summary");
      header.className = "inline-drawer-header standoutHeader";
      const heading = document2.createElement("b");
      heading.id = "darksilly-title";
      heading.textContent = DISPLAY_NAME;
      const icon = document2.createElement("span");
      icon.className = "fa-solid fa-circle-chevron-down inline-drawer-icon";
      icon.setAttribute("aria-hidden", "true");
      header.append(heading, icon);
      const content = document2.createElement("div");
      content.className = "inline-drawer-content";
      content.id = "darksilly-settings-content";
      const label = document2.createElement("label");
      label.className = "darksilly-toggle";
      checkbox = document2.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = "darksilly-enabled";
      checkbox.checked = settings.enabled;
      checkbox.addEventListener("change", onToggle);
      const labelText = document2.createElement("span");
      labelText.textContent = "压暗前端的浅色背景";
      label.append(checkbox, labelText);
      const help = document2.createElement("p");
      help.className = "darksilly-help";
      help.textContent = "作用于酒馆助手或小白X渲染的消息前端。尽量保留原有深色设计与图片颜色；关闭即可恢复。";
      status = document2.createElement("p");
      status.id = "darksilly-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      content.append(label, help, status);
      panel.append(header, content);
    }
    container.append(panel);
    renderStatus();
  }
  const uiObserver = new document2.defaultView.MutationObserver(mountPanel);
  const onPageHide = () => manager.stop();
  const onPageShow = (event) => {
    if (event.persisted && settings.enabled) manager.start();
  };
  return {
    start() {
      if (started) return;
      started = true;
      mountPanel();
      uiObserver.observe(document2.documentElement, { childList: true, subtree: true });
      document2.defaultView.addEventListener("pagehide", onPageHide);
      document2.defaultView.addEventListener("pageshow", onPageShow);
      if (settings.enabled) manager.start();
      if (changed) save();
    },
    dispose() {
      started = false;
      saveGeneration++;
      uiObserver.disconnect();
      document2.defaultView.removeEventListener("pagehide", onPageHide);
      document2.defaultView.removeEventListener("pageshow", onPageShow);
      manager.stop();
      checkbox?.removeEventListener("change", onToggle);
      panel?.remove();
      panel = checkbox = status = null;
    },
    getDiagnostics() {
      return { enabled: settings.enabled, mounted: Boolean(panel?.isConnected), ...manager.getDiagnostics() };
    }
  };
}

// src/index.js
var runtimeUrl = new URL("./frame-runtime.js?v=0.1.4", import.meta.url).href;
var application = null;
var startScheduled = false;
var generation = 0;
function scheduleStart() {
  if (application || startScheduled) return;
  startScheduled = true;
  const current = ++generation;
  queueMicrotask(() => {
    if (current !== generation) return;
    startScheduled = false;
    application = createApplication({ document, host: globalThis.SillyTavern, runtimeUrl });
    if (!application) {
      console.warn("[nightveil] Required SillyTavern settings capabilities are unavailable.");
      return;
    }
    application.start();
  });
}
function onActivate() {
  scheduleStart();
}
function onEnable() {
  scheduleStart();
}
function onDisable() {
  generation++;
  startScheduled = false;
  application?.dispose();
  application = null;
}
function onDelete() {
  onDisable();
}
function onClean() {
  onDisable();
  const context = readHostContext();
  if (!context || !Object.hasOwn(context.extensionSettings, EXTENSION_ID)) return;
  delete context.extensionSettings[EXTENSION_ID];
  return context.saveSettingsDebounced();
}
function getDiagnostics() {
  return application?.getDiagnostics() ?? { running: false, enabled: false, mounted: false, frames: 0, active: 0, pending: 0, skipped: 0, scopes: 0, reasons: {} };
}
if ([...document.scripts].some((script) => script.type === "module" && script.src === import.meta.url)) scheduleStart();
export {
  getDiagnostics,
  onActivate,
  onClean,
  onDelete,
  onDisable,
  onEnable
};
