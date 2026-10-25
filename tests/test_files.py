import unittest,tempfile,json
from pathlib import Path
import server as app

class FileOperations(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.saved=(app.VAULT,app.CONFIG,app.KEY,app.VERIFIED);app.VAULT=Path(self.temp.name)/'vault';app.CONFIG=Path(self.temp.name)/'provider.json';app.KEY='';app.VERIFIED=False;self.c=app.seed_demo();app.get_lesson(self.c,self.c['active']);self.note=app.finish(self.c,{})['note']
 def tearDown(self):app.VAULT,app.CONFIG,app.KEY,app.VERIFIED=self.saved;self.temp.cleanup()
 def manage(self,id,action,**data):return app.route_post('/api/library/manage',{'id':id,'action':action,**data})
 def test_source_trash_preserves_notes_and_can_restore_identical_bytes(self):
  rid='source-'+self.c['id'];r=app.find_library_item(rid);raw=Path(r['path']).read_bytes();note=app.get_note(self.c['id'],self.note['id'])['content'];ticket=self.manage(rid,'trash')['trashed'];self.assertNotIn(rid,[r['id'] for r in app.library_items()]);self.assertEqual(app.get_note(self.c['id'],self.note['id'])['content'],note);self.assertEqual(len(app.file_store().listing()['items']),1)
  app.route_post('/api/trash/restore',{'id':ticket});self.assertEqual(Path(app.find_library_item(rid)['path']).read_bytes(),raw);self.assertEqual(app.file_store().listing()['items'],[])
 def test_note_trash_updates_unit_and_restore_keeps_original_metadata_and_marks(self):
  rid='note-'+self.c['id']+'-'+self.note['id'];self.c=app.get_course(self.c['id']);meta=self.c['notes'][0].copy();self.c['highlights']=[{'target':self.note['id'],'quote':'text'}];app.save_course(self.c)
  ticket=self.manage(rid,'trash')['trashed'];c=app.get_course(self.c['id']);self.assertEqual(c['notes'],[]);self.assertIsNone(app.unit_store().item(c,True)['latest_note']);self.assertTrue(app.find_library_item('source-'+self.c['id'])['available'])
  app.file_store().restore({'id':ticket});c=app.get_course(self.c['id']);self.assertEqual(c['notes'][0],meta);self.assertEqual(c['highlights'][0]['target'],self.note['id']);self.assertEqual(app.get_note(c['id'],self.note['id'])['content'],self.note['content'])
 def test_source_rename_changes_display_name_without_rewriting_original(self):
  rid='source-'+self.c['id'];before=Path(app.find_library_item(rid)['path']).read_bytes();r=self.manage(rid,'rename',name='新课件')['item'];self.assertEqual(r['title'],'新课件.md');self.assertEqual(Path(r['path']).read_bytes(),before);self.assertEqual(r['id'],rid)
 def test_note_rename_preserves_body_and_ids(self):
  rid='note-'+self.c['id']+'-'+self.note['id'];r=self.manage(rid,'rename',name='我的复习笔记')['item'];self.assertEqual(r['title'],'我的复习笔记');self.assertEqual(app.get_note(self.c['id'],self.note['id'])['content'],self.note['content']);self.assertEqual(r['note_id'],self.note['id'])
 def test_standalone_asset_rename_trash_restore_keeps_id(self):
  r=app.upload_material({'filename':'a.md','kind':'exercises','text':'题目资料'})['item'];renamed=self.manage(r['id'],'rename',name='b.md')['item'];self.assertEqual(Path(renamed['path']).name,'b.md');self.assertEqual(len([x for x in app.library_items() if x['id']==r['id']]),1);ticket=self.manage(r['id'],'trash')['trashed'];app.file_store().restore({'id':ticket});self.assertEqual(app.find_library_item(r['id'])['title'],'b.md')
 def test_external_file_gets_stable_id_after_rename(self):
  app.ensure_library_folders();path=app.VAULT/'未归档'/'原始文件'/'external.md';path.write_text('external');r=next(x for x in app.library_items() if x['path']==str(path.resolve()));renamed=self.manage(r['id'],'rename',name='renamed.md')['item'];self.assertEqual(renamed['id'],r['id']);self.assertEqual(sum(x['id']==r['id'] for x in app.library_items()),1)
 def test_restore_refuses_to_overwrite_new_file(self):
  rid='source-'+self.c['id'];path=Path(app.find_library_item(rid)['path']);ticket=self.manage(rid,'trash')['trashed'];path.write_text('new external content')
  with self.assertRaises(app.Problem):app.file_store().restore({'id':ticket})
  self.assertEqual(path.read_text(),'new external content');self.assertEqual(len(app.file_store().listing()['items']),1)
 def test_name_and_version_validation(self):
  rid='source-'+self.c['id']
  for name in ['../outside.md','a\\b.md','x\ny.md','wrong.pdf','']:
   with self.assertRaises(app.Problem):self.manage(rid,'rename',name=name)
  with self.assertRaises(app.Problem):self.manage(rid,'trash',version='stale')
  self.assertTrue(app.find_library_item(rid)['available'])
 def test_trash_persists_and_cannot_be_restored_twice(self):
  rid='source-'+self.c['id'];ticket=self.manage(rid,'trash')['trashed'];app.initialize();self.assertNotIn(rid,[r['id'] for r in app.library_items()]);app.file_store().restore({'id':ticket})
  with self.assertRaises(app.Problem):app.file_store().restore({'id':ticket})
 def test_symlink_trash_cannot_leave_vault(self):
  outside=Path(self.temp.name)/'outside';outside.mkdir();(app.VAULT/'.回收站').symlink_to(outside,target_is_directory=True)
  with self.assertRaises(app.Problem):self.manage('source-'+self.c['id'],'trash')
  self.assertEqual(list(outside.iterdir()),[])
