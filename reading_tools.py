"""Local reading utilities: portable Kokoro speech and Argos/CTranslate2 translation."""
import base64
import io
import wave
import re
import sqlite3
from contextlib import closing
import threading
from pathlib import Path

from reading_paths import MODEL_ROOT, SPEECH_ROOT

_SPEECH = None
_SPEECH_LOCK = threading.Lock()
_MODELS = {}
_LOCK = threading.Lock()

class ReadingError(ValueError):
    pass

def selection(data, limit):
    text = data.get('text')
    if not isinstance(text, str) or not text.strip():
        raise ReadingError('请先选中文字。')
    text = text.strip()
    if len(text) > limit:
        raise ReadingError(f'请选取 {limit} 字以内的单词或句子。')
    if '\x00' in text:
        raise ReadingError('选中文字含有无效字符。')
    return text

def language(text):
    return 'zh' if re.search(r'[\u3400-\u9fff]', text) else 'en'

def speech_model():
    global _SPEECH
    if _SPEECH is None:
        try:
            import sherpa_onnx
        except ImportError:
            raise ReadingError('语音组件尚未安装，请运行 python setup.py。') from None
        folder = SPEECH_ROOT / 'kokoro-multi-lang-v1_0'
        required = ('model.onnx', 'voices.bin', 'tokens.txt', 'lexicon-us-en.txt', 'lexicon-zh.txt')
        if any(not (folder/name).is_file() for name in required):
            raise ReadingError('中英语音包尚未安装，请运行 python setup.py。')
        config = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
            kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
                model=str(folder/'model.onnx'), voices=str(folder/'voices.bin'),
                tokens=str(folder/'tokens.txt'),
                lexicon=','.join(str(folder/name) for name in required[3:])),
            num_threads=2, debug=False, provider='cpu'), max_num_sentences=1)
        if not config.validate():
            raise ReadingError('语音包不完整，请重新安装阅读组件。')
        _SPEECH = sherpa_onnx.OfflineTts(config)
    return _SPEECH

def pronounce(data):
    text = selection(data, 200)
    lang = language(text)
    voice, sid = ('zf_xiaobei', 45) if lang == 'zh' else ('af_heart', 3)
    try:
        import numpy as np
        with _SPEECH_LOCK:
            audio = speech_model().generate(text, sid=sid, speed=1.0)
        if not len(audio.samples):
            raise ReadingError('未能生成语音，请选择中英文单词或短句。')
        output = io.BytesIO()
        with wave.open(output, 'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(audio.sample_rate)
            wav.writeframes((np.clip(audio.samples, -1, 1)*32767).astype('<i2').tobytes())
    except ReadingError:
        raise
    except Exception:
        raise ReadingError('语音生成失败，请检查阅读组件是否安装完整。') from None
    return {'audio':base64.b64encode(output.getvalue()).decode('ascii'), 'mime':'audio/wav',
            'language':lang, 'voice':voice, 'engine':'Kokoro / sherpa-onnx'}

def model(source, target):
    key = (source, target)
    if key not in _MODELS:
        try:
            import ctranslate2
            import sentencepiece
        except ImportError:
            raise ReadingError('本地翻译组件尚未安装，请运行翻译组件安装工具。') from None
        folder = MODEL_ROOT / f'translate-{source}_{target}-1_9'
        tokenizers = list(folder.glob('*.model'))
        if not tokenizers or not (folder/'model/model.bin').is_file():
            raise ReadingError('中英翻译包尚未安装，请运行翻译组件安装工具。')
        _MODELS[key] = (ctranslate2.Translator(str(folder/'model'), device='cpu', compute_type='int8', intra_threads=2), sentencepiece.SentencePieceProcessor(model_file=str(tokenizers[0])))
    return _MODELS[key]

def translate(data):
    text = selection(data, 1000)
    source = language(text)
    target = 'en' if source == 'zh' else 'zh'
    dictionary = MODEL_ROOT/'ecdict.sqlite3'
    if source=='en' and len(text)<=80 and dictionary.is_file():
        with closing(sqlite3.connect(dictionary.resolve().as_uri()+'?mode=ro', uri=True)) as db:
            entry=db.execute('SELECT translation FROM entries WHERE word=?', (text.casefold(),)).fetchone()
        if entry and entry[0]:
            return {'text':entry[0], 'source':source, 'target':target, 'engine':'ECDICT', 'dictionary':True}
    with _LOCK:
        engine, tokenizer = model(source, target)
        sentences = [s.strip() for s in re.split(r'(?<=[。！？.!?])\s+|\n+', text) if s.strip()]
        tokens = [tokenizer.encode(s, out_type=str) for s in sentences]
        if any(len(t)>256 for t in tokens):
            raise ReadingError('这段文字较长，请分成短句翻译。')
        results = engine.translate_batch(tokens, beam_size=4, length_penalty=0.2, replace_unknowns=True, max_input_length=0, max_decoding_length=512)
        translated = '\n'.join(tokenizer.decode(r.hypotheses[0]).replace('▁', ' ').strip() for r in results)
    if not translated:
        raise ReadingError('没有得到译文，请换一个短句重试。')
    return {'text':translated, 'source':source, 'target':target, 'engine':'Argos Translate / CTranslate2'}
