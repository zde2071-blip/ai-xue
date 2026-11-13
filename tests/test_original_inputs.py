import base64
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import ai_services
import original_inputs
import server as app


class OriginalInputsTest(unittest.TestCase):
    def cfg(self,provider):
        return {'provider':provider,'base':ai_services.PROVIDERS[provider].get('base') or 'https://example.test/v1','model':'vision-test','key':'test-placeholder'}
    def messages(self,provider,filename,raw):
        return original_inputs.attach(self.cfg(provider),[{'role':'system','content':'Read the original. Return JSON.'},{'role':'user','content':'Explain it.'}],[{'filename':filename,'raw':raw}],app.Problem)
    def test_image_bytes_reach_chat_api_unchanged(self):
        raw=b'original-image-bytes'
        messages=self.messages('deepseek','diagram.png',raw)
        with patch.object(ai_services,'request_json',return_value={'choices':[{'message':{'content':'read'}}]}) as request:
            ai_services.chat_messages(self.cfg('deepseek'),messages)
        content=request.call_args.args[2]['messages'][-1]['content']
        self.assertEqual(base64.b64decode(content[-1]['image_url']['url'].split(',')[1]),raw)
        self.assertEqual(request.call_args.args[1],'/chat/completions')
    def test_pdf_and_office_originals_use_openai_file_inputs(self):
        for filename in ['slides.pdf','slides.pptx','text.docx']:
            raw=b'original-'+filename.encode()
            messages=self.messages('openai',filename,raw)
            with patch.object(ai_services,'request_json',return_value={'output':[{'type':'message','content':[{'type':'output_text','text':'read'}]}]}) as request:
                self.assertEqual(ai_services.chat_messages(self.cfg('openai'),messages,json_mode=True),'read')
            self.assertEqual(request.call_args.args[1],'/responses')
            packet=request.call_args.args[2];file=packet['input'][-1]['content'][-1]
            self.assertEqual(file['type'],'input_file');self.assertEqual(file['filename'],filename)
            self.assertEqual(base64.b64decode(file['file_data'].split(',')[1]),raw)
            self.assertFalse(packet['store'])
    def test_claude_pdf_is_a_document_block(self):
        with patch.object(ai_services,'request_json',return_value={'content':[{'type':'text','text':'read'}]}) as request:
            ai_services.chat_messages(self.cfg('claude'),self.messages('claude','slides.pdf',b'%PDF-original'))
        block=request.call_args.args[2]['messages'][-1]['content'][-1]
        self.assertEqual(block['type'],'document');self.assertEqual(base64.b64decode(block['source']['data']),b'%PDF-original')
    def test_gemini_pdf_uses_native_document_endpoint(self):
        with patch.object(ai_services,'request_json',return_value={'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':'read'}]}}]}) as request:
            self.assertEqual(ai_services.chat_messages(self.cfg('gemini'),self.messages('gemini','slides.pdf',b'%PDF-original')),'read')
        cfg,path,body=request.call_args.args
        self.assertTrue(cfg['native_gemini']);self.assertEqual(cfg['base'],'https://generativelanguage.googleapis.com/v1beta')
        self.assertTrue(path.endswith(':generateContent'))
        self.assertEqual(base64.b64decode(body['contents'][-1]['parts'][-1]['inline_data']['data']),b'%PDF-original')
    def test_unsupported_file_has_no_text_fallback_or_network_call(self):
        for name in ['slides.pdf','slides.pptx']:
            with patch.object(ai_services,'request_json') as request,self.assertRaisesRegex(app.Problem,'不支持.*原件'):
                self.messages('deepseek',name,b'original')
            request.assert_not_called()
    def test_plain_text_is_complete_original_not_a_summary(self):
        text='完整文字原件，保持公式 x² 和换行。\n第二行。'
        messages=self.messages('deepseek','lecture.md',text.encode())
        self.assertIn(text,messages[-1]['content'])
    def test_pdf_page_scope_does_not_send_other_pages(self):
        from pypdf import PdfWriter,PdfReader
        writer=PdfWriter();writer.add_blank_page(width=100,height=100);writer.add_blank_page(width=200,height=100);out=io.BytesIO();writer.write(out)
        selected=original_inputs.select_pages('pages.pdf',out.getvalue(),'2')
        reader=PdfReader(io.BytesIO(selected));self.assertEqual(len(reader.pages),1);self.assertEqual(reader.pages[0].mediabox.width,200)
        with self.assertRaises(ValueError):original_inputs.select_pages('pages.pdf',out.getvalue(),'3')
    def test_import_and_later_requests_read_original_without_extracting_binary(self):
        with tempfile.TemporaryDirectory() as directory,patch.object(app,'VAULT',Path(directory)/'vault'),patch.object(app,'CONFIG',Path(directory)/'provider.json'):
            raw=b'%PDF-a-scanned-document-with-no-text-layer'
            outline={'title':'Original','overview':'Read the image','blocks':[{'title':'Graph','points':['Chart']} ]}
            with patch.object(app,'extract',side_effect=AssertionError('must not extract')),patch.object(app,'ask',return_value=outline) as ask:
                course=app.import_course({'filename':'scan.pdf','file':base64.b64encode(raw).decode()})
                self.assertEqual(ask.call_args.kwargs['originals'][0]['raw'],raw)
            before=(app.folder(course['id'])/'原始资料'/'source.pdf').read_bytes()
            with patch.object(app,'ask',return_value='Read from original') as ask,patch.object(app.details_store().__class__,'source_context',side_effect=AssertionError('must not use old text')):
                app.get_lesson(course,course['active']);self.assertEqual(ask.call_args.kwargs['originals'][0]['raw'],raw)
                app.plan_chat(course,{'question':'What is the diagram?'});self.assertEqual(ask.call_args.kwargs['originals'][0]['raw'],raw)
                app.chat(course,{'block_id':course['active'],'question':'Explain the chart'});self.assertEqual(ask.call_args.kwargs['originals'][0]['raw'],raw)
            self.assertEqual(before,raw)
            (app.folder(course['id'])/'原始资料'/'source.pdf').unlink()
            with self.assertRaises(app.Problem):app.details_store().source_originals(course)
