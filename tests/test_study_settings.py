import copy
import base64
from unittest.mock import patch
import json
import tempfile
import unittest
from pathlib import Path
import server as app

class SettingsTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.saved=app.VAULT;app.VAULT=Path(self.tmp.name)/'one'
    def tearDown(self):app.VAULT=self.saved;self.tmp.cleanup()
    def save(self,groups=None,etag=None):
        doc=app.settings_store().document()
        return app.route_post('/api/learning-settings',{'etag':etag or doc['etag'],'groups':groups or doc['groups']})
    def test_defaults_are_readonly_and_include_legacy_and_used_choices(self):
        self.assertIn('Tutorial',app.settings_store().document()['groups']['class_type']);self.assertFalse(app.VAULT.exists())
        app.VAULT.mkdir();(app.VAULT/'标签库.json').write_text(json.dumps({'version':1,'groups':{'class_type':['Studio']}}))
        self.assertIn('Studio',app.settings_store().document()['groups']['class_type']);self.assertFalse((app.VAULT/'学习设置.json').exists())
    def test_choices_save_and_reach_details_catalog_without_rewriting_existing_data(self):
        c=app.seed_demo();bid=c['blocks'][0]['id'];app.get_lesson(c,bid);note=app.finish(c,{})['note'];note_path=Path(note['path']);before=note_path.read_bytes();course_before=(app.folder(c['id'])/'course.json').read_bytes()
        groups=app.settings_store().document()['groups'];groups.update(class_type=['Studio'],course=['新课程'],weeks=['3','5'],custom=['考前复习'])
        self.save(groups)
        self.assertEqual(app.unit_store().catalog()['groups']['class_type'],['Studio'])
        details=app.details_store().get('note-'+c['id']+'-'+note['id'])
        self.assertEqual(details['choices']['class_type'],['Studio']);self.assertEqual(note_path.read_bytes(),before);self.assertEqual((app.folder(c['id'])/'course.json').read_bytes(),course_before)
        app.details_store().save(details['item']['id'],{'etag':details['etag'],'tags':{**details['tags'],'class_type':'Studio'}})
        self.assertEqual(app.details_store().get(details['item']['id'])['tags']['class_type'],'Studio');self.assertEqual(note_path.read_bytes(),before)
    def test_stale_invalid_and_corrupt_files_do_not_overwrite(self):
        old=app.settings_store().document();self.save();before=(app.VAULT/'学习设置.json').read_bytes()
        with self.assertRaises(app.Problem) as error:self.save(etag=old['etag'])
        self.assertEqual(error.exception.status,409)
        for value in [['0'],['61'],[True],['1-3']]:
            groups=copy.deepcopy(old['groups']);groups['weeks']=value
            with self.assertRaises(app.Problem):self.save(groups)
        self.assertEqual((app.VAULT/'学习设置.json').read_bytes(),before)
        (app.VAULT/'学习设置.json').write_text('{broken')
        with self.assertRaises(app.Problem):app.settings_store().document()
        self.assertEqual((app.VAULT/'学习设置.json').read_text(),'{broken')
    def test_settings_are_account_scoped_and_deduplicate(self):
        groups=app.settings_store().document()['groups'];groups['class_type']=[' Studio ','Studio','studio'];self.save(groups)
        self.assertEqual(app.unit_store().catalog()['groups']['class_type'],['Studio'])
        app.VAULT=Path(self.tmp.name)/'two';self.assertNotIn('Studio',app.unit_store().catalog()['groups']['class_type']);self.assertFalse(app.VAULT.exists())

    def test_note_type_names_share_the_real_prompt_and_new_types_get_stable_ids(self):
        doc=app.settings_store().document();types=copy.deepcopy(doc['note_types']);types[0]['name']='概念学习';types.append({'id':'','name':'错题复盘'})
        original=app.template_store().get('concepts')['prompt']
        result=app.settings_store().save({'etag':doc['etag'],'groups':doc['groups'],'templates_etag':doc['templates_etag'],'note_types':types})
        self.assertEqual(app.template_store().get('concepts')['prompt'],original);self.assertEqual(app.template_store().get('concepts')['name'],'概念学习')
        created=next(row for row in result['note_types'] if row['name']=='错题复盘');self.assertTrue(app.template_store().has(created['id']));self.assertTrue(app.template_store().get(created['id'])['prompt'])
    def test_external_prompt_update_blocks_stale_type_edits_without_touching_settings(self):
        doc=app.settings_store().document();templates=app.template_store().document()
        app.template_store().save({'id':'concepts','etag':templates['etag'],'template':{**templates['templates'][0],'prompt':'外部工具刚刚修改的 Prompt。'}})
        before=(app.VAULT/'学习模板.json').read_bytes()
        with self.assertRaises(app.Problem) as error:app.settings_store().save({'etag':doc['etag'],'groups':doc['groups'],'templates_etag':doc['templates_etag'],'note_types':doc['note_types']})
        self.assertEqual(error.exception.status,409);self.assertEqual((app.VAULT/'学习模板.json').read_bytes(),before);self.assertFalse((app.VAULT/'学习设置.json').exists())
    def test_partial_disk_failure_rolls_back_both_configuration_files(self):
        self.save();doc=app.settings_store().document();before=(app.VAULT/'学习设置.json').read_bytes();original=app.write_json
        def fail_template(path,value):
            if Path(path).name=='学习模板.json':raise OSError('test disk failure')
            return original(path,value)
        groups=copy.deepcopy(doc['groups']);groups['course']=['新课程'];types=[*doc['note_types'],{'id':'','name':'错题复盘'}]
        with patch.object(app,'write_json',side_effect=fail_template),self.assertRaises(OSError):app.settings_store().save({'etag':doc['etag'],'groups':groups,'templates_etag':doc['templates_etag'],'note_types':types})
        self.assertEqual((app.VAULT/'学习设置.json').read_bytes(),before);self.assertFalse((app.VAULT/'学习模板.json').exists())
    def test_calendar_import_returns_evidenced_choices_without_writing_or_guessing(self):
        text='课程：ADS102；课堂类型：Lecture、Tutorial。第一学期教学周为第1至16周。'
        data={'attachments':[{'filename':'校历.txt','file':base64.b64encode(text.encode()).decode()}]}
        answer={'course':[{'value':'ADS102','evidence':'课程：ADS102','source':'校历.txt'}],'class_type':[{'value':'Tutorial','evidence':'课堂类型：Lecture、Tutorial','source':'校历.txt'}],'weeks':[{'value':i,'evidence':'教学周为第1至16周','source':'校历.txt'} for i in range(1,17)],'note_kind':[{'value':'编造的类型','evidence':'原文没有这句话','source':'校历.txt'}],'reply':'识别到了课程与教学周。'}
        with patch.object(app,'ask',return_value=answer):result=app.route_post('/api/learning-settings/assist',data)
        self.assertEqual(result['groups']['course'],['ADS102']);self.assertEqual(result['groups']['weeks'],list(map(str,range(1,17))));self.assertEqual(result['note_types'],[]);self.assertFalse(app.VAULT.exists())
    def test_ai_invalid_evidence_or_attachments_cannot_modify_configuration(self):
        with patch.object(app,'ask',return_value={'weeks':[{'value':2,'evidence':'周二','source':['bad']}],'reply':'无法确定教学周。'}):result=app.settings_store().assist({'request':'周二上课'})
        self.assertEqual(result['groups']['weeks'],[])
        for data in [{},{'request':'x','attachments':[{'filename':'x.exe','file':''}]}]:
            with self.assertRaises(app.Problem):app.settings_store().assist(data)
        self.assertFalse(app.VAULT.exists())

    def test_targeted_ai_addition_instructs_the_model_and_returns_only_the_requested_field(self):
        text='课程 ADS102，课程类型 Studio'
        answer={'course':[{'value':'ADS102','source':'输入','evidence':'课程 ADS102'}],'class_type':[{'value':'Studio','source':'输入','evidence':'课程类型 Studio'}],'weeks':[],'note_kind':[],'reply':'已识别。'}
        with patch.object(app,'ask',return_value=answer) as model:result=app.settings_store().assist({'request':text,'target':'class_type'})
        self.assertEqual(result['groups'],{'course':[],'class_type':['Studio'],'weeks':[]})
        self.assertIn('本次正在添加「课程类型」',model.call_args.args[0][0]['content'])
        self.assertFalse(app.VAULT.exists())
        with self.assertRaises(app.Problem):app.settings_store().assist({'request':text,'target':'unknown'})
