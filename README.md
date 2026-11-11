# 夜帷 · Nightveil

让酒馆助手渲染的角色前端，更适合夜晚阅读。

- 自动压暗浅色背景、思考选项和弹窗，尽量保留原有深色设计与图片原色。
- 支持动态内容、srcdoc／Blob 前端及同源嵌套 iframe。
- 默认启用；设置区默认收起，点击「夜帷 · Nightveil」展开后可关闭、恢复原貌。

[效果预览](docs/screenshots/desktop-dark.png) · [兼容与验收记录](docs/VALIDATION.md)

## 安装

在 SillyTavern 的「扩展 → 安装扩展」中填入本仓库地址，安装后刷新页面，在扩展设置中点击「夜帷 · Nightveil」展开设置。已包含构建产物，使用时无需安装 Node.js 或运行 npm。

手动安装时，将 `manifest.json`、`styles.css`、`dist/` 和 `LICENSE` 放入 `public/scripts/extensions/third-party/sillytavern-nightveil/`，再刷新酒馆。

最低酒馆版本：**SillyTavern 1.14.0**；需有能在当前酒馆运行的酒馆助手。[兼容说明](docs/COMPATIBILITY.md)。跨域、受限沙箱或 CSP 阻止处理的页面会跳过；具体角色卡表现仍需实机验证。

## 开发

```sh
npm ci
npx playwright install chromium firefox
npm test
npm run demo
```

## 许可

[MIT](LICENSE)。基于 Dark Reader 4.9.135，保留其[许可证](dist/DARKREADER-LICENSE)与[构建适配说明](dist/DARKREADER-PATCH.md)。
