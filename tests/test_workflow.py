import io
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import server as app


class LearningWorkflow(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.saved = (app.VAULT, app.CONFIG, app.KEY, app.PROVIDER.copy(), app.VERIFIED)
        app.VAULT = Path(self.tmp.name) / 'vault'
        app.CONFIG = Path(self.tmp.name) / 'provider.json'
        app.KEY = ''
        app.VERIFIED = False
        self.c = app.seed_demo()

    def tearDown(self):
        app.VAULT, app.CONFIG, app.KEY, app.PROVIDER, app.VERIFIED = self.saved
        self.tmp.cleanup()

    def post(self, action, **data):
        return app.route_post(f'/api/courses/{self.c["id"]}/{action}', data)

    def test_partial_learning_discussion_finish_resume(self):
        first = self.c['blocks'][0]['id']
        second = self.c['blocks'][1]['id']
        self.post('lesson', block_id=first)
        self.assertEqual(app.get_course(self.c['id'])['completed'], [])
        thread = self.post('chat', block_id=first, quote='有序对', question='为什么要有顺序？')
        self.assertEqual(len(thread['messages']), 2)
        self.post('complete', block_id=first)
        self.post('lesson', block_id=second)
        result = self.post('finish', title='第一轮笔记')
        note = result['note']
        self.assertEqual(result['course']['status'], 'paused')
        self.assertEqual(len(note['block_ids']), 2)
        self.assertIn('尚未确认学完', note['content'])
        self.assertIn('为什么要有顺序', note['discussions'][0]['title'])
        self.assertNotIn('为什么要有顺序', note['content'])
        self.assertTrue(Path(note['path']).exists())
        retry = self.post('finish')
        self.assertEqual(note['id'], retry['note']['id'])
        old_session = result['course']['session']
        resumed = self.post('lesson', block_id=second)['course']
        self.assertNotEqual(old_session, resumed['session'])
        self.assertEqual(resumed['completed'], [first])
        self.assertEqual(resumed['session_blocks'], [second])

    def test_external_edit_conflict_and_successful_retry(self):
        first = self.c['blocks'][0]['id']
        self.post('lesson', block_id=first)
        note = self.post('finish')['note']
        path = Path(note['path'])
        external = note['content'] + '\nAgent 补充了一段解释。\n'
        path.write_text(external)
        with self.assertRaises(app.Problem) as caught:
            self.post('save-note', note_id=note['id'], content='stale editor text', etag=note['etag'])
        self.assertEqual(caught.exception.status, 409)
        self.assertEqual(path.read_text(), external)
        latest = app.get_note(self.c['id'], note['id'])
        saved = self.post('save-note', note_id=note['id'], content=external+'新理解', etag=latest['etag'])
        self.assertTrue(saved['content'].endswith('新理解'))

    def test_demo_reorder_keeps_correct_lesson(self):
        blocks = self.c['blocks'][::-1]
        self.post('outline', blocks=blocks)
        lesson = self.post('lesson', block_id=blocks[0]['id'])['content']
        self.assertIn('复合', lesson)
        self.assertNotIn('从“谁与谁有关”开始', lesson)

    def test_progress_requires_existing_lesson(self):
        with self.assertRaises(app.Problem):
            self.post('complete', block_id=self.c['active'])
        self.post('lesson', block_id=self.c['blocks'][2]['id'])
        updated = self.post('complete', block_id=self.c['blocks'][2]['id'])
        self.assertEqual(updated['completed'], [self.c['blocks'][2]['id']])

    def test_mark_persists_without_changing_markdown(self):
        bid = self.c['active']
        lesson = self.post('lesson', block_id=bid)['content']
        marked = self.post('highlight', target=bid, quote='有序对', style='underline')
        self.assertEqual(marked['highlights'][0]['style'], 'underline')
        self.assertEqual((app.folder(self.c['id'])/'讲解'/f'{bid}.md').read_text(), lesson)

    def test_import_mock_model_and_source_integrity(self):
        outline = {'title':'向量入门','overview':'理解向量','blocks':[{'title':'向量相加','description':'从数对出发','points':['坐标','相加']}]}
        raw = '# 向量\n' + '向量可以用数对表示，向量加法将对应坐标分别相加。' * 4
        with patch.object(app, 'ask', return_value=outline):
            c = app.import_course({'filename':'课程.md','text':raw})
        self.assertFalse(c['demo'])
        self.assertEqual((app.folder(c['id'])/'原始资料'/'source.md').read_text(), raw)
        self.assertEqual(c['status'], 'planning')

    def test_missing_key_and_long_sources_are_explicit(self):
        with self.assertRaisesRegex(app.Problem, 'AI 服务'):
            app.import_course({'filename':'课件.md','text':'正常课程材料。'*30})
        with self.assertRaisesRegex(app.Problem, '较长'):
            app.import_course({'filename':'课件.md','text':'向量'*60000})
        with self.assertRaisesRegex(app.Problem, '足够的文字'):
            app.import_course({'filename':'课件.md','text':'空'})

    def test_pptx_extraction(self):
        from pptx import Presentation
        prs = Presentation()
        slide = prs.slides.add_slide(prs.slide_layouts[1])
        slide.shapes.title.text = '关系与函数'
        slide.placeholders[1].text = '关系是笛卡尔积的子集。'
        output = io.BytesIO()
        prs.save(output)
        extracted = app.extract('lecture.pptx', output.getvalue())
        self.assertIn('【第 1 页】', extracted)
        self.assertIn('笛卡尔积', extracted)

    def test_note_followup_is_linked_to_saved_note(self):
        bid = self.c['active']
        self.post('lesson', block_id=bid)
        note = self.post('finish')['note']
        self.post('chat', block_id=bid, question='复习时的新问题', note_id=note['id'])
        latest = app.get_note(self.c['id'], note['id'])
        self.assertEqual(len(latest['discussions']), 1)

    def test_credentials_never_persist_and_need_test(self):
        result = app.route_post('/api/settings', {'base_url':'https://example.com/v1','model':'example','key':'test-only-secret'})
        self.assertFalse(result['connected'])
        self.assertNotIn('test-only-secret', app.CONFIG.read_text())
        self.assertNotIn('test-only-secret', json.dumps(app.state()))
        with patch.object(app, 'ask', return_value='成功'):
            app.route_post('/api/test', {})
        self.assertTrue(app.state()['settings']['connected'])

    def test_http_origin_and_path_guard(self):
        old_auth=app.AUTH
        app.AUTH=app.accounts.Store(Path(self.tmp.name)/'accounts',app.ROOT,app.VAULT,app.CONFIG)
        http = app.ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
        worker = threading.Thread(target=http.serve_forever, daemon=True)
        worker.start()
        base = f'http://127.0.0.1:{http.server_port}'
        try:
            with self.assertRaises(HTTPError) as caught:
                urlopen(base+'/api/state')
            self.assertEqual(caught.exception.code,401)
            req = Request(base+'/api/demo', b'{}', {'Content-Type':'application/json','X-Study-App':'1','Origin':'https://evil.example'})
            with self.assertRaises(HTTPError) as caught:
                urlopen(req)
            self.assertEqual(caught.exception.code, 403)
            with self.assertRaises(HTTPError):
                urlopen(base+'/%2e%2e/server.py')
        finally:
            http.shutdown()
            http.server_close()
            app.AUTH=old_auth

    def test_compatible_model_end_to_end_over_http(self):
        """Exercise the real client transport with a local, deterministic model stub."""
        received = []
        class ModelHandler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass
            def do_POST(self):
                data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                received.append(data)
                system = data['messages'][0]['content']
                if '只输出 JSON' in system:
                    content = json.dumps({'title':'向量','overview':'认识向量','blocks':[{'title':'相加','description':'理解坐标相加','points':['坐标','加法']}]}, ensure_ascii=False)
                elif '把本次真实学习内容整理' in system:
                    source = json.loads(data['messages'][1]['content'])
                    content = json.dumps({'blocks':[{'id':b['id'],'summary':'向量按坐标相加。'} for b in source['blocks']], 'annotations':[{'id':t['id'],'summary':'疑问：坐标怎样相加？逐个相加。'} for t in source['discussions']]}, ensure_ascii=False)
                elif '大学课程讲师' in system:
                    content = '### 向量相加\n\n$(1,2)+(3,4)=(4,6)$。'
                else:
                    content = '将对应坐标分别相加。'
                output = json.dumps({'choices':[{'message':{'content':content}}]}).encode()
                self.send_response(200)
                self.send_header('Content-Type','application/json')
                self.end_headers()
                self.wfile.write(output)
        model = ThreadingHTTPServer(('127.0.0.1', 0), ModelHandler)
        threading.Thread(target=model.serve_forever, daemon=True).start()
        try:
            app.KEY = 'local-test-placeholder'
            app.PROVIDER = {'base_url':f'http://127.0.0.1:{model.server_port}/v1','model':'test-model'}
            c = app.import_course({'filename':'vectors.md','text':'向量有坐标。对应坐标相加得到向量和。'*8})
            self.c = c
            lesson = self.post('lesson', block_id=c['active'])
            self.assertIn('(4,6)', lesson['content'])
            self.post('chat', block_id=c['active'], question='坐标怎样相加？')
            self.post('complete', block_id=c['active'])
            result = self.post('finish')
            self.assertEqual(result['course']['status'], 'completed')
            self.assertIn('向量按坐标相加', result['note']['content'])
            self.assertEqual(len(result['note']['discussions']), 1)
            self.assertEqual(len(received), 4)
            self.assertEqual(received[0]['response_format']['type'], 'json_object')
        finally:
            model.shutdown()
            model.server_close()


if __name__ == '__main__':
    unittest.main()
