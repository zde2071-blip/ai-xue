import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import server as app

class Conversation(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.saved=(app.VAULT,app.CONFIG,app.KEY,app.VERIFIED,app.PROVIDER.copy())
        app.VAULT=Path(self.tmp.name)/'vault';app.CONFIG=Path(self.tmp.name)/'provider.json';app.KEY='';app.VERIFIED=False
        self.c=app.seed_demo()
    def tearDown(self):
        app.VAULT,app.CONFIG,app.KEY,app.VERIFIED,app.PROVIDER=self.saved
        self.tmp.cleanup()
    def post(self,action,**data):
        result=app.route_post(f'/api/courses/{self.c["id"]}/{action}',data)
        self.c=app.get_course(self.c['id'])
        return result
    def test_chunks_append_without_completing_and_revisit_does_not_duplicate(self):
        a,b=self.c['blocks'][:2]
        self.post('lesson',block_id=a['id'])
        self.post('chat',block_id=a['id'],channel='learning',question='为什么？')
        self.post('lesson',block_id=b['id'])
        messages=app.conversation(self.c)
        self.assertEqual([m['block_id'] for m in messages if m.get('kind')=='lesson'],[a['id'],b['id']])
        self.assertEqual(self.c['completed'],[])
        self.post('lesson',block_id=a['id'])
        self.assertEqual(app.conversation(self.c),messages)
        self.assertTrue((app.folder(self.c['id'])/'对话'/'学习对话.md').exists())
    def test_followups_share_context_across_blocks_and_survive_reload(self):
        a,b=self.c['blocks'][:2]
        self.post('lesson',block_id=a['id'])
        active={'key':'test','connected':True}
        with patch.object(app,'active_ai',return_value=active),patch.object(app,'ask',return_value='先回答这个疑问') as ask:
            first=self.post('chat',block_id=a['id'],channel='learning',question='为什么分母变化？')
            second=self.post('chat',block_id=a['id'],channel='learning',question='再举个例子')
            self.assertEqual(first['id'],second['id'])
            context=ask.call_args.args[0]
            self.assertTrue(any('为什么分母变化' in m['content'] for m in context))
            self.post('lesson',block_id=b['id'])
            self.post('chat',block_id=b['id'],channel='learning',question='和上一块什么关系？')
            self.assertTrue(any('再举个例子' in m['content'] for m in ask.call_args.args[0]))
        self.assertEqual(app.conversation(app.get_course(self.c['id'])),app.conversation(self.c))
    def test_failure_does_not_persist_fake_turn_or_lose_prior_dialogue(self):
        bid=self.c['active'];self.post('lesson',block_id=bid)
        before=app.conversation(self.c)
        with patch.object(app,'active_ai',return_value={'key':'test'}),patch.object(app,'ask',side_effect=app.Problem('模型不可用',502)):
            with self.assertRaises(app.Problem):self.post('chat',block_id=bid,channel='learning',question='失败的问题')
        self.assertEqual(app.conversation(self.c),before)
    def test_finish_keeps_questions_in_annotations_and_transcript(self):
        bid=self.c['active'];self.post('lesson',block_id=bid)
        self.post('chat',block_id=bid,channel='learning',question='为什么要有顺序？')
        result=self.post('finish')
        self.assertNotIn('为什么要有顺序',result['note']['content'])
        self.assertEqual(result['note']['discussions'][0]['messages'][0]['content'],'为什么要有顺序？')
        self.assertTrue(any(m['content']=='为什么要有顺序？' for m in app.conversation(self.c)))
    def test_legacy_course_remains_readable(self):
        bid=self.c['active'];path=app.folder(self.c['id'])/'讲解'/(bid+'.md')
        app.write_text(path,'旧讲解，保留外部编辑')
        messages=app.conversation(self.c)
        self.assertEqual(messages[-1]['content'],'旧讲解，保留外部编辑')
        self.post('lesson',block_id=bid)
        self.assertEqual(app.conversation(self.c)[-1]['content'],'旧讲解，保留外部编辑')
    def test_plan_questions_do_not_start_or_complete_blocks(self):
        with patch.object(app,'ask',return_value='先理解条件概率，再学贝叶斯。'):
            result=self.post('plan-chat',question='先学什么？')
        self.assertEqual(self.c['status'],'planning')
        self.assertEqual(self.c['session_blocks'],[])
        self.assertEqual(self.c['completed'],[])
        self.assertEqual(result['conversation'][-2]['content'],'先学什么？')
