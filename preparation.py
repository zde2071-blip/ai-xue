"""Exam preparation references existing notes and originals; never copies or edits them."""
import hashlib
import json
import uuid
from pathlib import Path
import academic_import
import calendar_store

class Preparation:
    def __init__(self, host):self.h=host
    @property
    def path(self):return self.h['VAULT']/'备考.json'
    def fail(self,message,status=400):raise self.h['Problem'](message,status)
    def document(self):
        if self.path.exists():
            raw=self.path.read_text(encoding='utf-8')
            try:
                data=json.loads(raw)
                if not isinstance(data.get('courses'),dict):raise ValueError()
            except (ValueError,TypeError):self.fail('备考文件无法读取，未修改原文件。',409)
        else:data={'courses':{}};raw='{}'
        return {**data,'etag':self.h['digest'](raw)}
    def view(self):
        data=self.document();calendar=calendar_store.Calendar(self.h).document();exams=[]
        for source in calendar['sources']:
            if source['kind']!='exam':continue
            refs=[ref for ref in calendar['references'] if ref['id'] in source.get('reference_ids',[])]
            for row in source.get('assessments',[]):exams.append({**row,'source_id':source['id'],'originals':refs})
            if source.get('handbook'):
                for i,row in enumerate(source['handbook']['entries']):
                    exams.append({'id':source['id']+'-'+str(i),'course':calendar_store.course_label(source['handbook']['course']),'title':row['name'],'timing':row['timing'],'weight':row['weight'],'evidence':row['evidence'],'originals':refs,'legacy':True})
        represented={row['id'] for row in exams}
        sources={s['id']:s for s in calendar['sources']}
        for row in calendar['events']:
            if row['kind']!='exam' or row['id'] in represented:continue
            code=calendar_store.course_label(row['title'])
            if code==row['title'] and not any(c.isdigit() for c in code):continue
            source=sources.get(row.get('source_id'),{})
            exams.append({**row,'course':code,'originals':[ref for ref in calendar['references'] if ref['id'] in source.get('reference_ids',[])],'legacy':True})
        items=self.h['library_items']();index=self.h['library_index']();details=self.h['details_store']()
        by_id={r['id']:r for r in items};originals={}
        for note in items:
            if note['kind']!='notes':continue
            originals[note['id']]=[{**link,'id':link['material_id'],'filename':by_id.get(link['material_id'],{}).get('filename',link.get('filename','原课件')),'available':bool(by_id.get(link['material_id'],{}).get('available'))} for link in details.relations(note,index)]
        return {**data,'exams':exams,'note_originals':originals,'calendar_etag':calendar['etag']}
    def save_exams(self,data):
        store=calendar_store.Calendar(self.h)
        with self.h['LOCK']:
            doc=store.document()
            if data.get('etag')!=doc['etag']:self.fail('考试信息已更新，请重新打开后再保存。',409)
            try:rows=academic_import.assessment_rows(data.get('assessments'))
            except (ValueError,TypeError) as error:self.fail(str(error))
            if not rows:self.fail('请至少填写一项考试或考核。')
            files=data.get('attachments',[])
            prepared=academic_import.Importer(self.h).files([{**f,'kind':'exam'} for f in files],extract=False)
            source_id=data.get('source_id')
            replacing=False
            if not source_id and prepared:
                refs={item['reference']['id'] for item in prepared}
                matches=[s for s in doc['sources'] if s['kind']=='exam' and set(s.get('reference_ids',[]))==refs]
                if len(matches)==1:source_id=matches[0]['id'];replacing=True
            source=next((s for s in doc['sources'] if s['id']==source_id and s['kind']=='exam'),None)
            if source_id and not source:self.fail('原考试信息已被移走，请重新打开。',409)
            if not source:
                source={'id':uuid.uuid4().hex,'name':'考试信息','kind':'exam','type':'import','visible':True,'assessments':[]}
                doc['sources'].append(source)
            previous={} if replacing else {r['id']:r for r in source.get('assessments',[])}
            previous.update({r['id']:r for r in rows});source['assessments']=list(previous.values())
            for item in prepared:
                ref=item['reference']
                if ref not in doc['references']:doc['references'].append(ref)
                source.setdefault('reference_ids',[])
                if ref['id'] not in source['reference_ids']:source['reference_ids'].append(ref['id'])
            ids={r['id'] for r in rows}
            doc['events']=[r for r in doc['events'] if r['id'] not in ids and not (replacing and r.get('source_id')==source['id'])]
            for row in rows:
                if row['date'] and not row['date_end']:
                    doc['events'].append({'id':row['id'],'title':row['course']+' · '+row['title'],'kind':'exam','date':row['date'],'start':row['start'] if row['end'] else '', 'end':row['end'] if row['start'] else '', 'location':row['location'],'source_id':source['id']})
            store.save({**doc,'reference_files':[{**f,'kind':'exam'} for f in files]})
        return self.view()
    def save_materials(self,data):
        code=calendar_store.course_label(academic_import.text(data.get('course',''),80))
        if not code:self.fail('请选择课程。')
        with self.h['LOCK']:
            doc=self.document()
            if data.get('etag')!=doc['etag']:self.fail('备考材料已更新，请重新打开后再保存。',409)
            item=doc['courses'].setdefault(code,{'notes':[],'papers':[]})
            if data.get('action')=='notes':
                ids=data.get('notes')
                resources={r['id']:r for r in self.h['library_items']() if r['kind']=='notes'}
                if not isinstance(ids,list) or len(ids)>1000 or any(not isinstance(n,str) or n not in resources or not resources[n]['available'] for n in ids):self.fail('所选笔记已被移走，请刷新后重选。',409)
                courses={c['id']:c for c in self.h['state']()['courses']}
                for key in ids:
                    r=resources[key];c=courses.get(r.get('unit_id') or r.get('course_id'),{})
                    label=r.get('tags',{}).get('course') or c.get('tags',{}).get('course') or c.get('course_label') or r.get('course_title','')
                    if calendar_store.course_identity(label)!=calendar_store.course_identity(code):self.fail('所选笔记不属于当前课程。')
                item['notes']=list(dict.fromkeys(ids))
            elif data.get('action')=='papers':
                kind=data.get('paper_kind')
                if kind not in ('mock','past'):self.fail('请选择模拟题或真题。')
                files=data.get('attachments',[])
                if not files:self.fail('请选择文件。')
                prepared=academic_import.Importer(self.h).files([{**f,'kind':'exam'} for f in files],extract=False)
                for file in prepared:
                    ref=file['reference'];target=self.path.parent/'备考原件'/ref['id']
                    target.parent.mkdir(parents=True,exist_ok=True)
                    if not target.exists():
                        with target.open('xb') as out:out.write(file['raw'])
                    elif target.read_bytes()!=file['raw']:self.fail('原件冲突，未保存。',409)
                    entry={'id':ref['id'],'filename':ref['filename'],'kind':kind}
                    if entry not in item['papers']:item['papers'].append(entry)
            else:self.fail('未知备考操作。')
            doc.pop('etag',None);self.h['write_json'](self.path,doc)
        return self.view()
    def file(self,key):
        for course in self.document()['courses'].values():
            for paper in course.get('papers',[]):
                if paper['id']==key:
                    path=self.path.parent/'备考原件'/key
                    if path.is_file():return path,paper['filename']
        self.fail('原件不存在。',404)
