import base64
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import server as app
import calendar_store

class CalendarStoreTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.old=app.VAULT;app.VAULT=Path(self.tmp.name)/'vault';self.store=calendar_store.Calendar(app.__dict__)
    def tearDown(self):app.VAULT=self.old;self.tmp.cleanup()
    def save(self,doc,**values):return self.store.save({**doc,**values})
    def test_empty_calendar_works_without_any_academic_information(self):
        doc=self.store.document();self.assertEqual(doc['calendar'],[]);self.assertFalse(app.VAULT.exists())
        saved=self.save(doc,events=[{'id':'exam','title':'考试','kind':'exam','date':'2026-11-06','start':'07:00','end':'09:00','location':''}]);self.assertEqual(saved['events'][0]['start'],'07:00');self.assertFalse(app.academic_store().path.exists())
    def test_old_academic_records_are_not_automatically_added_to_calendar(self):
        old=app.academic_store();doc=old.document();terms=[{'stage':'university','year':y,'semester':1,'calendar':[{'kind':'teaching','week':1,'start':f'{2024+y}-09-07','end':f'{2024+y}-09-13','label':''}],'timetable':[{'course':'数学'+str(y),'class_type':'Lecture','weekday':1,'time':'07:00–09:00','weeks':[1],'location':''}]} for y in [1,2]]
        old.save({**doc,'terms':terms,'assignments':{'数学1':'university|1|1','数学2':'university|2|1'}});before=old.path.read_bytes()
        migrated=self.store.document();self.assertEqual(migrated['calendar'],[]);self.assertEqual(migrated['timetable'],[]);self.assertEqual(migrated['events'],[]);self.assertFalse(self.store.path.exists())
        saved=self.save(migrated);self.assertEqual(old.path.read_bytes(),before);self.assertEqual(saved['timetable'],migrated['timetable'])
    def test_external_edits_are_detected_and_invalid_edits_cannot_write(self):
        initial=self.store.document();current=self.save(initial);before=self.store.path.read_bytes()
        with self.assertRaises(app.Problem):self.save(initial,events=[])
        with self.assertRaises(app.Problem):self.save(current,events=[{'id':'bad','title':'x','kind':'exam','date':'2026-11-06','start':'09:00','end':'07:00'}])
        self.assertEqual(before,self.store.path.read_bytes())
    def test_calendar_import_has_no_semester_requirement_and_does_not_save(self):
        row={'kind':'teaching','week':1,'start':'2026-09-07','end':'2026-09-13','label':''};answer={'rows':[{**row,'source':'输入','evidence':'Week 1 2026-09-07 2026-09-13'}]}
        with patch.object(app,'ask',return_value=answer) as ask:
            result=app.route_post('/api/calendar/import',{'kind':'calendar','text':'Week 1 2026-09-07 2026-09-13'})
        self.assertEqual(result['rows'],[row]);self.assertNotIn('selected_term',__import__('json').loads(ask.call_args.args[0][-1]['content']));self.assertFalse(app.VAULT.exists())
    def test_exam_import_preserves_clock_times_and_original_requires_confirmation(self):
        value='Math exam 2026-11-06 07:00–09:00 Room A';file={'filename':'考试.txt','file':base64.b64encode(value.encode()).decode()};row={'title':'Math exam','date':'2026-11-06','start':'07:00','end':'09:00','location':'Room A','source':'考试.txt','evidence':value}
        with patch.object(app,'ask',return_value={'rows':[row]}):result=app.route_post('/api/calendar/import',{'kind':'exam','attachments':[file]})
        self.assertEqual(result['rows'][0]['kind'],'exam');self.assertFalse(app.VAULT.exists());saved=self.save(self.store.document(),events=result['rows'],references=result['references'],reference_files=[{**file,'kind':'exam'}])
        path,name=app.academic_import.Importer(app.__dict__).file(saved['references'][0]['id']);self.assertEqual(path.read_text(),value);self.assertEqual(name,'考试.txt')
    def test_colors_round_trip_and_legacy_records_need_no_color(self):
        doc=self.store.document();event={'id':'color-test','title':'考试','kind':'exam','date':'2026-11-06','start':'07:00','end':'09:00','color':'#ABCDEF'}
        doc.update(colors={'calendar':'#808080','timetable':'#548568','exam':'#A07848'},events=[event],calendar=[{'kind':'teaching','week':8,'start':'2026-11-02','end':'2026-11-08','label':'','color':'#527EAC'}],timetable=[{'course':'Math','weekday':1,'time':'09:00–11:00','weeks':[],'color':'#8070A0'}])
        saved=self.save(doc);read=self.store.document()
        self.assertEqual(saved,read);self.assertEqual(read['colors']['exam'],'#a07848');self.assertEqual(read['events'][0]['color'],'#abcdef');self.assertEqual(read['calendar'][0]['color'],'#527eac');self.assertEqual(read['timetable'][0]['color'],'#8070a0')
        del read['events'][0]['color'];self.assertNotIn('color',self.save(read)['events'][0])
    def test_handbook_keeps_undated_assessments_and_only_adds_documented_dates(self):
        doc=self.save(self.store.document(),
            sources=[{'id':'schedule','name':'课表','kind':'timetable','type':'import'}],
            timetable=[{'course':'ADS102 · 离散数学','weekday':1,'time':'09:00–10:00','source_id':'schedule'}])
        midterm='Midterm Test 30% Teaching Week 8'
        final='Final Examination 70% 16 December 2026 09:00–11:00'
        original='Module Handbook ADS102\n'+midterm+'\n'+final
        data={'kind':'exam','handbook_course':'ADS102 · 离散数学','attachments':[{'filename':'Handbook.txt','file':base64.b64encode(original.encode()).decode()}]}
        entries=[{'name':'Midterm Test','weight':'30%','timing':'Teaching Week 8','date_text':'2026-11-02','evidence':midterm},
                 {'name':'Final Examination','weight':'70%','timing':'16 December 2026 09:00–11:00','date_text':'16 December 2026','start':'09:00','end':'11:00','evidence':final},
                 {'name':'Made up Test','weight':'20%','evidence':'Invented evidence'}]
        with patch.object(app,'ask',return_value={'entries':entries}) as model:
            for course in ('CSI101','ADS102'):
                with self.assertRaises(app.Problem):app.route_post('/api/calendar/import',{**data,'handbook_course':course})
            model.assert_not_called()
            result=app.route_post('/api/calendar/import',data)
        self.assertEqual(doc,self.store.document())
        self.assertTrue(result['incomplete'])
        self.assertEqual([row['timing'] for row in result['handbook']['entries']],['Teaching Week 8','16 December 2026 09:00–11:00'])
        self.assertEqual([(row['date'],row['start'],row['end']) for row in result['rows']],[('2026-12-16','09:00','11:00')])
        ref=result['references'][0]
        source={'id':'handbook','name':'ADS102','kind':'exam','type':'import','handbook':result['handbook'],'reference_ids':[ref['id']]}
        with self.assertRaises(app.Problem):
            self.save(doc,sources=[*doc['sources'],source],references=[ref])
        saved=self.save(doc,sources=[*doc['sources'],source],events=[{**row,'source_id':'handbook'} for row in result['rows']],
                        references=[ref],reference_files=[{**data['attachments'][0],'kind':'exam'}])
        self.assertEqual(self.store.document()['sources'][-1],{**source,'visible':True})
        importer=app.academic_import.Importer(app.__dict__)
        path,name=importer.file(ref['id'])
        self.assertEqual(path.read_bytes(),original.encode())
        self.assertEqual(name,'Handbook.txt')
        self.save(saved,sources=doc['sources'],events=[],references=[])
        self.assertEqual(importer.file(ref['id'])[0].read_bytes(),original.encode())
    def test_only_timetable_locations_are_omitted_from_the_saved_calendar(self):
        doc=self.store.document()
        source={'id':'timetable','name':'课表','kind':'timetable','type':'import'}
        dated={'id':'lesson','title':'ADS102','kind':'event','date':'2026-11-06','start':'09:00','end':'10:50','location':'A101'}
        saved=self.save(doc,sources=[source],events=[{**dated,'source_id':'timetable'},{**dated,'id':'regular'}],
                        timetable=[{'course':'ADS102','class_type':'Lecture','weekday':5,
                                    'time':'09:00–10:50','weeks':[1,3],'location':'A101'}])
        self.assertNotIn('location',saved['timetable'][0])
        self.assertNotIn('location',saved['events'][0])
        self.assertEqual(saved['events'][1]['location'],'A101')

    def test_invalid_colors_do_not_write(self):
        doc=self.save(self.store.document());before=self.store.path.read_bytes()
        for colors in [{'exam':'red;position:fixed'},{'unknown':'#ffffff'},[]]:
            with self.assertRaises(app.Problem):self.save(doc,colors=colors)
        with self.assertRaises(app.Problem):self.save(doc,events=[{'id':'bad-color','title':'考试','kind':'exam','date':'2026-11-06','color':'javascript:bad'}])
        self.assertEqual(self.store.path.read_bytes(),before)
