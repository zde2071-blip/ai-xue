import unittest
import test_workflow
import server as app

class ReadingMarks(unittest.TestCase):
    setUp = test_workflow.LearningWorkflow.setUp
    tearDown = test_workflow.LearningWorkflow.tearDown
    post = test_workflow.LearningWorkflow.post
    def test_colors_repeated_text_and_clear(self):
        target=self.c['blocks'][0]['id']
        for offset in [2,20]:
            self.post('highlight',target=target,quote='same',style='highlight',color='green',start=offset,before='a ',after=' b')
        self.post('highlight',target=target,quote='same',style='highlight',color='blue',start=20)
        marks=app.get_course(self.c['id'])['highlights']
        self.assertEqual(len(marks),2)
        self.assertEqual([m['color'] for m in marks],['green','blue'])
        self.post('highlight',target=target,quote='same',style='underline',start=20)
        self.post('highlight',target=target,quote='same',style='clear',start=20)
        marks=app.get_course(self.c['id'])['highlights'];self.assertEqual(len(marks),1);self.assertEqual(marks[0]['start'],2)
    def test_invalid_annotation(self):
        with self.assertRaises(app.Problem):self.post('highlight',target=self.c['blocks'][0]['id'],quote='x',style='highlight',color='invalid')
        with self.assertRaises(app.Problem):self.post('highlight',target=self.c['blocks'][0]['id'],quote='x',start=-1)
    def test_reading_comments_and_colored_underlines(self):
        target=self.c['blocks'][0]['id']
        self.post('highlight',target=target,quote='概念',start=0,style='underline',color='red')
        c=self.post('highlight',target=target,quote='概念',start=0,style='comment',comment='自己的理解')
        comment=next(m for m in c['highlights'] if m['style']=='comment')
        c=self.post('highlight',target=target,quote='概念',start=0,style='remove',remove_ids=[comment['id']])
        self.assertEqual(len(c['highlights']),1)
        self.assertEqual(c['highlights'][0]['color'],'red')

    def test_translation_does_not_return_demo_answer(self):
        with self.assertRaisesRegex(app.Problem, '连接 AI'):
            self.post('chat', block_id=self.c['blocks'][0]['id'], quote='relation', question='翻译', mode='translation')
        self.assertEqual(app.list_discussions(self.c['id']), [])

    def test_translation_uses_current_note_context(self):
        from unittest.mock import patch
        bid = self.c['blocks'][0]['id']
        self.post('lesson', block_id=bid)
        note = self.post('finish', title='上下文测试')['note']
        app.Path(note['path']).write_text(note['content'] + '\nA relation describes connections.\n', encoding='utf-8')
        with patch.object(app, 'KEY', 'test-only-key'), patch.object(app, 'ask', return_value='relation：名词，关系。') as ask:
            result = self.post('chat', block_id=bid, note_id=note['id'], quote='relation', question='翻译', mode='translation')
        self.assertIn('<当前笔记>', ask.call_args.args[0][0]['content'])
        self.assertIn('A relation describes connections.', ask.call_args.args[0][0]['content'])
        self.assertIn('名词，关系', result['messages'][-1]['content'])
        self.assertIn(result['id'], app.get_note(self.c['id'], note['id'])['thread_ids'])
