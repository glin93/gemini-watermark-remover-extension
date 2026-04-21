# Gemini Watermark Remover (Browser Extension)

一个本地运行的 Chrome/Edge 扩展，用来去掉 Gemini 与 AI Studio 生成图片右下角的水印 —— 直接增强原生下载按钮，点一下就拿到干净的图。

A local-only Chrome / Edge extension that strips the watermark from images generated in Gemini and AI Studio by upgrading the native download button in place.

## 特性 / Features

- 100% 本地运行，不会外发任何数据；没有试用、没有订阅、没有远程配置。
- 直接增强 Gemini 原生下载按钮（绿色描边 + `Clean` 标记），不模拟点击，交互更稳。
- 右下角多偏移搜索匹配，再决定是否套用 mask，避免误伤。
- 弹窗里只有启用开关、导出格式（PNG / WebP / JPEG）和本地计数。
- 100% local, no telemetry, no trials, no remote config.
- Enhances Gemini's native download button in place instead of simulating clicks.
- Conservative bottom-right offset matching before any mask is applied.

## 安装方式一：从 Release 下载（推荐） / Install from Release (recommended)

1. 到 [Releases](https://github.com/glin93/gemini-watermark-remover-extension/releases) 下载最新的 `gemini-watermark-remover-extension-vX.Y.Z.zip`
2. 解压到任意目录（请保留解压后的文件夹）
3. 打开 `chrome://extensions`（Edge 为 `edge://extensions`）
4. 打开右上角 **Developer mode / 开发者模式**
5. 点击 **Load unpacked / 加载已解压的扩展程序**，选择刚解压出来的目录
6. 打开 Gemini 或 AI Studio，生成图片后点击带绿色描边和 `Clean` 标记的下载按钮即可

> 因为这个扩展没有上架 Chrome Web Store，Chrome 需要以 Developer mode 的方式加载。关闭 Developer mode 会停用扩展。

## 安装方式二：从源码加载 / Install from source

```bash
git clone https://github.com/glin93/gemini-watermark-remover-extension.git
```

然后按上面第 3–5 步操作，在 **Load unpacked** 时选择 clone 下来的 `gemini-watermark-remover-extension` 目录。

## 使用 / Usage

1. 打开 [Gemini](https://gemini.google.com/) 或 [AI Studio](https://aistudio.google.com/)
2. 生成一张图片
3. 图片旁边的原生下载按钮会被打上绿色描边和 `Clean` 标记
4. 点击该按钮，扩展会在本地拦截并处理下载响应，再交给 Chrome 保存

点击工具栏上的扩展图标，可以切换启用状态、选择导出格式，或重置本地处理计数。

## 目录结构 / Layout

```
manifest.json        # MV3 manifest
background.js        # service worker，处理 downloads 拦截
content/
  masks.js           # 水印遮罩定义
  matcher.js         # 右下角多偏移匹配
  page.js            # 主世界注入逻辑
  bridge.js          # 隔离世界 ↔ 主世界桥接
popup/
  popup.html         # 弹窗 UI
  popup.css
  popup.js
```

## 致谢 / Acknowledgements

去水印思路参考 [GargantuaX/gemini-watermark-remover](https://github.com/GargantuaX/gemini-watermark-remover) 的反向 Alpha 混合算法，这里做成了常驻浏览器扩展形态，让下载流程更顺。

The watermark-removal approach is based on the reverse alpha-blending algorithm from [GargantuaX/gemini-watermark-remover](https://github.com/GargantuaX/gemini-watermark-remover); this project packages it as a persistent browser extension integrated into the download flow.

## License

[MIT](./LICENSE)
