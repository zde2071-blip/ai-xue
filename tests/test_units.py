import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import server as app
import learning_units as units

class CoreUnits(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.saved=(app.VAULT,app.CONFIG,app.KEY,app.VERIFIED)
  app.VAULT=Path(self.tmp.name)/'vault';app.CONFIG=Path(self.tmp.name)/'provider.json';app.KEY='';app.VERIFIED=False
  self.c=app.seed_demo()
 def tearDown(self):app.VAULT,app.CONFIG,app.KEY,app.VERIFIED=self.saved;self.tmp.cleanup()
 def post(self,action,**data):
  value=app.route_post('/api/courses/'+self.c['id']+'/'+action,data);self.c=app.get_course(self.c['id']);return value
 def test_unit_is_one_source_with_notes_and_annotations(self):
  self.post('lesson',block_id=self.c['active']);self.post('chat',block_id=self.c['active'],question='为什么？');self.post('finish')
  unit=app.unit_store().item(self.c,True);self.assertEqual(len(unit['materials']),1);self.assertEqual(len(unit['notes']),1);self.assertEqual(len(unit['annotations']),1);self.assertTrue(unit['latest_note']['content']);self.assertEqual(len(app.unit_store().index()['items']),1)
 def test_tags_are_attributes_and_never_move_source_or_notes(self):
  self.post('lesson',block_id=self.c['active']);note=self.post('finish')['note'];before={str(p):p.read_bytes() for p in app.folder(self.c['id']).rglob('*') if p.is_file() and p.name!='course.json'}
  result=app.unit_store().update_tags(self.c,{'tags':{'course':'ADS102','weeks':'3-4','class_type':'Lecture','custom':['考前重点']}})
  self.assertEqual(result['unit']['tags']['weeks'],[3,4]);self.assertIn('ADS102',result['catalog']['groups']['course']);self.assertEqual(app.get_note(self.c['id'],note['id'])['tags']['course'],'ADS102')
  for path,content in before.items():self.assertEqual(Path(path).read_bytes(),content)
 def test_tags_conflict_does_not_overwrite_external_update(self):
  stale=app.unit_store().item(self.c)['tags_etag'];app.unit_store().update_tags(self.c,{'tags':{'course':'new'}});latest=app.get_course(self.c['id'])
  with self.assertRaises(app.Problem):app.unit_store().update_tags(latest,{'etag':stale,'tags':{'course':'stale'}})
  self.assertEqual(app.unit_store().tags(app.get_course(self.c['id']))['course'],'new')
 def test_bad_tag_catalog_is_not_replaced(self):
  path=app.VAULT/'标签库.json';app.write_json(path,{'broken':[]});before=path.read_bytes()
  with self.assertRaises(app.Problem):app.unit_store().update_tags(self.c,{'tags':{'course':'x'}})
  self.assertEqual(path.read_bytes(),before);self.assertNotIn('tags',app.get_course(self.c['id']))
 def test_learning_question_stays_on_current_block_without_advancing(self):
  first,other=self.c['blocks'][:2];self.post('lesson',block_id=first['id']);result=self.post('chat',block_id=first['id'],question='关于'+other['points'][0]+'，为什么需要这个条件？',channel='learning',auto_anchor=True)
  self.assertEqual(result['block_id'],first['id']);self.assertEqual(result['anchor_status'],'located');self.assertEqual(self.c['active'],first['id']);self.assertEqual(self.c['completed'],[]);self.assertFalse((app.folder(self.c['id'])/'讲解'/(other['id']+'.md')).exists())
 def test_continue_typed_in_chat_never_marks_or_advances(self):
  first=self.c['active'];other=self.c['blocks'][1]['id']
  result=self.post('chat',block_id=other,question='继续',channel='learning',auto_anchor=True)
  self.assertEqual(result['block_id'],first);self.assertEqual(self.c['active'],first);self.assertEqual(self.c['completed'],[]);self.assertEqual(self.c['status'],'planning')
 def test_unknown_question_stays_unlocated_instead_of_fake_precise_anchor(self):
  thread=self.post('chat',block_id=self.c['active'],question='我感觉这门课有点难',auto_anchor=True)
  self.assertEqual(thread['anchor_status'],'unlocated');self.assertEqual(self.c['status'],'planning');self.assertEqual(self.c['session_blocks'],[])
 def test_semantic_anchor_accepts_only_existing_id_and_high_confidence(self):
  bid=self.c['blocks'][1]['id'];data={'question':'一个隐含的提问','block_id':self.c['active']}
  with patch.object(app,'active_ai',return_value={'key':'stub'}),patch.object(app,'ask',return_value={'block_id':bid,'confidence':.95}):self.assertEqual(app.unit_store().locate(self.c,data)['block_id'],bid)
  for candidate in [{'block_id':'made-up','confidence':1},{'block_id':bid,'confidence':.1},{'block_id':bid,'confidence':True}]:
   with patch.object(app,'active_ai',return_value={'key':'stub'}),patch.object(app,'ask',return_value=candidate):self.assertEqual(app.unit_store().locate(self.c,data)['status'],'unlocated')
 def test_review_question_is_immediately_attached_without_selection(self):
  first=self.c['active'];self.post('lesson',block_id=first);note=self.post('finish')['note'];block=app.get_block(self.c,first)
  thread=self.post('chat',question='关于'+block['points'][0]+'，再举一个例子',note_id=note['id'],auto_anchor=True)
  self.assertEqual(thread['anchor_status'],'located');fresh=app.get_note(self.c['id'],note['id']);self.assertIn(thread['id'],[t['id'] for t in fresh['discussions']]);self.assertEqual(fresh['content'],note['content'])
 def test_manual_reanchor_persists_and_preserves_main_note(self):
  first=self.c['active'];self.post('lesson',block_id=first);thread=self.post('chat',question='没明白',block_id=first,channel='learning',auto_anchor=True);note=self.post('finish')['note'];other=self.c['blocks'][1]['id']
  changed=app.route_post('/api/units/'+self.c['id']+'/annotations/'+thread['id']+'/move',{'block_id':other})
  self.assertEqual(changed['anchor_method'],'manual');self.assertEqual(changed['block_id'],other);self.assertEqual(app.conversation(self.c)[-1]['block_id'],other);self.assertEqual(app.get_note(self.c['id'],note['id'])['content'],note['content'])
 def test_tutorial_output_retains_question_analysis_and_answer(self):
  self.c=app.seed_unit_demo('solutions');first=self.c['active'];self.post('lesson',block_id=first);note=self.post('finish')['note']
  for expected in ['题目','解析','答案','0.12/0.3=0.4']:self.assertIn(expected,note['content'])
  self.assertEqual(note['note_kind'],'solutions');self.assertEqual(note['tags']['class_type'],'Tutorial')
 def test_tutorial_direct_question_resolves_chinese_question_number(self):
  self.c=app.seed_unit_demo('solutions');thread=self.post('chat',question='第二题为什么这样算？',auto_anchor=True)
  self.assertEqual(thread['block_id'],self.c['blocks'][1]['id']);self.assertEqual(self.c['status'],'planning')
 def test_real_tutorial_prompts_request_solutions(self):
  response={'title':'条件概率习题','overview':'两题','blocks':[{'title':'第1题','description':'题干','points':['条件概率']}]}
  with patch.object(app,'ask',return_value=response) as model:
   c=app.import_course({'filename':'Week 3 Tutorial.md','text':'已知 P(B)=0.3，P(A∩B)=0.12，求条件概率 P(A|B)。'*3})
   self.assertEqual(c['learning_kind'],'solutions');self.assertIn('题目块',model.call_args.args[0][0]['content'])
  with patch.object(app,'ask',return_value='### 题目\nP(A|B)\n### 解析\n0.12/0.3\n### 答案\n0.4') as model:
   app.get_lesson(c,c['active']);self.assertIn('题干',model.call_args.args[0][0]['content'])
 def test_starting_existing_asset_is_idempotent_and_preserves_original(self):
  asset=app.upload_material({'filename':'Tutorial.md','kind':'exercises','text':'已知 P(B)=0.3，P(A∩B)=0.12，求 P(A|B)。'*3})['item'];original=Path(asset['path']).read_bytes()
  outline={'title':'条件概率','overview':'一题','blocks':[{'title':'第1题','description':'题干','points':['条件概率']}]}
  with patch.object(app,'ask',return_value=outline):
   first=app.unit_store().from_material({'material_id':asset['id']});second=app.unit_store().from_material({'material_id':asset['id']})
  self.assertEqual(first['id'],second['id']);self.assertEqual(first['learning_kind'],'solutions');self.assertEqual(Path(asset['path']).read_bytes(),original)
 def test_normalized_tags_and_question_anchors(self):
  tags=units.clean_tags({'course':' A ','weeks':'3–5','custom':'重点，考试,重点'},app.material_metadata.normalize_fields);self.assertEqual(tags['custom'],['重点','考试']);self.assertEqual(tags['weeks'],[3,4,5])
  blocks=[{'id':'a','title':'第 1 题 · 条件概率','points':['条件概率']},{'id':'b','title':'第 2 题 · 判断独立性','points':['判断独立性']}]
  self.assertEqual(units.lexical_anchor(blocks,'关于独立性，我还有问题')['block_id'],'b')
