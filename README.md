# AI 学

AI 学是面向大学课程的本地自学助手。对照原始课件和 AI 逐块学习，自己确认进度，最后把本次学过的内容整理成 Markdown 笔记。

![AI 学工作区示意。左侧查看原始课件，中间和 AI 对话，右侧确认学习进度。](docs/ai-xue-preview.png)

## 从这周的课开始

- **学习**　从本周课表选一节课导入，自动带入课程和教学周。也可以直接导入 PDF、PPTX、DOCX、Markdown 或 TXT，让 AI 辅助识别资料信息。
- **讲解与追问**　左边看原件，中间读总览和分块讲解、随时提问，右边看进度。按「继续」才推进，追问保留在当前学习块。
- **复习**　结束学习后整理笔记。按课程、周次和课堂类型查找，阅读时按需打开批注和 AI 对话，也可导出 Markdown。
- **备考**　上传老师通知、考试安排或 Module Handbook，核对后按课程查看。自行勾选纳入复习的周次和笔记，沿用笔记关联的课件原件；模拟题、真题单独保存。缺少具体考试日期的项目保留周次或考试期，不自动猜日期。
- **学习设置**　校历、课表和考试信息分别管理。「添加」统一为「手动添加」「AI 导入」，AI 导入支持最多 10 份图片或文档，Module Handbook 使用同一入口；按上传顺序识别连续截图，核对后保存。「课堂分类」可为不同课堂类型选择模板，「讲解与笔记」分别编辑学习讲解和笔记整理的提示词。

## 在本机启动

准备 Git 和 Python 3.11–3.14（64 位）。Windows、macOS、Linux 使用相同的安装入口：

```sh
git clone https://github.com/zde2071-blip/ai-xue.git
cd ai-xue
python setup.py
python start.py
```

macOS/Linux 若命令为 `python3`，将上面的 `python` 替换为 `python3`。安装器创建独立环境、安装依赖并下载阅读资源；下载需要联网，失败会停止并显示原因，重新运行可继续已完成的部分。浏览器打开 `http://127.0.0.1:8767/`。前端资源已包含在仓库，无需 Node.js。Office 原件预览需要另外安装 LibreOffice。

首次打开时，新手引导会先带你连接 AI 模型，再依次导入校历、课表和考试信息。可以在对话窗口发送附件、粘贴图片或输入校历、课表订阅链接，核对后再保存。以后也可以从左下角「个人设置 → 新手引导」打开。

AI 服务支持 OpenAI 兼容接口和 Claude 原生接口。识别日历图片时请选择支持图像输入的模型。

学习导入、总览追问、逐块讲解和学习追问会发送关联的原件，不再将 PDF、Office 或图片先抽成文字。OpenAI 文件输入接入 PDF、PPTX、DOCX，Claude 和 Gemini 接入 PDF，兼容服务通过标准 PDF 文件消息调用；是否可用仍取决于所选模型及接口。图片发送原始字节，Markdown/TXT 发送完整原文。DeepSeek Flash 文件接口当前仅支持图片；遇到不支持的原件会提示切换模型，不会自动退回文字提取。关联设置指定页码时，只发送选定的 PDF/PPTX 页面，并标明原页码。

## 数据保存在哪里

课件原件、笔记、旁注和学习日历保存在本机知识库中。已归档的校历、课表或考试文件可以从日历来源设置打开。建议一起备份 `知识库/`和 `.local/`。调用 AI 时，相关资料和问题会发送给所选服务商。API Key 仅保留在运行中的服务内存，重启后需重新填写。

## 开发与反馈

前端是 [HTML、CSS 和 JavaScript](web/)，后端入口为 [server.py](server.py)。

```sh
.venv/bin/python -m unittest discover -s tests -v
node --test tests/*.cjs
```

遇到问题可以在 [Issues](https://github.com/zde2071-blip/ai-xue/issues) 说明复现步骤、操作系统和浏览器。提交截图或样例前请移除私人课件、日历订阅链接和凭据。


## 发音与划词翻译

发音使用 [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) 中英文模型和 [sherpa-onnx 2.0.1](https://github.com/k2-fsa/sherpa-onnx)，在 CPU 上生成音频；浏览器只负责播放。英文声音 af_heart，中文 zf_xiaobei。没有调用 macOS `say`，也不依赖用户电脑上的系统声音。

单词及已收录短语查询 [ECDICT](https://github.com/skywind3000/ECDICT)；其余中英短句使用 Argos 发布的 OPUS-MT 模型，通过 CTranslate2 和 SentencePiece 推理。翻译结果下方显示实际来源。不调用通用 LLM，不需要 AI Key。

`python setup.py` 自动安装这两类资源。已有 Python 环境也可单独运行 `python tools/install_reading_tools.py`。模型首次下载约 500 MB，安装后阅读工具不向第三方发送选中文字。若部署到服务器，选中文字由浏览器发送到自己的服务器进行处理。

资源与用户知识库分开保存：macOS 为 `~/Library/Application Support/AI Xue`，Windows 为 `%LOCALAPPDATA%/AI Xue`，Linux 为 `$XDG_DATA_HOME/ai-xue`（默认 `~/.local/share/ai-xue`）。可统一设置 `AI_XUE_DATA_HOME`，或分别设置 `AI_XUE_TRANSLATION_MODELS` / `AI_XUE_SPEECH_MODELS`。安装器和服务必须使用同一组路径。模型下载进行 SHA-256 校验，保留模型许可证，不提交到 Git。

第三方项目、作者和许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。机器翻译和语音对专业词、数字及混合文本仍有准确性限制。

## 部署范围

阅读服务在后端运行，接口不依赖 macOS，可用于后续网站部署。当前应用仍是单用户版本，默认只监听本机；尚未实现公共网站所需的用户数据隔离和访问控制，不能把现有知识库直接公开为多人网站。本次未发布公网服务。跨平台安装入口已加入，Windows/Linux 整机运行仍需对应系统验证。
