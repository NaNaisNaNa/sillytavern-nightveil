# Dark Reader 4.9.135 本地构建适配

依赖版本仍固定为 npm `darkreader@4.9.135`，原始依赖文件不被修改，MIT 许可完整保留。`scripts/darkreader-patch.mjs` 仅在构建 iframe bundle 时适配该版本的 `getBgImageModifier`。

原始实现一旦 `ignoreImageAnalysis` 匹配就返回整个 `background-image`，这同时跳过了 CSS 渐变，会造成白色渐变背景配浅色文字。

本地适配将这一行为拆开：

1. 匹配忽略规则时不读取图片分析缓存，也不进入图片加载、像素分析或滤镜逻辑。
2. 全局忽略图片也覆盖没有选择器的行内声明。URL 图层仅按原样解析为绝对 URL，保持相对于原样式表的路径语义。
3. CSS 渐变继续使用原引擎的渐变配色逻辑；图片与渐变混合的图层也分别处理。

适配使用三处唯一源码锚点，并要求 esbuild 确实处理了该模块。锚点变化或模块未接入时构建失败，不静默生成未经验证的引擎。升级依赖需要重新核对实现与回归测试。

这属于固定版本的内部构建适配，不是声称上游存在新的公开 API。运行时仍只使用 `enable`、`disable`、`setFetchMethod` 等已核对的 API。
