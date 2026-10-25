# 连续 Markdown 编辑器

使用 CodeMirror 6。修改 index.js 后运行 `npm ci` 和 `npm run build`，生成 web/editor.bundle.js。成品可直接离线运行，不需要启动构建工具。

实时预览通过文本装饰实现，始终只有一个文档和一个编辑区；保留键盘移动、跨段选择、输入法、撤销重做。阅读标记和笔记保存仍由 app.js / server.py 处理。
