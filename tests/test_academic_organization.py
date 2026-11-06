import tempfile
import unittest
from pathlib import Path
import server as app
class AcademicOrganizationTest(unittest.TestCase):
    def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.old=app.VAULT;app.VAULT=Path(self.tmp.name)/'vault'
    def tearDown(self):app.VAULT=self.old;self.tmp.cleanup()
    def save(self,**changes):return app.academic_store().save({**app.academic_store().document(),**changes})
    def term(self,year=2,semester=1,name='大二上'):return {'stage':'university','year':year,'semester':semester,'name':name}
    def test_defaults_infer_only_unambiguous_course_placement_without_writing(self):
        a=self.term();courses=[{'tags':{'course':'数学'},'academic':a},{'tags':{'course':'数学'},'academic':self.term(1)},{'tags':{'course':'编程'},'academic':a}]
        doc=app.academic_store().document(courses);self.assertNotIn('数学',doc['assignments']);self.assertEqual(doc['assignments']['编程'],'university|2|1');self.assertFalse(app.VAULT.exists())
    def test_name_and_shared_course_assignment_persist_without_rewriting_sources(self):
        source=app.VAULT/'原始材料'/'test.md';source.parent.mkdir(parents=True);source.write_text('untouched')
        doc=self.save(terms=[self.term()],assignments={'数学':'university|2|1'})
        self.assertEqual(doc['terms'][0]['name'],'大二上');self.assertEqual(app.academic_store().document(),doc);self.assertEqual(source.read_text(),'untouched')
        self.assertIsNone(self.save(assignments={'数学':None})['assignments']['数学'])
    def test_stale_save_and_invalid_references_cannot_overwrite(self):
        old=app.academic_store().document();self.save(terms=[self.term()],assignments={});before=app.academic_store().path.read_bytes()
        with self.assertRaises(app.Problem) as error:app.academic_store().save({**old,'terms':[self.term(1)]})
        self.assertEqual(error.exception.status,409)
        for change in [{'assignments':{'数学':'nonexistent'}},{'terms':[self.term(),self.term()]},{'terms':[self.term(True)]}]:
            with self.assertRaises(app.Problem):self.save(**change)
        self.assertEqual(app.academic_store().path.read_bytes(),before)
    def test_account_vaults_are_isolated_and_corruption_is_preserved(self):
        self.save(terms=[self.term()],assignments={});original=app.VAULT;app.VAULT=Path(self.tmp.name)/'other';self.assertEqual(app.academic_store().document()['terms'],[])
        app.VAULT=original;app.academic_store().path.write_text('{broken')
        with self.assertRaises(app.Problem):app.academic_store().document()
        self.assertEqual(app.academic_store().path.read_text(),'{broken')

    def test_first_save_checks_external_changes_to_inferred_placement(self):
        import json
        path=app.VAULT/'课程'/'sample'/'course.json';path.parent.mkdir(parents=True)
        path.write_text(json.dumps({'tags':{'course':'数学'},'academic':self.term()}))
        old=app.academic_store().document()
        path.write_text(json.dumps({'tags':{'course':'数学'},'academic':self.term(3)}))
        with self.assertRaises(app.Problem) as error:app.academic_store().save(old)
        self.assertEqual(error.exception.status,409);self.assertFalse(app.academic_store().path.exists())

    def test_positive_numeric_years_and_semesters_are_not_fixed_to_preset_options(self):
        term=self.term(9,4)
        doc=self.save(terms=[term],assignments={'数学':'university|9|4'})
        self.assertEqual(doc['terms'][0]['year'],9)
        self.assertEqual(doc['terms'][0]['semester'],4)
        self.assertEqual(app.academic_store().document()['assignments']['数学'],'university|9|4')
        self.assertEqual(app.academic_from_data({'academic_stage':'university','academic_year':'9','academic_semester':'4'}),{'stage':'university','year':9,'semester':4})

    def test_numeric_input_rejects_nonpositive_fractional_and_boolean_positions(self):
        for field in ('year','semester'):
            for value in (0,-1,1.5,True,'1.5','',None,9007199254740992):
                data={'academic_stage':'university','academic_year':'2','academic_semester':'1','academic_'+field:value}
                with self.subTest(field=field,value=value),self.assertRaises(app.Problem):app.academic_from_data(data)

    def test_deleting_semester_releases_courses_and_preserves_course_and_material_files(self):
        import json
        course=app.VAULT/'课程'/'course-a'/'course.json';course.parent.mkdir(parents=True)
        course.write_text(json.dumps({'academic':self.term(),'tags':{'course':'数学'}}))
        note=course.parent/'学习笔记.md';note.write_text('保留笔记正文')
        source=app.VAULT/'原始材料'/'课件.pdf';source.parent.mkdir(parents=True);source.write_bytes(b'original lesson')
        before={p:p.read_bytes() for p in (course,note,source)}
        initial=self.save(terms=[self.term()],assignments={'数学':'university|2|1'})
        removed=app.academic_store().save({'terms':[],'assignments':{'数学':None},'etag':initial['etag']})
        self.assertEqual(removed['terms'],[]);self.assertIsNone(removed['assignments']['数学'])
        self.assertEqual(removed['removed_terms'],['university|2|1'])
        kept=app.academic_store().save({'terms':[],'assignments':{'数学':None},'etag':removed['etag']})
        self.assertEqual(kept['removed_terms'],['university|2|1'])
        for p,body in before.items():self.assertEqual(p.read_bytes(),body)
        restored=self.save(terms=[self.term()],assignments={'数学':None})
        self.assertEqual(restored['removed_terms'],[]);self.assertIsNone(restored['assignments']['数学'])

    def test_invalid_removed_term_keys_cannot_replace_existing_settings(self):
        self.save(terms=[self.term()],assignments={});before=app.academic_store().path.read_bytes()
        for removed in (None,['university|0|1'],['unknown|2|1'],['university|02|1'],[{}]):
            with self.subTest(removed=removed),self.assertRaises(app.Problem):self.save(removed_terms=removed)
        self.assertEqual(app.academic_store().path.read_bytes(),before)
