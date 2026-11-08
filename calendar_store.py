"""One calendar independent of academic placement; old academic records are never auto-imported."""
import json
import os
import re
import tempfile
from functools import partial
from pathlib import Path
import academic_import
import calendar_subscription

MAX_REFERENCES=2000
FIELDS={'calendar':academic_import.calendar_rows,'timetable':partial(academic_import.timetable_rows,keep_location=False),'events':academic_import.event_rows}

def imported_courses(document):
    sources = {source['id'] for source in document.get('sources', []) if source['kind'] == 'timetable'}
    recurring = {row['course'] for row in document.get('timetable', []) if row.get('source_id') in sources}
    dated = {row['title'] for row in document.get('events', []) if row.get('source_id') in sources and row['kind'] != 'exam'}
    return sorted(recurring | dated, key=str.casefold)



def timetable_class_types(document):
    """Read explicit types from saved timetable rows, including manually entered classes."""
    sources = {source['id'] for source in document['sources'] if source['kind'] == 'timetable'}
    names = {}
    for row in document['timetable']:
        source = row.get('source_id')
        if source not in sources and (source or row.get('calendar_group')):
            continue
        name = row['class_type']
        if name:
            names.setdefault(name.casefold(), name)
    return sorted(names.values(), key=str.casefold)


class Calendar:
    def __init__(self,host):self.h=host
    @property
    def path(self):return self.h['VAULT']/'学习日历.json'
    def fail(self,message,status=400):raise self.h['Problem'](message,status)
    def normalize(self,data):
        if not isinstance(data,dict):self.fail('日历格式无效。')
        clean={}
        try:
            clean['references']=academic_import.references(data.get('references',[]),MAX_REFERENCES)
            for field,validator in FIELDS.items():
                values=data.get(field,[])
                if field not in ('calendar','timetable'):clean[field]=validator(values);continue
                if not isinstance(values,list) or len(values)>5000:raise ValueError('日历安排过多，请分开整理。')
                groups={}
                for row in values:
                    if not isinstance(row,dict):raise ValueError('日历安排格式有误。')
                    group=row.get('calendar_group','')
                    if not isinstance(group,str) or not re.fullmatch(r'[a-zA-Z0-9_|-]{0,100}',group):raise ValueError('日历来源标识无效。')
                    groups.setdefault((group,row.get('source_id','')),[]).append(row)
                clean[field]=[{**r,**({'calendar_group':group} if group else {})} for (group,source),rows in groups.items() for chunk in ([rows] if field=='timetable' or len(rows)<=180 else [rows[i:i+180] for i in range(0,len(rows),180)]) for r in validator(chunk)]
        except ValueError as error:self.fail(str(error))
        colors=data.get('colors',{})
        if not isinstance(colors,dict):self.fail('日历颜色格式无效。')
        clean['colors']={}
        for key,value in colors.items():
            if key not in ('calendar','timetable','exam') or not isinstance(value,str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',value):self.fail('请选择有效的日历颜色。')
            clean['colors'][key]=value.lower()
        sources=data.get('sources',[])
        if not isinstance(sources,list) or len(sources)>100:self.fail('最多支持 100 个日历来源。')
        clean['sources']=[];ids=set()
        reference_ids={ref['id'] for ref in clean['references']}
        for row in sources:
            if not isinstance(row,dict):self.fail('日历来源格式无效。')
            key=row.get('id');name=row.get('name');kind=row.get('kind');source_type=row.get('type')
            if not isinstance(key,str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,64}',key) or key in ids or not isinstance(name,str) or not name.strip() or len(name)>150 or kind not in academic_import.KINDS or source_type not in ('import','subscription'):self.fail('日历来源格式无效。')
            item={'id':key,'name':name.strip(),'kind':kind,'type':source_type,'visible':row.get('visible') is not False}
            try:
                item.update(academic_import.row_color({'color':row.get('color','')}))
                if source_type=='subscription':item['url']=calendar_subscription.subscription_url(row.get('url'))
                originals=row.get('reference_ids',[])
                if not isinstance(originals,list) or len(originals)>MAX_REFERENCES or any(not isinstance(ref,str) or ref not in reference_ids for ref in originals):
                    raise ValueError('日历来源引用了不存在的原始文件。')
                if originals:
                    if source_type!='import':raise ValueError('上传原件只能关联到导入来源。')
                    item['reference_ids']=list(dict.fromkeys(originals))
                if 'handbook' in row:
                    if kind!='exam' or source_type!='import':raise ValueError('Module Handbook 只能放在考试信息中。')
                    item['handbook']=academic_import.handbook_record(row['handbook'])
            except ValueError as error:self.fail(str(error))
            if isinstance(row.get('updated_at'),str):item['updated_at']=row['updated_at'][:40]
            clean['sources'].append(item);ids.add(key)
        if any(row.get('source_id') and row['source_id'] not in ids for key in ('calendar','timetable','events') for row in clean[key]):self.fail('安排对应的日历来源缺失。')
        timetable_sources={row['id'] for row in clean['sources'] if row['kind']=='timetable'}
        for row in clean['events']:
            if row.get('source_id') in timetable_sources:row.pop('location',None)
        return clean
    def document(self):
        if self.path.exists():
            raw=self.path.read_text(encoding='utf-8')
            try:doc=self.normalize(json.loads(raw))
            except (ValueError,TypeError,self.h['Problem']):self.fail('日历文件无法读取，未改动原文件。',409)
        else:
            doc={field:[] for field in FIELDS}
            doc=self.normalize(doc)
            raw=json.dumps(doc,ensure_ascii=False,sort_keys=True)
        return {**doc,'etag':self.h['digest'](raw)}
    def save(self,data):
        normalized=self.normalize(data);importer=academic_import.Importer(self.h)
        prepared=importer.files(data.get('reference_files',[]),extract=False)
        with self.h['LOCK']:
            latest=self.document()
            if data.get('etag')!=latest['etag']:self.fail('日历已在其他位置修改。当前修改已保留，请重新打开后再保存。',409)
            previous_handbooks={row['id']:row['handbook'] for row in latest['sources'] if 'handbook' in row}
            courses=set(imported_courses(normalized))
            for row in normalized['sources']:
                handbook=row.get('handbook')
                if handbook and handbook!=previous_handbooks.get(row['id']) and handbook['course'] not in courses:
                    self.fail('请选择仍在课表中的课程，再保存考试信息。')
            known=latest['references']+[r['reference'] for r in prepared]
            if any(ref not in known for ref in normalized['references']):self.fail('原始材料缺失，请重新导入。')
            try:normalized['references']=academic_import.references(latest['references']+normalized['references'],MAX_REFERENCES)
            except ValueError as error:self.fail(str(error))
            for row in prepared:
                if row['reference'] not in normalized['references']:continue
                target=importer.directory/row['reference']['id']
                if not target.exists():
                    target.parent.mkdir(parents=True,exist_ok=True)
                    temp=None
                    try:
                        with tempfile.NamedTemporaryFile(dir=target.parent,delete=False) as output:
                            temp=Path(output.name)
                            output.write(row['raw'])
                        try:os.link(temp,target)
                        except FileExistsError:pass
                    finally:
                        if temp:temp.unlink(missing_ok=True)
                if target.read_bytes()!=row['raw']:self.fail('原始材料发生冲突，未保存。',409)
            self.h['write_json'](self.path,{'version':1,**normalized})
            return self.document()
