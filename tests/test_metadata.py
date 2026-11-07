import tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import server as app
import material_metadata as meta
class Metadata(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.saved=app.VAULT;app.VAULT=Path(self.tmp.name)/'vault';self.c=app.seed_demo()
 def tearDown(self):app.VAULT=self.saved;self.tmp.cleanup()
 def test_explicit_week_and_lecture_without_calendar_guess(self):
  f=meta.rules('ADS102 Week 3 Lecture.pdf','')['fields'];self.assertEqual(f['week'],3);self.assertEqual(f['class_type'],'Lecture');self.assertNotIn('week',meta.rules('Tutorial 2.pdf','星期三 15:00')['fields'])
 def test_range_validation_and_unknown(self):
  self.assertEqual(meta.normalize_fields({'week':'3–5'})['weeks'],[3,4,5])
  for raw in ['0','61','4-2',True]:
   with self.assertRaises(ValueError):meta.normalize_fields({'week':raw})
  self.assertEqual(meta.normalize_fields({'week':''})['weeks'],[])
 def test_filename_wins_and_conflict_is_reported(self):
  r=meta.rules('Week 3 Lecture.md','# Chapter 2\nWeek 4\nTutorial');self.assertEqual(r['fields']['week'],3);self.assertIn('week',r['conflicts']);self.assertEqual(r['fields']['chapter'],'Chapter 2')
 def test_upload_keeps_evidence_and_source(self):
  r=app.upload_material({'kind':'originals','filename':'Week 3 Lecture.md','text':'# 条件概率\n例题','course_id':self.c['id']})['item'];self.assertEqual(r['week'],3);self.assertEqual(r['class_type'],'Lecture');self.assertEqual(r['topic'],'条件概率');self.assertEqual(r['metadata_sources']['weeks']['source'],'文件名');original=Path(r['path']).read_bytes()
  app.update_material_metadata({'id':r['id'],'week':'4,5','chapter':'第二章'});r=app.find_library_item(r['id']);self.assertEqual(r['weeks'],[4,5]);self.assertEqual(r['class_type'],'Lecture');self.assertEqual(Path(r['path']).read_bytes(),original)
 def test_note_inherits_until_manual_override(self):
  app.route_post('/api/courses/'+self.c['id']+'/lesson',{'block_id':self.c['active']});app.route_post('/api/courses/'+self.c['id']+'/finish',{})
  app.update_material_metadata({'id':'source-'+self.c['id'],'week':'3-4','chapter':'第二章'});n=next(r for r in app.library_items() if r.get('note_id'));self.assertEqual(n['weeks'],[3,4]);self.assertEqual(n['source_id'],'source-'+self.c['id'])
  app.update_material_metadata({'id':n['id'],'week':''});app.update_material_metadata({'id':'source-'+self.c['id'],'week':'5'});self.assertEqual(app.find_library_item(n['id'])['weeks'],[])
 def test_academic_metadata_persists(self):
  r=app.route_post('/api/context/academic',{'course_id':self.c['id'],'academic_stage':'university','academic_year':2,'academic_semester':1});self.assertEqual(app.get_course(self.c['id'])['academic'],r['academic'])
 def test_background_reused_without_date_guess(self):
  r=app.upload_background({'filename':'课程表.md','text':'# 课程表\nADS102 离散数学与统计\n星期一 09:00','kind':'originals','academic_stage':'university','academic_year':2,'academic_semester':1,'use_ai':False});self.assertEqual(r['context']['references'][0]['courses'][0]['code'],'ADS102')
  r=app.recognize_material({'filename':'ADS102 Tutorial 2.md','text':'数列练习','use_ai':False,'academic_stage':'university','academic_year':2,'academic_semester':1});self.assertEqual(r['course_title'],'离散数学与统计');self.assertNotIn('week',r['fields'])
 def test_learning_import_suggests_course_from_current_calendar_subscription(self):
  calendar={'sources':[{'id':'school','kind':'timetable'}],'events':[{'title':'ISA104','kind':'event','source_id':'school'}]}
  with patch.object(app.calendar_store.Calendar,'document',return_value=calendar):
   result=app.recognize_material({'filename':'ISA104 Week 8 Lecture.md','text':'课堂材料','use_ai':False,'learning_import':True})
  self.assertEqual(result['course_title'],'ISA104')
  self.assertEqual(result['fields']['weeks'],[8])

 def test_manual_overrides_recognition(self):
  r=app.upload_material({'kind':'originals','filename':'Week 3 Lecture.md','text':'# 条件概率','week':'6','class_type':'Tutorial','recognition':meta.rules('Week 3 Lecture.md','')})['item'];self.assertEqual(r['week'],6);self.assertEqual(r['metadata_sources']['weeks']['source'],'用户确认')
 def test_ai_requires_document_evidence(self):
  ai={'fields':{'week':9,'class_type':'Lecture','topic':'不存在的主题'},'evidence':{'week':'伪造引文','class_type':'伪造引文','topic':'伪造引文'}}
  with patch.object(app,'active_ai',return_value={'connected':True}),patch.object(app,'ask',return_value=ai):r=app.recognize_material({'filename':'x.md','text':'原文没有周次。'})
  self.assertNotIn('week',r['fields']);self.assertNotIn('topic',r['fields'])
 def test_bad_context_is_not_overwritten(self):
  app.write_json(app.VAULT/'学期背景.json',{'bad':[]});before=(app.VAULT/'学期背景.json').read_bytes()
  with self.assertRaises(app.Problem):app.background_context()
  self.assertEqual((app.VAULT/'学期背景.json').read_bytes(),before)
 def test_generated_source_cannot_be_reparented(self):
  other=app.seed_demo(force=True)
  with self.assertRaises(app.Problem):app.update_material_metadata({'id':'source-'+self.c['id'],'course_id':other['id']})
 def test_partial_updates_preserve_fields(self):
  r=app.upload_material({'kind':'originals','filename':'a.md','text':'# 资料','week':2,'topic':'概念'})['item'];app.update_material_metadata({'id':r['id'],'topic':'新概念'});r=app.find_library_item(r['id']);self.assertEqual(r['week'],2);self.assertEqual(r['topic'],'新概念')
 def test_ai_cannot_turn_time_into_week(self):
  ai={'fields':{'week':3},'evidence':{'week':'星期三 15:00'}}
  with patch.object(app,'active_ai',return_value={'connected':True}),patch.object(app,'ask',return_value=ai):r=app.recognize_material({'filename':'x.md','text':'星期三 15:00'})
  self.assertNotIn('week',r['fields'])
 def test_background_plan_is_course_scoped(self):
  second=app.seed_demo(force=True)
  ref={'resource_id':'ref','filename':'教学大纲.md','role':'syllabus','course_id':self.c['id'],'academic':None,'courses':[],'teaching_plan':[{'week':5,'topic':'条件概率专题'}]}
  app.write_json(app.VAULT/'学期背景.json',{'references':[ref]})
  a=app.recognize_material({'filename':'条件概率专题.md','text':'# 条件概率专题','course_id':second['id'],'use_ai':False})
  b=app.recognize_material({'filename':'条件概率专题.md','text':'# 条件概率专题','course_id':self.c['id'],'use_ai':False})
  self.assertNotIn('week',a['fields']);self.assertEqual(b['fields']['week'],5)

 def test_underscored_filename(self):
  fields=meta.rules('ADS102_Week_3_Lecture.pdf','')['fields'];self.assertEqual(fields['weeks'],[3]);self.assertEqual(fields['class_type'],'Lecture')
 def test_background_fills_unknown_but_preserves_manual_clear(self):
  unknown=app.upload_material({'kind':'originals','filename':'条件概率专题.md','text':'# 条件概率专题','course_id':self.c['id']})['item']
  cleared=app.upload_material({'kind':'originals','filename':'条件概率专题习题.md','text':'# 条件概率专题','course_id':self.c['id']})['item']
  app.update_material_metadata({'id':cleared['id'],'week':''})
  recognized={'role':'syllabus','fields':{},'sources':{},'courses':[],'teaching_plan':[{'week':5,'topic':'条件概率专题'}]}
  with patch.object(app,'recognize_material',return_value=recognized):app.upload_background({'filename':'教学大纲.md','text':'Week 5 条件概率专题','course_id':self.c['id']})
  self.assertEqual(app.find_library_item(unknown['id'])['weeks'],[5]);self.assertEqual(app.find_library_item(cleared['id'])['weeks'],[])
