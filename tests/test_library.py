import base64
import tempfile
import unittest
from pathlib import Path
import server as app

class Library(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.old=app.VAULT
        app.VAULT=Path(self.tmp.name)/'vault';self.course=app.seed_demo();app.ensure_library_folders()
    def tearDown(self):
        app.VAULT=self.old;self.tmp.cleanup()
    def test_separate_uploads_and_metadata(self):
        for kind,directory in app.LIBRARY_DIRS.items():
            data={'kind':kind,'filename':'same.pdf','file':base64.b64encode(b'%PDF bytes').decode(),'week':'2','class_type':'Tutorial'}
            a=app.upload_material(data)['item'];b=app.upload_material(data)['item']
            self.assertNotEqual(a['path'],b['path']);self.assertIn(directory,a['path']);self.assertEqual(Path(a['path']).read_bytes(),b'%PDF bytes')
            app.update_material_metadata({'id':a['id'],'week':'10','class_type':'Lab'})
            self.assertEqual(app.find_library_item(a['id'])['week'],10)
        self.assertEqual(len(app.library_items()),7)
    def test_external_discovery_and_confinement(self):
        path=app.VAULT/'未归档'/'练习题'/'题.md';path.write_text('# 题')
        self.assertTrue(any(r['filename']=='题.md' for r in app.library_items()))
        outside=Path(self.tmp.name)/'outside.md';outside.write_text('private');(path.parent/'link.md').symlink_to(outside)
        self.assertFalse(any(r['filename']=='link.md' for r in app.library_items()))
        with self.assertRaises(app.Problem):app.library_path('../outside.md')
    def test_week_validation(self):
        for value in ('0','61','2.5','abc',True):
            with self.assertRaises(app.Problem):app.classification({'week':value})
        self.assertIsNone(app.classification({})['week'])
    def test_note_inheritance_and_override(self):
        cid=self.course['id'];bid=self.course['blocks'][0]['id']
        app.route_post(f'/api/courses/{cid}/lesson',{'block_id':bid});app.route_post(f'/api/courses/{cid}/finish',{'title':'笔记'})
        app.update_material_metadata({'id':'source-'+cid,'week':'3','class_type':'Lecture'})
        note=next(r for r in app.library_items() if r['kind']=='notes');self.assertEqual(note['week'],3)
        app.update_material_metadata({'id':note['id'],'week':'','class_type':'复习'})
        self.assertIsNone(app.find_library_item(note['id'])['week'])
