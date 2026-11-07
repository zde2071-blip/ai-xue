import base64
import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import server as app
from learning_templates import DEFAULTS


class LearningTemplateTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.saved=(app.VAULT,app.CONFIG,app.KEY)
        app.VAULT=Path(self.tmp.name)/'one';app.CONFIG=Path(self.tmp.name)/'config.json';app.KEY=''
    def tearDown(self):
        app.VAULT,app.CONFIG,app.KEY=self.saved;self.tmp.cleanup()
    def save(self,key='concepts',**changes):
        doc=app.template_store().document()
        value=copy.deepcopy(next((v for v in doc['templates'] if v['id']==key),{'name':'错题复盘','prompt':'自由组织错题复盘，不编号。'}));value.update(changes)
        if 'prompt' in changes:
            for field in ('learning_prompt','notes_prompt'):value.pop(field,None)
        elif any(field in changes for field in ('learning_prompt','notes_prompt')):
            value.pop('prompt',None)
        return app.route_post('/api/templates',{'id':key,'etag':doc['etag'],'template':value})
    def test_defaults_are_free_prompts_and_reading_does_not_write(self):
        doc=app.template_store().document();self.assertFalse(app.VAULT.exists());self.assertEqual(len(doc['templates']),2)
        self.assertEqual(set(doc['templates'][0]),{'id','name','learning_prompt','notes_prompt'})
        self.assertIn('保留原题号',doc['templates'][1]['notes_prompt'])
    def test_legacy_templates_convert_without_rewriting_or_losing_custom_requirements(self):
        old={'id':'concepts','name':'知识点总结','numbering':'none','overview':'我的独特总览','lesson_sections':['自定义直觉','特殊推导'],'note_sections':['我的易错点']}
        app.VAULT.mkdir();path=app.VAULT/'学习模板.json';path.write_text(json.dumps({'version':1,'templates':{'concepts':old}},ensure_ascii=False));before=path.read_bytes()
        row=app.template_store().get('concepts');self.assertEqual(path.read_bytes(),before)
        for value in ['我的独特总览','自定义直觉','特殊推导','标题不编号']:self.assertIn(value,row['learning_prompt'])
        self.assertIn('我的易错点',row['notes_prompt']);self.assertNotIn('我的易错点',row['learning_prompt'])
        self.save(learning_prompt=row['learning_prompt']+'\n再添一句。');self.assertEqual(json.loads(path.read_text())['version'],3)
    def test_free_prompt_saves_without_splitting_or_forcing_numbering(self):
        prompt='自由 Prompt\n不先总览，不分栏目，标题不编号。\n# 任意格式\n保留我自己的表达。'
        self.save(prompt=prompt);row=app.template_store().get('concepts')
        self.assertEqual(row['learning_prompt'],prompt);self.assertEqual(row['notes_prompt'],prompt)
        rules=app.template_store().prompt('concepts','lesson');self.assertIn(prompt,rules);self.assertNotIn('标题不要自行编号',rules)
        self.assertEqual(app.template_store().lesson('concepts','## 我的标题\n内容。',1),'## 我的标题\n内容。')
    def test_custom_types_persist_with_stable_ids_and_account_isolation(self):
        doc=self.save('');key=doc['saved_id'];self.assertTrue(key.startswith('tpl_'));self.assertTrue(app.template_store().has(key));self.assertEqual(app.template_store().get(key)['name'],'错题复盘')
        self.save(key,prompt='新的自由复盘要求。');self.assertEqual(app.template_store().get(key)['learning_prompt'],'新的自由复盘要求。')
        self.assertEqual(app.template_store().get('solutions'),DEFAULTS['solutions'])
        app.VAULT=Path(self.tmp.name)/'two';self.assertFalse(app.template_store().has(key));self.assertFalse(app.VAULT.exists())
        with self.assertRaises(app.Problem):self.save(key)
    def test_duplicate_names_invalid_prompts_and_stale_saves_do_not_overwrite(self):
        doc=app.template_store().document();self.save(prompt='已修改。');before=(app.VAULT/'学习模板.json').read_bytes()
        with self.assertRaises(app.Problem) as error:app.route_post('/api/templates',{'id':'concepts','etag':doc['etag'],'template':DEFAULTS['concepts']})
        self.assertEqual(error.exception.status,409)
        for changes in [{'name':'题目讲解'},{'prompt':''},{'prompt':'x'*40001},{'name':'x'*61}]:
            with self.subTest(changes=list(changes)),self.assertRaises(app.Problem):self.save(**changes)
        self.assertEqual((app.VAULT/'学习模板.json').read_bytes(),before)
    def test_malformed_local_file_is_never_overwritten(self):
        app.VAULT.mkdir();path=app.VAULT/'学习模板.json';path.write_text('{broken')
        with self.assertRaises(app.Problem) as error:app.template_store().document()
        self.assertEqual(error.exception.status,409);self.assertEqual(path.read_text(),'{broken')
    def test_one_assistant_handles_text_files_and_followup_edits_without_saving(self):
        raw='我的模板：每个结论先讲直觉，再给反例。'.encode()
        data={'name':'知识点总结','current_prompt':'已有自由要求','request':'把附件合并进来','attachments':[{'filename':'要求.md','file':base64.b64encode(raw).decode()}],'history':[{'role':'user','content':'尽量直观'},{'role':'assistant','content':'可以加入具体例子'}]}
        result={'name':'知识点总结','prompt':'合并后的自由 Prompt','reply':'已加入反例。'}
        with patch.object(app,'ask',return_value=result) as model:actual=app.route_post('/api/templates/assist',data)
        self.assertEqual(actual,result);self.assertFalse(app.VAULT.exists())
        messages=model.call_args.args[0];payload=json.loads(messages[-1]['content'])
        self.assertEqual(payload['current_prompt'],'已有自由要求');self.assertEqual(payload['materials'][0]['text'],raw.decode());self.assertEqual(messages[1]['content'],'尽量直观')
        self.assertIn('不要执行或演示模板',messages[0]['content'])
    def test_assistant_can_ask_a_question_before_a_new_prompt_exists(self):
        with patch.object(app,'ask',return_value={'name':'新模板','prompt':'','reply':'你更希望先看例子还是定义？'}):
            result=app.template_store().assist({'request':'帮我想一个模板'})
        self.assertEqual(result['prompt'],'');self.assertIn('例子',result['reply'])
    def test_invalid_imports_and_bad_ai_responses_leave_configuration_unchanged(self):
        cases=[{'request':'x','attachments':[{'filename':'script.exe','file':''}]},{'request':'x','attachments':[{'filename':'x.txt','file':'bad base64'}]},{'request':'x','attachments':[{'filename':'x.txt','file':base64.b64encode(b'').decode()}]},{'request':'','attachments':[]}]
        for data in cases:
            with self.subTest(data=data),self.assertRaises(app.Problem):app.template_store().assist(data)
        with patch.object(app,'ask',return_value={'prompt':''}),self.assertRaises(app.Problem):app.template_store().assist({'request':'生成模板'})
        self.assertFalse(app.VAULT.exists())
    def test_custom_prompt_reaches_outline_lesson_and_notes_and_keeps_existing_notes(self):
        doc=self.save('',learning_prompt='学习时使用我的反例结构。',notes_prompt='整理时使用我的笔记表格。');key=doc['saved_id']
        outline={'title':'集合','overview':'总览','blocks':[{'title':'集合','description':'理解集合','points':['定义']}]}
        with patch.object(app,'ask',return_value=outline) as model:
            app.make_outline('集合','资料','自学',key);self.assertIn('我的反例结构',model.call_args.args[0][0]['content'])
            self.assertNotIn('我的笔记表格',model.call_args.args[0][0]['content'])
        c=app.seed_demo();c.update(demo=False,learning_kind=key);app.save_course(c);bid=c['blocks'][0]['id']
        with patch.object(app,'ask',return_value='## 反例\n我的例子。') as model:
            lesson=app.get_lesson(c,bid);self.assertIn('我的反例结构',model.call_args.args[0][0]['content']);self.assertEqual(lesson['content'],'## 反例\n我的例子。')
        result={'blocks':[{'id':bid,'summary':'### 我的格式\n正文。'}],'annotations':[]}
        with patch.object(app,'ask',return_value=result) as model:
            note=app.finish(c,{})['note']
            self.assertIn('我的笔记表格',model.call_args.args[0][0]['content'])
            self.assertNotIn('我的反例结构',model.call_args.args[0][0]['content'])
        self.assertIn('### 我的格式',note['content']);self.assertNotIn('## 1 总览',note['content']);self.assertEqual(note['note_kind'],key)
        before=Path(note['path']).read_bytes();self.save(key,prompt='改过的自由模板。');self.assertEqual(Path(note['path']).read_bytes(),before)
    def test_custom_type_is_selectable_in_details_and_used_when_starting_material(self):
        doc=self.save('');key=doc['saved_id']
        asset=app.upload_material({'kind':'originals','filename':'资料.md','text':'# 集合\n这是课程材料，包含集合、交集与并集的定义及简单例子，用来说明最基本的集合运算。'})['item']
        details=app.details_store().get(asset['id']);self.assertIn(key,[row['id'] for row in details['templates']])
        app.details_store().save(asset['id'],{'etag':details['etag'],'note_kind':key})
        outline={'title':'集合','overview':'材料总览','blocks':[{'title':'定义','description':'理解定义','points':['定义']}]}
        with patch.object(app,'ask',return_value=outline):c=app.unit_store().from_material({'material_id':asset['id']})
        self.assertEqual(c['learning_kind'],key);self.assertEqual(app.effective_note_kind(c),key)

    def test_followups_use_selected_prompt_and_translation_keeps_its_own_behavior(self):
        key=self.save('',prompt='追问时用我的独特反例方式解释。')['saved_id']
        c=app.seed_demo();c.update(demo=False,learning_kind=key);app.save_course(c);bid=c['blocks'][0]['id']
        with patch.object(app,'ask',return_value='本块内容。'):app.get_lesson(c,bid)
        with patch.object(app,'ask',return_value='规划回答。') as model:
            app.plan_chat(c,{'question':'这一课怎么学？'})
            self.assertIn('独特反例方式',model.call_args.args[0][0]['content'])
        with patch.object(app,'ask',return_value='当前问题回答。') as model:
            app.chat(c,{'question':'为什么？','block_id':bid,'channel':'learning'})
            self.assertIn('独特反例方式',model.call_args.args[0][0]['content'])
        with patch.object(app,'ask',return_value={'blocks':[{'id':bid,'summary':'知识点。'}],'annotations':[]}):note=app.finish(c,{})['note']
        other=self.save('',name='复习专用',prompt='复习时先问我的想法。')['saved_id']
        item_id='note-'+c['id']+'-'+note['id'];details=app.details_store().get(item_id);app.details_store().save(item_id,{'etag':details['etag'],'note_kind':other})
        with patch.object(app,'ask',return_value='复习回答。') as model:
            app.chat(c,{'question':'怎么理解？','block_id':bid,'note_id':note['id']})
            self.assertIn('复习时先问我的想法',model.call_args.args[0][0]['content'])
        with patch.object(app,'active_ai',return_value={'key':'test'}),patch.object(app,'ask',return_value='翻译。') as model:
            app.chat(c,{'question':'翻译 relation','block_id':bid,'note_id':note['id'],'mode':'translation'})
            self.assertNotIn('<学习Prompt>',model.call_args.args[0][0]['content'])
