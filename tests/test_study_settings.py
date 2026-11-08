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
        original=app.template_store().get('concepts')['learning_prompt']
        result=app.settings_store().save({'etag':doc['etag'],'groups':doc['groups'],'templates_etag':doc['templates_etag'],'note_types':types})
        self.assertEqual(app.template_store().get('concepts')['learning_prompt'],original);self.assertEqual(app.template_store().get('concepts')['name'],'概念学习')
        created=next(row for row in result['note_types'] if row['name']=='错题复盘');self.assertTrue(app.template_store().has(created['id']));self.assertTrue(app.template_store().get(created['id'])['notes_prompt'])
    def test_external_prompt_update_blocks_stale_type_edits_without_touching_settings(self):
        doc=app.settings_store().document();templates=app.template_store().document()
        app.template_store().save({'id':'concepts','etag':templates['etag'],'template':{**templates['templates'][0],'learning_prompt':'外部工具刚刚修改的 Prompt。'}})
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


    def configure_default(self,name,kind):
        calendar=app.calendar_store.Calendar(vars(app))
        timetable=calendar.document()
        if not any(row['class_type']==name for row in timetable['timetable']):
            row={'course':'TEST101','class_type':name,'weekday':1,'weeks':[1],'time':'09:00–10:00'}
            calendar.save({**timetable,'timetable':[*timetable['timetable'],row]})
        doc=app.settings_store().document()
        return app.settings_store().save({
            'etag':doc['etag'],'templates_etag':doc['templates_etag'],
            'timetable_etag':doc['timetable_etag'],'class_type_defaults':{name:kind}
        })

    def test_mapping_sources_are_limited_to_the_saved_timetable_and_templates(self):
        self.assertEqual(app.settings_store().document()['timetable_class_types'],[])
        calendar=app.calendar_store.Calendar(vars(app))
        row={'course':'TEST101','class_type':'Studio','weekday':1,'weeks':[1],'time':'09:00–10:00'}
        sources=[{'id':'class','name':'课表','kind':'timetable','type':'import','visible':False},
                 {'id':'exam','name':'考试','kind':'exam','type':'import'}]
        calendar.save({**calendar.document(),'sources':sources,'timetable':[
            {**row,'source_id':'class'}, {**row,'class_type':'studio','weekday':2},
            {**row,'class_type':'ExamOnly','source_id':'exam'},
            {**row,'class_type':'OldType','calendar_group':'old'}
        ]})
        doc=app.settings_store().document()
        self.assertEqual(doc['timetable_class_types'],['Studio'])
        self.assertEqual(doc['note_types'],[{k:t[k] for k in ('id','name')} for t in app.template_store().document()['templates']])
        payload={k:doc[k] for k in ('etag','templates_etag','timetable_etag')}
        for choices in ({'Tutorial':'solutions'},{'Studio':'missing-template'},{'Studio':''}):
            with self.assertRaises(app.Problem):
                app.settings_store().save({**payload,'groups':doc['groups'],'class_type_defaults':choices})
        calendar.save({**calendar.document(),'timetable':[]})
        with self.assertRaises(app.Problem) as error:
            app.settings_store().save({**payload,'class_type_defaults':{'Studio':'solutions'}})
        self.assertEqual(error.exception.status,409)
        self.assertFalse(app.settings_store().path.exists())

    def test_course_type_defaults_are_readonly_validated_and_account_scoped(self):
        doc=app.settings_store().document();self.assertEqual(doc['class_type_defaults']['Tutorial'],'solutions');self.assertFalse(app.VAULT.exists())
        templates=app.template_store().document()
        custom=app.template_store().save({'etag':templates['etag'],'template':{'name':'实验记录','prompt':'整理实验步骤与观察。'}})['saved_id']
        self.configure_default('Studio',custom)
        self.assertEqual(app.settings_store().default_note_kind(' studio '),custom)
        doc=app.settings_store().document();before=app.settings_store().path.read_bytes()
        with self.assertRaises(app.Problem):app.settings_store().save({'etag':doc['etag'],'groups':doc['groups'],'class_type_defaults':{'Studio':'missing-template'}})
        self.assertEqual(app.settings_store().path.read_bytes(),before)
        app.VAULT=Path(self.tmp.name)/'two';self.assertEqual(app.settings_store().default_note_kind('Studio'),'concepts');self.assertFalse(app.VAULT.exists())

    def test_import_uses_default_prompt_and_manual_selection_wins(self):
        self.configure_default('Studio','solutions')
        outline={'title':'练习','overview':'总览','blocks':[{'title':'第一题','description':'求解','points':['方法']}]}
        data={'filename':'Studio.md','text':'这是一份课程学习材料，介绍集合与关系的基本定义，并通过问题练习解释如何判断集合之间的关系。','tags':{'class_type':'Studio'}}
        with patch.object(app,'ask',return_value=outline) as model:c=app.import_course(data)
        self.assertEqual(c['learning_kind'],'solutions');self.assertIn('保留原题号',model.call_args.args[0][0]['content'])
        before=(app.folder(c['id'])/'course.json').read_bytes()
        self.configure_default('Studio','concepts');self.assertEqual((app.folder(c['id'])/'course.json').read_bytes(),before)
        self.configure_default('Studio','solutions')
        with patch.object(app,'ask',return_value=outline):manual=app.import_course({**data,'learning_kind':'concepts'})
        self.assertEqual(manual['learning_kind'],'concepts')

    def test_timetable_type_rule_drives_all_learning_stages(self):
        calendar=app.calendar_store.Calendar(vars(app))
        calendar.save({**calendar.document(),
            'sources':[{'id':'course-source','name':'本学期课表','kind':'timetable','type':'import'}],
            'timetable':[{'course':'TEST101','class_type':'Studio','weekday':1,
                          'weeks':[1],'time':'09:00–10:00','source_id':'course-source'}]})
        self.save()
        template=app.template_store().document()
        prompt='讲解按实验步骤展开，笔记按观察和结论整理。'
        custom=app.template_store().save({'etag':template['etag'],'template':{'name':'实验记录','prompt':prompt}})['saved_id']
        doc=app.settings_store().document()
        self.assertIn('Studio',doc['class_type_defaults'])
        self.assertNotIn('Studio',doc['groups']['class_type'])
        payload={'etag':doc['etag'],'templates_etag':doc['templates_etag'],'class_type_defaults':{'Studio':custom}}
        saved=app.route_post('/api/learning-settings',payload)
        self.assertEqual(saved['groups'],doc['groups'])
        self.assertEqual(app.settings_store().document()['class_type_defaults']['Studio'],custom)
        with self.assertRaises(app.Problem):app.route_post('/api/learning-settings',payload)

        data={'filename':'TEST101.md','text':'实验材料包括测量方法、记录步骤和数据比较，要求根据实验观察解释误差的来源。','tags':{'course':'TEST101','class_type':'Studio'},'learning_import':True}
        outline={'title':'实验','overview':'总览','blocks':[{'title':'测量','description':'记录测量','points':['误差']}]}
        with patch.object(app,'ask',return_value=outline) as model:
            course=app.import_course(data)
            self.assertIn(prompt,model.call_args.args[0][0]['content'])
        self.assertEqual(course['learning_kind'],custom)
        block=course['blocks'][0]['id']
        with patch.object(app,'ask',return_value='实验讲解。') as model:
            app.get_lesson(course,block)
            self.assertIn(prompt,model.call_args.args[0][0]['content'])
        result={'blocks':[{'id':block,'summary':'观察与结论。'}],'annotations':[]}
        with patch.object(app,'ask',return_value=result) as model:
            app.finish(course,{})
            self.assertIn(prompt,model.call_args.args[0][0]['content'])

    def test_starting_existing_material_uses_rule_without_losing_explicit_override(self):
        self.configure_default('Studio','solutions')
        data={'kind':'originals','filename':'Studio.md','text':'课程材料包含集合、交集与并集的定义及完整例子，用来说明最基本的集合运算和它们的区别。','class_type':'Studio'}
        item=app.upload_material(data)['item']
        outline={'title':'集合','overview':'总览','blocks':[{'title':'定义','description':'理解','points':['集合']}]}
        with patch.object(app,'ask',return_value=outline):c=app.unit_store().from_material({'material_id':item['id']})
        self.assertEqual(c['learning_kind'],'solutions')
        item=app.upload_material({**data,'filename':'Studio2.md'})['item'];details=app.details_store().get(item['id'])
        app.details_store().save(item['id'],{'etag':details['etag'],'note_kind':'concepts','confirm_fields':['note_kind']})
        with patch.object(app,'ask',return_value=outline):c=app.unit_store().from_material({'material_id':item['id']})
        self.assertEqual(c['learning_kind'],'concepts')
