# 阅读工具的第三方来源

这些功能由 AI 学编写界面和接口接入，语音合成、词典及翻译模型来自以下项目，不是 AI 学自行训练的模型。

| 功能 | 项目与版本 | 来源与许可 |
| --- | --- | --- |
| 语音推理 | sherpa-onnx 2.0.1 | [k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx/tree/v2.0.1)，Apache-2.0 |
| 中英语音模型与声音 | Kokoro v1.0 / sherpa 中英模型包 | [hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)，[模型包及声音编号](https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/kokoro.html)，Apache-2.0；原 LICENSE 随资源安装 |
| 英汉词典 | ECDICT | [skywind3000/ECDICT](https://github.com/skywind3000/ECDICT)，MIT；原 LICENSE 随资源安装 |
| 双向翻译模型 | Argos 发布的 translate-en_zh-1_9、translate-zh_en-1_9 | [Argos 模型索引](https://github.com/argosopentech/argospm-index)；原始 OPUS-MT 作者 Jörg Tiedemann、Santhosh Thottingal，CC-BY 4.0，完整模型说明随安装保留 |
| 翻译推理 | CTranslate2 | [OpenNMT/CTranslate2](https://github.com/OpenNMT/CTranslate2)，MIT |
| 翻译分词 | SentencePiece | [google/sentencepiece](https://github.com/google/sentencepiece)，Apache-2.0 |

采用官方模型，不修改权重。语音安装只提取权重、声音、符号表、中英语音词典、README 与 LICENSE；sherpa-onnx 2.x 已移除 eSpeak-ng 依赖，不安装旧包中的 eSpeak 数据。翻译使用 Argos 发布的模型，通过 CTranslate2 直接推理，不安装或冒称使用完整 Argos 应用。

Python 依赖的许可文件由其发行包附带。重新打包分发时应一并保留依赖、模型及词典的许可证和作者说明。前端既有依赖的许可证位于 `web/vendor/licenses/`。本清单不替代项目自身的授权条款。
