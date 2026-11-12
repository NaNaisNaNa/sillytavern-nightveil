# SillyTavern 兼容说明

夜帷 0.1.2 将最低宿主版本降至 **SillyTavern 1.14.0**。这次完成的是固定版本源码核对与加载器模拟回归，尚未在真实 1.14.0 实例安装验收；中间版本也未逐一安装验证。

## 1.14.0 的差异与适配

1.14.0 用 `script[type="module"]` 加载扩展入口，不读取或调用清单中的 `activate`、`enable`、`disable` 等钩子。因此，入口模块发现宿主插入了指向自身 URL 的模块脚本时会主动安排一次启动；新版钩子也走同一个幂等、可取消的启动入口，不会重复挂载。宿主仅为调用清理钩子而导入模块、没有插入入口脚本时，模块保持未启动，不写入默认设置。

1.14.0 的扩展管理器通过禁用列表和刷新页面完成启停；管理器提示需要刷新时须刷新。这与夜帷设置内的总开关不同：总开关仍立即开启或清除配色。新版宿主继续使用原有钩子清理、启停及清除本插件设置。

`SillyTavern.getContext()`、`context.extensionSettings`、`context.saveSettingsDebounced()` 及现有设置容器在 1.14.0 中均存在，因此没有引入私有模块导入、设置迁移或另一套持久化机制。清单及能力契约的最低宿主声明一并改为 1.14.0。

0.1.3 的设置区采用默认收起的原生 `details/summary`，沿用宿主的 `inline-drawer-header`、`standoutHeader` 和 `inline-drawer-content` 样式。标题不带 `inline-drawer-toggle`，避免触发宿主的委托点击处理而重复展开；展开状态不写入持久设置，刷新后仍收起，原有启用状态保持不变。

## 固定源码依据

- **SillyTavern 1.14.0**：tag 对应提交 `9c9be90821ffd6132b40b5f04982522a61d7ad30`。
  - [扩展加载、最低版本和启停刷新流程](https://github.com/SillyTavern/SillyTavern/blob/9c9be90821ffd6132b40b5f04982522a61d7ad30/public/scripts/extensions.js)：`activateExtensions`、`addExtensionScript`、`loadExtensionSettings`、`enableExtension`、`disableExtension`。
  - [公开设置与保存接口](https://github.com/SillyTavern/SillyTavern/blob/9c9be90821ffd6132b40b5f04982522a61d7ad30/public/scripts/st-context.js)：`getContext` 返回 `extensionSettings`、`saveSettingsDebounced`。
  - [公开全局对象](https://github.com/SillyTavern/SillyTavern/blob/9c9be90821ffd6132b40b5f04982522a61d7ad30/public/script.js)：扩展加载前建立 `globalThis.SillyTavern.getContext`。
  - [设置容器](https://github.com/SillyTavern/SillyTavern/blob/9c9be90821ffd6132b40b5f04982522a61d7ad30/public/index.html)：`extensions_settings`、`extensions_settings2`。
- **原开发基线 SillyTavern 1.19.0**：`7e8663cd9c184a550b37238218bdd32c6efc68e9`；原有生命周期模拟回归继续保留。

设置样式已核对上述两个固定提交的 `public/style.css`；两端均提供 `standoutHeader` 与抽屉标题、内容样式。浏览器原生折叠行为不依赖新增的酒馆 API。

以上均是源码证据，不能替代目标实例中的安装、权限与行为验证。

## 渲染器与浏览器边界

最低宿主声明不代表渲染插件本身能在酒馆 1.14.0 安装运行。所用酒馆助手或小白X须已能在当前宿主中正常渲染，二者任选其一，不要求同时安装。酒馆助手的入口源码基线仍为 4.12.1（`91a706c`），使用 `TH-message--` iframe 标识；未扩展到未核实的旧标识。

### 小白X：0.1.4 新增

- 源码基线：LittleWhiteBox 3.2.5，固定提交 `707e03f2d7f75bb6588b29625b3bd61b6c4a7c5a`，不作为所有旧版或分支的支持保证。
- [普通代码块渲染](https://github.com/RT15548/LittleWhiteBox/blob/707e03f2d7f75bb6588b29625b3bd61b6c4a7c5a/modules/iframe-renderer.js)：`createRenderIframe` 设置 `.xiaobaix-iframe`，普通模式写入 `srcdoc`，可选 Blob 模式设置 `src`。
- [流式模板渲染](https://github.com/RT15548/LittleWhiteBox/blob/707e03f2d7f75bb6588b29625b3bd61b6c4a7c5a/modules/template-editor/template-editor.js)：`IframeManager.createWrapper` 同样创建 `.xiaobaix-iframe`，随后写入 `srcdoc`；`updateVariables` 调用 iframe 的 `updateTemplateVariables(vars)`。
- 夜帷只增加这个明确的消息渲染标识，沿用原有文档隔离、加载监听与清理；增量观察 `class` 变化，覆盖后添加／移除标识。不会按 `xiaobaix-` ID 前缀扫描小白X的设置或应用页面，也不接管所有 iframe。
- 匿名模拟覆盖已有 `srcdoc`、动态 Blob、原有酒馆助手前端共存、流式回调与动态选项、同源嵌套、页面导航、标识移除及容器删除；受限页面分别降级。没有加载小白X完整代码，也没有执行其真实生成流程。
- 当前证据为固定源码核对与模拟回归，**真实小白X实例、自动高度适配、变量桥接／消息通道和具体模板仍待实机验收**。未修改或导入用户角色卡，也未自动更新用户酒馆。

运行浏览器还需支持 ES2022 模块、`:where()`、MutationObserver 等现有能力；宿主版本兼容不代表支持更旧的浏览器。跨域、沙箱、CSP 与其他 Dark Reader 实例的处理边界不变。

## 本地验证与实机待办

- 改动前，无钩子的 1.14.0 加载器模拟无法挂载设置面板；改动后在 Chromium、Firefox 均通过。
- 模拟回归覆盖已有前端、动态前端、开关即时恢复、开关状态刷新保存，以及扩展被禁用时不加载、重新启用后刷新加载。
- 完整检查：10 项 Node 单元测试与 60 项浏览器测试通过；包括原有新版钩子幂等、清理及混合图片保护回归，并增加仅为清理而导入模块与立即取消启动的回归。
- 仍需在真实 1.14.0 环境核验安装识别、实际设置保存、管理器启停刷新、现用酒馆助手／小白X的标识与渲染模式、角色卡交互及手机浏览器表现。未自动安装或修改用户实例。
