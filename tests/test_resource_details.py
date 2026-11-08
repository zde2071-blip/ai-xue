import copy
import base64
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import material_metadata as metadata
import server as app


class ResourceDetails(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.base=Path(self.temp.name)
        self.saved=app.VAULT,app.CONFIG,app.KEY,app.VERIFIED
        app.VAULT=self.base/'vault';app.CONFIG=self.base/'provider.json';app.KEY='';app.VERIFIED=False
        self.c=app.seed_demo();app.get_lesson(self.c,self.c['active']);self.note=app.finish(self.c,{})['note']
        self.source='source-'+self.c['id'];self.nid='note-'+self.c['id']+'-'+self.note['id']
    def tearDown(self):
        app.VAULT,app.CONFIG,app.KEY,app.VERIFIED=self.saved;self.temp.cleanup()
    def save(self,ident,**changes):
        current=app.details_store().get(ident)
        return app.route_post('/api/library/'+ident+'/details',{'etag':current['etag'],**changes})
    def upload(self,name='Week 3 Lab 1.md'):
        return app.upload_material({'kind':'originals','filename':name,'text':'# 集合\n集合的元素没有先后顺序。'})['item']
    def upload_pdf(self):
        from pypdf import PdfWriter
        writer=PdfWriter()
        for _ in range(5):writer.add_blank_page(width=100,height=100)
        raw=io.BytesIO();writer.write(raw)
        return app.upload_material({'kind':'originals','filename':'pages.pdf','file':base64.b64encode(raw.getvalue()).decode()})['item']
    def test_sessions_preserve_ordinal_and_only_explicit_pairs(self):
        rows=metadata.rules('Week 3 Lab 1.md','')['fields']['sessions']
        self.assertEqual(rows,[{'week':3,'class_type':'Lab','number':1}])
        result=metadata.rules('Tutorial 2.pdf','2026-10-25 星期三 10:00')
        self.assertNotIn('weeks',result['fields']);self.assertEqual(result['fields']['sessions'][0]['week'],None)
        result=metadata.rules('资料.pdf','Week 3 Lecture 3\nWeek 4 Lecture 4')
        self.assertEqual([(r['week'],r['number']) for r in result['fields']['sessions']],[(3,3),(4,4)])
        self.assertEqual(result['fields']['weeks'],[3,4]);self.assertNotIn('week',result['conflicts'])
        result=metadata.rules('Week 3-4 Lecture 3.pdf','')
        self.assertIsNone(result['fields']['sessions'][0]['week'])
        self.assertEqual(metadata.rules('Exercise 10 Part 2.md','')['fields']['sessions'][0]['number'],10)
    def test_conflict_and_confirmation_preserve_evidence(self):
        r=app.upload_material({'kind':'originals','filename':'Week 3 Lab 1.md','text':'Week 4 Lab 2\n# 集合'})['item']
        detail=app.details_store().get(r['id']);self.assertEqual(detail['metadata_sources']['weeks']['status'],'conflict')
        self.assertEqual(detail['metadata_sources']['sessions']['status'],'conflict')
        evidence=detail['metadata_sources']['weeks']['evidence']
        updated=self.save(r['id'],confirm_fields=['weeks'])
        self.assertEqual(updated['metadata_sources']['weeks']['status'],'confirmed')
        self.assertEqual(updated['metadata_sources']['weeks']['evidence'],evidence)
        self.assertEqual(updated['metadata_sources']['sessions']['status'],'conflict')
    def test_import_round_trips_sessions_and_unconfirmed_evidence(self):
        asset=self.upload();detail=app.details_store().get(asset['id'])
        self.assertEqual(detail['sessions'][0]['number'],1)
        result=self.save(asset['id'],tags={**detail['tags'],'chapter':'第二章'})
        self.assertEqual(result['metadata_sources']['chapter']['status'],'confirmed')
        self.assertEqual(result['metadata_sources']['weeks']['status'],'unconfirmed')
        self.assertEqual(result['metadata_sources']['sessions']['status'],'unconfirmed')
        self.assertEqual(app.find_library_item(asset['id'])['sessions'][0]['week'],3)
    def test_legacy_links_are_read_only(self):
        before={str(p):p.read_bytes() for p in app.VAULT.rglob('*') if p.is_file()}
        detail=app.details_store().get(self.nid)
        self.assertEqual(detail['relations'][0]['material_id'],self.source)
        self.assertIn(self.nid,[r['id'] for r in app.details_store().get(self.source)['related_notes']])
        self.assertEqual(before,{str(p):p.read_bytes() for p in app.VAULT.rglob('*') if p.is_file()})
    def test_many_to_many_notes_references_pages_reverse_links_and_no_copy(self):
        asset=self.upload_pdf();before=Path(asset['path']).read_bytes();note_before=self.note['content']
        result=self.save(self.nid,relations=[{'material_id':self.source,'role':'primary','pages':''},{'material_id':asset['id'],'role':'supplement','pages':'5'}])
        self.assertEqual(len(result['relations']),2)
        self.assertEqual(app.details_store().get(asset['id'])['related_notes'][0]['id'],self.nid)
        self.assertEqual(Path(asset['path']).read_bytes(),before)
        self.assertEqual(app.get_note(self.c['id'],self.note['id'])['content'],note_before)
        self.assertEqual(sum(p.read_bytes()==before for p in app.VAULT.rglob('*') if p.is_file()),1)
        self.assertNotIn(self.nid,[r['id'] for r in result['relation_candidates']])
    def test_links_survive_rename_trash_restore_with_missing_indicator(self):
        asset=self.upload();self.save(self.nid,relations=[{'material_id':asset['id'],'role':'reference','pages':''}])
        app.file_store().manage({'id':asset['id'],'action':'rename','name':'new.md'})
        self.assertEqual(app.details_store().get(self.nid)['relations'][0]['title'],'new.md')
        ticket=app.file_store().manage({'id':asset['id'],'action':'trash'})['trashed']
        missing=app.details_store().get(self.nid)['relations'][0];self.assertFalse(missing['available']);self.assertEqual(missing['material_id'],asset['id'])
        app.file_store().restore({'id':ticket})
        self.assertTrue(app.details_store().get(self.nid)['relations'][0]['available'])
        self.assertEqual(app.details_store().get(asset['id'])['related_notes'][0]['id'],self.nid)
    def test_note_override_survives_source_edit_and_content_stays_unchanged(self):
        initial=app.details_store().get(self.source)
        self.save(self.source,tags={**initial['tags'],'course':'ADS102','weeks':[3]},sessions=[{'week':3,'number':1,'class_type':'Lab'}])
        note=app.details_store().get(self.nid);self.assertEqual(note['tags']['weeks'],[3]);self.assertEqual(note['sessions'][0]['number'],1)
        self.save(self.nid,tags={**note['tags'],'weeks':[6]},sessions=[{'week':None,'number':2,'class_type':'Tutorial'}])
        self.save(self.source,tags={**app.details_store().get(self.source)['tags'],'weeks':[4]})
        note=app.details_store().get(self.nid);self.assertEqual(note['tags']['weeks'],[6]);self.assertEqual(note['sessions'][0]['number'],2)
        self.assertEqual(app.get_note(self.c['id'],self.note['id'])['tags']['weeks'],[6])
        self.assertEqual(app.find_library_item(self.nid)['tags']['weeks'],[6])
        self.assertIn('6',app.unit_store().catalog()['groups']['weeks'])
        self.assertEqual(app.get_note(self.c['id'],self.note['id'])['content'],self.note['content'])
    def test_unchanged_details_save_does_not_freeze_inherited_note_fields(self):
        detail=app.details_store().get(self.nid)
        self.save(self.nid,tags=detail['tags'],sessions=detail['sessions'],note_kind=detail['note_kind'],relations=detail['relations'])
        self.save(self.source,tags={**app.details_store().get(self.source)['tags'],'weeks':[8]})
        self.assertEqual(app.details_store().get(self.nid)['tags']['weeks'],[8])
    def test_note_confirmation_does_not_freeze_other_inherited_provenance(self):
        source=app.details_store().get(self.source)
        self.save(self.source,tags={**source['tags'],'topic':'原主题'})
        self.save(self.nid,confirm_fields=['weeks'])
        source=app.details_store().get(self.source)
        self.save(self.source,tags={**source['tags'],'topic':'新主题'})
        note=app.details_store().get(self.nid);source=app.details_store().get(self.source)
        self.assertEqual(note['tags']['topic'],'新主题')
        self.assertEqual(note['metadata_sources']['topic'],source['metadata_sources']['topic'])
        self.assertEqual(note['metadata_sources']['weeks']['status'],'confirmed')
        self.assertNotIn('topic',app.library_index()['metadata'][self.nid]['metadata_sources'])
    def test_legacy_metadata_updates_details_override_and_learning_kind_applies(self):
        detail=app.details_store().get(self.source)
        self.save(self.source,tags={**detail['tags'],'weeks':[3]},note_kind='solutions')
        self.assertEqual(app.effective_note_kind(self.c),'solutions')
        self.assertEqual(app.unit_store().item(self.c)['note_kind'],'solutions')
        app.update_material_metadata({'id':self.source,'week':4})
        self.assertEqual(app.details_store().get(self.source)['tags']['weeks'],[4])
        app.unit_store().update_tags(self.c,{'tags':{'weeks':[5]},'note_kind':'concepts'})
        self.assertEqual(app.details_store().get(self.source)['tags']['weeks'],[5])
        self.assertEqual(app.effective_note_kind(self.c),'concepts')
    def test_stale_details_and_external_note_changes_are_rejected(self):
        old=app.details_store().get(self.nid);self.save(self.nid,tags={**old['tags'],'chapter':'A'})
        with self.assertRaises(app.Problem) as error:app.details_store().save(self.nid,{'etag':old['etag'],'tags':old['tags']})
        self.assertEqual(error.exception.status,409)
        current=app.details_store().get(self.nid);Path(self.note['path']).write_text('external edit')
        with self.assertRaises(app.Problem):app.details_store().save(self.nid,{'etag':current['etag'],'confirm_fields':['weeks']})
        self.assertEqual(Path(self.note['path']).read_text(),'external edit')
    def test_unsafe_reference_and_invalid_pages_rejected(self):
        for relations in [[{'material_id':self.nid,'role':'primary','pages':''}],[{'material_id':self.source,'role':'primary','pages':'8-2'}],[{'material_id':'other-account','role':'reference','pages':''}]]:
            with self.assertRaises(app.Problem):self.save(self.nid,relations=relations)
        self.assertEqual(len(app.details_store().get(self.nid)['relations']),1)
    def test_new_learning_from_asset_reuses_bytes_and_stable_id(self):
        asset=app.upload_material({'kind':'originals','filename':'Week 3 Lab 1.md','text':'# 集合\n集合不计次序，相同元素只保留一次。'*5})['item']
        outline={'title':'集合','overview':'一块','blocks':[{'title':'集合','description':'理解集合','points':['集合']}]}
        with patch.object(app,'ask',return_value=outline):c=app.unit_store().from_material({'material_id':asset['id']})
        self.assertTrue(c['source_ref']);self.assertFalse((app.folder(c['id'])/'原始资料'/c['source_file']).exists())
        self.assertEqual(app.find_library_item(asset['id'])['unit_id'],c['id'])
        self.assertEqual(app.find_library_item('source-'+c['id'])['id'],asset['id'])
        self.assertEqual(app.unit_store().item(c)['source_id'],asset['id'])
        self.assertIn('集合不计次序',app.details_store().source_context(c))
    def test_resource_from_another_vault_cannot_be_linked(self):
        with patch.object(app, 'VAULT', self.base/'other-vault'):
            foreign = app.upload_material({'kind':'originals','filename':'private.md','text':'private'})['item']
        with self.assertRaises(app.Problem):
            app.details_store().get(foreign['id'])
        details = app.details_store().get(self.source)
        with self.assertRaises(app.Problem):
            app.details_store().save(self.source, {'etag':details['etag'],'relations':[{'material_id':foreign['id'],'role':'reference','pages':''}]})
        self.assertNotIn(foreign['id'], [r['id'] for r in details['relation_candidates']])
    def test_linked_material_context_uses_pages_and_note_override(self):
        asset=self.upload_pdf()
        self.save(self.nid,relations=[{'material_id':asset['id'],'role':'primary','pages':'2'}])
        with patch.object(app,'extract',return_value='【第 1 页】\nONE\n【第 2 页】\nTWO'):
            context=app.details_store().source_context(self.c,self.note['id'])
        self.assertIn('TWO',context);self.assertNotIn('ONE',context)
        self.assertNotIn('TWO',app.details_store().source_context(self.c))
    def test_long_combined_context_fails_without_modifying_data(self):
        first=app.upload_material({'kind':'originals','filename':'part1.md','text':'A'*60000})['item']
        second=app.upload_material({'kind':'originals','filename':'part2.md','text':'B'*60000})['item']
        self.save(self.source,relations=[{'material_id':first['id'],'role':'primary','pages':''},{'material_id':second['id'],'role':'supplement','pages':''}])
        before={str(p):p.read_bytes() for p in app.VAULT.rglob('*') if p.is_file()}
        with self.assertRaises(app.Problem) as error:app.details_store().source_context(self.c)
        self.assertEqual(error.exception.status,413);self.assertIn('详细信息',str(error.exception))
        self.assertEqual(before,{str(p):p.read_bytes() for p in app.VAULT.rglob('*') if p.is_file()})
    def test_unpaged_reference_is_rejected_on_save_and_read(self):
        with self.assertRaises(app.Problem):
            self.save(self.source,relations=[{'material_id':self.source,'role':'primary','pages':'1'}])
        index=app.library_index();index['metadata'].setdefault(self.source,{})['relations']=[{'material_id':self.source,'role':'primary','pages':'1','filename':'source.md'}]
        app.write_json(app.VAULT/'library.json',index)
        with self.assertRaises(app.Problem) as error:app.details_store().source_context(self.c)
        self.assertIn('不支持按页引用',str(error.exception))
    def test_out_of_range_page_reference_fails_clearly(self):
        asset=self.upload_pdf();self.save(self.nid,relations=[{'material_id':asset['id'],'role':'primary','pages':'4'}])
        with patch.object(app,'extract',return_value='【第 1 页】\nONE\n【第 2 页】\nTWO'):
            with self.assertRaises(app.Problem) as error:app.details_store().source_context(self.c,self.note['id'])
        self.assertIn('页码',str(error.exception))
