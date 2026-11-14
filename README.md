# AI 学

AI 学是面向大学课程的本地自学助手。对照原始课件和 AI 逐块学习，自己确认进度，最后把本次学过的内容整理成 Markdown 笔记。

![AI 学工作区示意。左侧查看原始课件，中间和 AI 对话，右侧确认学习进度。](docs/ai-xue-preview.png)

## 从这周的课开始

- **学习**　从本周课表选一节课导入，自动带入课程和教学周。也可以直接导入 PDF、PPTX、DOCX、Markdown 或 TXT，让 AI 辅助识别资料信息。
- **讲解与追问**　左边看原件，中间读总览和分块讲解、随时提问，右边看进度。按「继续」才推进，追问保留在当前学习块。
- **复习**　结束学习后整理笔记。按课程、周次和课堂类型查找，阅读时按需打开批注和 AI 对话，也可导出 Markdown。
- **学习设置**　日历支持日、周、月、年视图，从「添加」选择校历、课表或考试信息。校历和课表支持文件识别与 iCalendar 订阅，考试信息可从考试安排或 Module Handbook 提取。「课堂分类」可为不同课堂类型选择模板，「讲解与笔记」分别编辑学习讲解和笔记整理的提示词。

## 在本机启动

准备 Git 和 Python 3.11 或以上版本。在 macOS 或 Linux 的终端中运行：

```sh
git clone https://github.com/zde2071-blip/ai-xue.git
cd ai-xue
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python server.py
```

在浏览器打开 `http://127.0.0.1:8767/`，直接进入学习空间。macOS 安装依赖后也可以双击「启动学记.command」。前端资源已随仓库提供，日常启动无需 Node.js。要在学习页内预览 Word 或 PowerPoint 原件，请安装 LibreOffice。

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

发音在 macOS 本地生成音频：英文使用 Samantha，中文使用 Tingting；不再从浏览器语音列表随意选择声音。需要 macOS 的 `say` 和 `afconvert`。

单词和已收录短语查询 [ECDICT](https://github.com/skywind3000/ECDICT) 英汉词典；其余中英短句使用 [Argos Translate](https://github.com/argosopentech/argos-translate) 的 OPUS-MT 1.9 模型，通过 [CTranslate2](https://github.com/OpenNMT/CTranslate2) 在 CPU 上翻译。无需 AI API Key，不发送课件，不创建学习对话。机器翻译不保证专业术语和歧义词在所有上下文中准确。

安装 Python 依赖后，首次运行：

```sh
python tools/install_reading_tools.py
```

安装工具下载并校验双向模型及词典，存入 `~/Library/Application Support/AI Xue/translation-models`；之后发音、查词和翻译无需联网。模型原作者为 Jörg Tiedemann、Santhosh Thottingal，原始 OPUS 模型采用 CC-BY 4.0，安装时保留原 README；ECDICT 采用 MIT，安装时保留许可证。资源不写入知识库、不提交到 Git。可通过 `AI_XUE_TRANSLATION_MODELS` 指定已有资源目录。
