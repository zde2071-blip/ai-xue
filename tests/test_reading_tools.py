import json
from contextlib import closing
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import reading_tools as tools

class ReadingToolsTest(unittest.TestCase):
    def test_language_and_limits(self):
        self.assertEqual(tools.language('intersection'),'en')
        self.assertEqual(tools.language('集合 A'),'zh')
        for text in ('',None,'x'*201,'bad\x00text'):
            with self.assertRaises(tools.ReadingError):tools.selection({'text':text},200)

    def test_dictionary_never_loads_a_translation_model(self):
        with tempfile.TemporaryDirectory() as temp:
            with closing(sqlite3.connect(Path(temp)/'ecdict.sqlite3')) as db:
                db.execute('CREATE TABLE entries(word TEXT PRIMARY KEY,translation TEXT)')
                db.execute('INSERT INTO entries VALUES (?,?)',('intersection','n. 交集；交叉点'))
                db.commit()
            with patch.object(tools,'MODEL_ROOT',Path(temp)),patch.object(tools,'model',side_effect=AssertionError('must not run')):
                result=tools.translate({'text':'Intersection'})
            self.assertTrue(result['dictionary']);self.assertIn('交集',result['text'])

    def test_sentence_translation_decodes_space_markers_without_llm(self):
        class Tokenizer:
            def encode(self,text,out_type):return text.split()
            def decode(self,tokens):return ''.join(tokens)
        class Engine:
            def translate_batch(self,tokens,**kwargs):
                assert kwargs['max_input_length']==0
                return [SimpleNamespace(hypotheses=[['A','▁set']]) for t in tokens]
        with patch.object(tools,'model',return_value=(Engine(),Tokenizer())):
            self.assertEqual(tools.translate({'text':'一个集合'})['text'],'A set')

    def test_portable_speech_returns_valid_pcm_and_explicit_voice(self):
        import base64, io, wave
        import numpy as np
        for text,voice,sid in [('Hello','af_heart',3),('你好','zf_xiaobei',45)]:
            engine=SimpleNamespace(generate=lambda value,**kw: SimpleNamespace(samples=np.array([0.0,0.5,-0.5]),sample_rate=24000))
            with patch.object(tools,'speech_model',return_value=engine):
                result=tools.pronounce({'text':text})
            self.assertEqual(result['voice'],voice)
            with wave.open(io.BytesIO(base64.b64decode(result['audio']))) as wav:
                self.assertEqual(wav.getframerate(),24000)
                self.assertEqual(wav.getnframes(),3)
                self.assertEqual(wav.getsampwidth(),2)

    def test_missing_speech_assets_give_install_instruction(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(tools,'SPEECH_ROOT',Path(temp)), patch.object(tools,'_SPEECH',None):
            with self.assertRaisesRegex(tools.ReadingError,'setup.py'):
                tools.speech_model()

    def test_platform_paths_and_explicit_override(self):
        import reading_paths
        for platform,part in [('darwin','Library'),('win32','AI Xue'),('linux','ai-xue')]:
            with patch.dict(reading_paths.os.environ,{},clear=True), patch.object(reading_paths.sys,'platform',platform):
                self.assertIn(part,str(reading_paths.data_root()))
        with patch.dict(reading_paths.os.environ,{'AI_XUE_DATA_HOME':'/tmp/ai-xue-assets'}):
            self.assertEqual(str(reading_paths.data_root()),'/tmp/ai-xue-assets')

    def test_reading_routes_need_no_ai_connection(self):
        import server
        with patch.object(server,'KEY',''),patch.object(server,'ask',side_effect=AssertionError('LLM must not run')),patch.object(tools,'translate',return_value={'text':'测试'}) as translator:
            self.assertEqual(server.route_post('/api/reading/translate',{'text':'test'}),{'text':'测试'})
            translator.assert_called_once_with({'text':'test'})
