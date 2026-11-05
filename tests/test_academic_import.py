import base64
import copy
import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import academic_import
import server as app


class AcademicImportTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old = app.VAULT
        app.VAULT = Path(self.tmp.name) / 'vault'
        self.term = {'stage': 'university', 'year': 2, 'semester': 1}
        self.key = 'university|2|1'
        self.store = app.academic_store()
        self.doc = self.store.save({**self.store.document(), 'terms': [self.term], 'assignments': {}})

    def tearDown(self):
        app.VAULT = self.old
        self.tmp.cleanup()

    def calendar(self):
        return [{'kind': 'teaching', 'week': 1, 'start': '2026-09-07', 'end': '2026-09-13', 'label': ''},
                {'kind': 'break', 'week': None, 'start': '2026-09-14', 'end': '2026-09-20', 'label': '假期'},
                {'kind': 'teaching', 'week': 2, 'start': '2026-09-21', 'end': '2026-09-27', 'label': ''}]

    def timetable(self):
        return [{'course': 'ADS102 · 离散数学', 'class_type': 'Lecture', 'weekday': 1,
                 'time': '09:00–10:00', 'weeks': [1, 3, 5], 'location': 'A101'}]

    def attachment(self, value='原始校历内容', kind='calendar'):
        return {'filename': '校历.txt', 'file': base64.b64encode(value.encode()).decode(), 'kind': kind}

    def save(self, **fields):
        term = {**self.doc['terms'][0], **fields}
        self.doc = self.store.save({**self.doc, 'terms': [term]})
        return self.doc

    def test_calendar_date_lookup_respects_breaks_and_does_not_skip_forward(self):
        self.save(calendar=self.calendar())
        term = self.store.document()['terms'][0]
        self.assertEqual(academic_import.week_at(term, '2026-09-10'), 1)
        self.assertIsNone(academic_import.week_at(term, '2026-09-15'))
        self.assertEqual(academic_import.week_at(term, '2026-09-24'), 2)
        self.assertIsNone(academic_import.week_at(term, '2026-09-28'))

    def test_invalid_or_overlapping_dates_do_not_change_saved_data(self):
        before = self.store.path.read_bytes()
        for field, value in [('start', '2026-02-30'), ('end', '2026-09-30'), ('week', True), ('week', 0), ('kind', 'other')]:
            rows = self.calendar()
            rows[0][field] = value
            with self.subTest(field=field), self.assertRaises(app.Problem):
                self.save(calendar=rows)
        rows = self.calendar(); rows[1]['start'] = '2026-09-12'
        with self.assertRaises(app.Problem):
            self.save(calendar=rows)
        self.assertEqual(before, self.store.path.read_bytes())

    def test_timetable_preserves_periods_and_odd_weeks(self):
        rows = self.timetable(); rows[0]['time'] = '第1–2节'
        self.save(timetable=rows)
        self.assertEqual(self.store.document()['terms'][0]['timetable'], rows)
        for field, value in [('weekday', True), ('weekday', 8), ('course', ''), ('time', ''), ('weeks', [True]), ('weeks', [61])]:
            invalid = copy.deepcopy(rows); invalid[0][field] = value
            with self.subTest(field=field), self.assertRaises(app.Problem):
                self.save(timetable=invalid)

    def test_ai_proposal_requires_literal_source_evidence_and_never_writes(self):
        original = self.store.path.read_bytes()
        content = '第1周 2026-09-07 至 2026-09-13'
        answer = {'rows': [{**self.calendar()[0], 'source': '输入', 'evidence': content},
                           {**self.calendar()[2], 'source': '输入', 'evidence': '不存在的原文'}]}
        with patch.object(app, 'ask', return_value=answer):
            result = app.route_post('/api/academic-settings/import', {'kind': 'calendar', 'term_key': self.key, 'text': content})
        self.assertEqual(result['rows'], [self.calendar()[0]])
        self.assertEqual(original, self.store.path.read_bytes())
        self.assertFalse((app.VAULT / '学期参考').exists())

    def test_original_file_only_saved_on_confirmation_and_etag_prevents_overwrite(self):
        file = self.attachment()
        ref = academic_import.Importer(app.__dict__).files([file])[0]['reference']
        next_doc = {**self.doc, 'terms': [{**self.term, 'references': [ref], 'calendar': self.calendar()}], 'reference_files': [file]}
        saved = self.store.save(next_doc)
        path, name = academic_import.Importer(app.__dict__).file(ref['id'])
        self.assertEqual(name, '校历.txt')
        self.assertEqual(path.read_text(), '原始校历内容')
        self.assertNotIn('file', saved['terms'][0]['references'][0])
        self.assertNotIn(file['file'], self.store.path.read_text())
        with self.assertRaises(app.Problem) as error:
            self.store.save(next_doc)
        self.assertEqual(error.exception.status, 409)

    def test_model_source_prefix_and_filename_still_require_exact_evidence(self):
        content='第1周 2026-09-07 至 2026-09-13'
        file=self.attachment(content)
        for source in ('原件 '+hashlib.sha256(content.encode()).hexdigest(),'校历.txt'):
            answer={'rows':[{**self.calendar()[0],'source':source,'evidence':content}]}
            with patch.object(app,'ask',return_value=answer):
                result=app.route_post('/api/academic-settings/import',{'kind':'calendar','term_key':self.key,'attachments':[file]})
            self.assertEqual(result['rows'],[self.calendar()[0]])

    def test_unknown_reference_and_invalid_term_or_kind_cannot_write(self):
        before = self.store.path.read_bytes()
        forged = {'id': 'a' * 64, 'filename': '课表.txt', 'kind': 'timetable'}
        with self.assertRaises(app.Problem):
            self.save(references=[forged])
        for changes in ({'term_key': 'university|9|9'}, {'kind': 'other'}, {'attachments': [self.attachment(kind='other')]}, {'text': {}}):
            data = {'kind': 'calendar', 'term_key': self.key, 'text': '校历', **changes}
            if 'attachments' in changes:
                data['attachments'] = [{'filename': 'data.exe', 'file': ''}]
            with self.subTest(changes=changes), self.assertRaises(app.Problem):
                academic_import.Importer(app.__dict__).recognize(data)
        self.assertEqual(before, self.store.path.read_bytes())

    def test_delete_semester_keeps_original_and_other_account_cannot_read_it(self):
        file = self.attachment()
        ref = academic_import.Importer(app.__dict__).files([file])[0]['reference']
        saved = self.store.save({**self.doc, 'terms': [{**self.term, 'references': [ref]}], 'reference_files': [file]})
        path, _ = academic_import.Importer(app.__dict__).file(ref['id'])
        original_vault = app.VAULT
        app.VAULT = Path(self.tmp.name) / 'another-account'
        with self.assertRaises(app.Problem):
            academic_import.Importer(app.__dict__).file(ref['id'])
        app.VAULT = original_vault
        self.store.save({**saved, 'terms': [], 'assignments': {}})
        self.assertTrue(path.exists())

    def test_confirmed_schedule_supplies_course_and_type_choices(self):
        self.save(calendar=self.calendar(), timetable=self.timetable())
        options = app.settings_store().document()['groups']
        self.assertIn('ADS102 · 离散数学', options['course'])
        self.assertIn('Lecture', options['class_type'])

    def test_material_matches_named_course_but_upload_time_never_fills_week(self):
        self.save(calendar=self.calendar(), timetable=self.timetable())
        result = app.recognize_material({'filename': 'ADS102_集合.md', 'text': 'Sets and relations', 'use_ai': False,
                                         'academic_stage': 'university', 'academic_year': '2', 'academic_semester': '1'})
        self.assertEqual(result['course_title'], 'ADS102 · 离散数学')
        self.assertFalse(result['fields'].get('weeks'))
        self.assertFalse(result['fields'].get('week'))

    def test_calendar_survives_academic_rename_and_plain_semester_edit(self):
        doc = self.save(calendar=self.calendar(), timetable=self.timetable())
        term = {**doc['terms'][0], 'semester': 2}
        doc = self.store.save({**doc, 'terms': [term]})
        self.assertEqual(doc['terms'][0]['calendar'], self.calendar())
        self.assertEqual(doc['terms'][0]['key'], 'university|2|2')


if __name__ == '__main__':
    unittest.main()
