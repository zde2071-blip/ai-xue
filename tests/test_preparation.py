import base64
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import server as app
from preparation import Preparation
from academic_import import assessment_rows
from calendar_store import Calendar

class PreparationTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.patcher=patch.object(app,'VAULT',Path(self.temp.name)/'vault');self.patcher.start();self.store=Preparation(app.__dict__)
    def tearDown(self):self.patcher.stop();self.temp.cleanup()
    def test_undated_exam_and_range_survive_without_fabricated_calendar_day(self):
        rows=assessment_rows([{'course':'ADS 102 离散数学','title':'Final','timing':'Final exam weeks','date':'2026-12-28','date_end':'2027-01-10'},{'course':'ISA104','title':'Written test','timing':'Week 10 Tuesday','duration':'90 minutes','question_types':'Short answers'}])
        result=self.store.save_exams({'etag':self.store.view()['calendar_etag'],'assessments':rows})
        self.assertEqual(len(result['exams']),2);self.assertEqual(result['exams'][0]['course'],'ADS102');self.assertEqual(Calendar(app.__dict__).document()['events'],[])
    def test_originals_are_preserved_and_edit_only_changes_selected_exam(self):
        original={'filename':'notice.txt','file':base64.b64encode(b'ISA104 Week 10 Tuesday').decode()}
        data=self.store.save_exams({'etag':self.store.view()['calendar_etag'],'attachments':[original],'assessments':[{'course':'ISA104','title':'Written exam','date':'2026-11-17'},{'course':'ADS102','title':'Class test','date':'2026-12-11'}]})
        first=data['exams'][0];old=Calendar(app.__dict__).path.read_bytes()
        with self.assertRaises(app.Problem):self.store.save_exams({'etag':'stale','source_id':first['source_id'],'assessments':[{**first,'location':'Wrong'}]})
        self.assertEqual(old,Calendar(app.__dict__).path.read_bytes())
        changed=self.store.save_exams({'etag':data['calendar_etag'],'source_id':first['source_id'],'assessments':[{**first,'location':'Room A'}]})
        self.assertEqual(len(changed['exams']),2);self.assertEqual(changed['exams'][1]['date'],'2026-12-11')
        ref=first['originals'][0];path,name=app.academic_import.Importer(app.__dict__).file(ref['id']);self.assertEqual(path.read_bytes(),b'ISA104 Week 10 Tuesday')
    def test_papers_and_note_scope_are_separate_and_reject_cross_course_notes(self):
        data=self.store.save_materials({'etag':self.store.document()['etag'],'course':'ISA 104','action':'papers','paper_kind':'past','attachments':[{'filename':'paper.txt','file':base64.b64encode(b'Exam paper').decode()}]})
        self.assertEqual(data['courses']['ISA104']['notes'],[]);ref=data['courses']['ISA104']['papers'][0];self.assertEqual(self.store.file(ref['id'])[0].read_bytes(),b'Exam paper')
        notes=[{'id':'n7','kind':'notes','available':True,'tags':{'course':'ISA104'}},{'id':'n10','kind':'notes','available':True,'tags':{'course':'ADS102'}}]
        with patch.object(app,'library_items',return_value=notes),patch.object(app,'state',return_value={'courses':[]}):
            with self.assertRaises(app.Problem):self.store.save_materials({'etag':data['etag'],'course':'ISA104','action':'notes','notes':['n10']})
            saved=self.store.save_materials({'etag':data['etag'],'course':'ISA104','action':'notes','notes':['n7']})
        self.assertEqual(saved['courses']['ISA104']['notes'],['n7']);self.assertEqual(len(saved['courses']['ISA104']['papers']),1)
    def test_multi_file_handbook_and_notice_import_preserves_missing_fields(self):
        files=[{'filename':f'notice-{i}.txt','file':base64.b64encode(text.encode()).decode()} for i,text in enumerate(['ISA104 Written exam Week 10 Tuesday','ADS102 Final examination 50% Exam weeks'])]
        rows=[{'course':'ISA104','title':'Written exam','timing':'Week 10 Tuesday','source':'材料1','evidence':'ISA104 Written exam Week 10 Tuesday'},{'course':'ADS102','title':'Final examination','weight':'50%','source':'材料2','evidence':'ADS102 Final examination 50% Exam weeks'}]
        with patch.object(app,'ask',return_value={'rows':rows}):result=app.academic_import.Importer(app.__dict__).recognize({'kind':'exam','attachments':files})
        self.assertEqual(len(result['references']),2);self.assertEqual(len(result['assessments']),2);self.assertEqual(result['rows'],[]);self.assertEqual(result['assessments'][0]['location'],'');self.assertFalse(self.store.path.exists())

    def test_reimport_same_original_updates_only_that_source(self):
        file={'filename':'notice.txt','file':base64.b64encode(b'ADS102 test').decode()}
        first=self.store.save_exams({'etag':self.store.view()['calendar_etag'],'attachments':[file],'assessments':[{'course':'ADS102','title':'Test','date':'2026-11-20'}]})
        second=self.store.save_exams({'etag':first['calendar_etag'],'attachments':[file],'assessments':[{'course':'ADS 102','title':'Corrected test','date':'2026-11-21'}]})
        self.assertEqual(len(second['exams']),1)
        self.assertEqual(second['exams'][0]['source_id'],first['exams'][0]['source_id'])
        self.assertEqual(Calendar(app.__dict__).document()['events'][0]['date'],'2026-11-21')
