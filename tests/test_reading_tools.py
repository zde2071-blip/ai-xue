import json
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
            with sqlite3.connect(Path(temp)/'ecdict.sqlite3') as db:
                db.execute('CREATE TABLE entries(word TEXT PRIMARY KEY,translation TEXT)')
                db.execute('INSERT INTO entries VALUES (?,?)',('intersection','n. 交集；交叉点'))
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

    def test_native_voice_is_explicit_and_text_is_not_a_shell_argument(self):
        for text,voice in [('Hello','Samantha'),('你好','Tingting')]:
            calls=[]
            def run(args,**kwargs):
                calls.append(args)
                if args[0]=='/usr/bin/say':
                    self.assertEqual(Path(args[args.index('-f')+1]).read_text(),text)
                else:Path(args[-1]).write_bytes(b'RIFF'+b'\0'*100)
            with patch.object(tools.subprocess,'run',side_effect=run):result=tools.pronounce({'text':text})
            self.assertEqual(result['voice'],voice);self.assertEqual(calls[0][2],voice)
            self.assertNotIn(text,calls[0]);self.assertEqual(result['mime'],'audio/wav')

    def test_reading_routes_need_no_ai_connection(self):
        import server
        with patch.object(server,'KEY',''),patch.object(server,'ask',side_effect=AssertionError('LLM must not run')),patch.object(tools,'translate',return_value={'text':'测试'}) as translator:
            self.assertEqual(server.route_post('/api/reading/translate',{'text':'test'}),{'text':'测试'})
            translator.assert_called_once_with({'text':'test'})
