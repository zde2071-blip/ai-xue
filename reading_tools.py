"""Local reading utilities: native macOS speech and Argos/CTranslate2 translation."""
import base64
import os
import re
import sqlite3
from contextlib import closing
import subprocess
import tempfile
import threading
from pathlib import Path

MODEL_ROOT = Path(os.environ.get('AI_XUE_TRANSLATION_MODELS', Path.home() / 'Library/Application Support/AI Xue/translation-models'))
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

def pronounce(data):
    text = selection(data, 200)
    lang = language(text)
    voice = 'Tingting' if lang == 'zh' else 'Samantha'
    with tempfile.TemporaryDirectory(prefix='ai-xue-speech-') as folder:
        folder = Path(folder)
        (folder/'text.txt').write_text(text, encoding='utf-8')
        try:
            subprocess.run(['/usr/bin/say', '-v', voice, '-r', '170', '-f', str(folder/'text.txt'), '-o', str(folder/'speech.aiff')], check=True, capture_output=True, timeout=25)
            subprocess.run(['/usr/bin/afconvert', '-f', 'WAVE', '-d', 'LEI16', str(folder/'speech.aiff'), str(folder/'speech.wav')], check=True, capture_output=True, timeout=10)
            audio = (folder/'speech.wav').read_bytes()
            if len(audio)<44:
                raise ReadingError('未能生成语音，请重试。')
        except (OSError, subprocess.SubprocessError):
            raise ReadingError('系统语音暂不可用，请检查 macOS 的 Samantha 和 Tingting 语音。') from None
    return {'audio':base64.b64encode(audio).decode('ascii'), 'mime':'audio/wav', 'language':lang, 'voice':voice}

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
