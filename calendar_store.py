"""One calendar independent of academic placement; legacy records are read once on first save."""
import copy
import json
import re
import academic_import

FIELDS={'calendar':academic_import.calendar_rows,'timetable':academic_import.timetable_rows,'events':academic_import.event_rows,'references':academic_import.references}

class Calendar:
    def __init__(self,host):self.h=host
    @property
    def path(self):return self.h['VAULT']/'学习日历.json'
    def fail(self,message,status=400):raise self.h['Problem'](message,status)
    def normalize(self,data):
        if not isinstance(data,dict):self.fail('日历格式无效。')
        clean={}
        try:
            for field,validator in FIELDS.items():
                values=data.get(field,[])
                if field not in ('calendar','timetable'):clean[field]=validator(values);continue
                if not isinstance(values,list) or len(values)>5000:raise ValueError('日历安排过多，请分开整理。')
                groups={}
                for row in values:
                    if not isinstance(row,dict):raise ValueError('日历安排格式有误。')
                    group=row.get('calendar_group','')
                    if not isinstance(group,str) or not re.fullmatch(r'[a-zA-Z0-9_|-]{0,100}',group):raise ValueError('日历来源标识无效。')
                    groups.setdefault(group,[]).append(row)
                clean[field]=[{**r,**({'calendar_group':group} if group else {})} for group,rows in groups.items() for r in validator(rows)]
        except ValueError as error:self.fail(str(error))
        colors=data.get('colors',{})
        if not isinstance(colors,dict):self.fail('日历颜色格式无效。')
        clean['colors']={}
        for key,value in colors.items():
            if key not in ('calendar','timetable','exam') or not isinstance(value,str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',value):self.fail('请选择有效的日历颜色。')
            clean['colors'][key]=value.lower()
        return clean
    def document(self):
        if self.path.exists():
            raw=self.path.read_text(encoding='utf-8')
            try:doc=self.normalize(json.loads(raw))
            except (ValueError,TypeError,self.h['Problem']):self.fail('日历文件无法读取，未改动原文件。',409)
        else:
            doc={field:[] for field in FIELDS}
            for term in self.h['academic_store']().document()['terms']:
                for field in FIELDS:
                    for source in term.get(field,[]):
                        row=copy.deepcopy(source)
                        if field in ('calendar','timetable'):row['calendar_group']=term['key']
                        elif field=='events':row['id']=self.h['digest'](term['key']+row['id'])[:32]
                        if row not in doc[field]:doc[field].append(row)
            doc=self.normalize(doc)
            raw=json.dumps(doc,ensure_ascii=False,sort_keys=True)
        return {**doc,'etag':self.h['digest'](raw)}
    def save(self,data):
        normalized=self.normalize(data);importer=academic_import.Importer(self.h)
        prepared=importer.files(data.get('reference_files',[]))
        with self.h['LOCK']:
            latest=self.document()
            if data.get('etag')!=latest['etag']:self.fail('日历已在其他位置修改。当前修改已保留，请重新打开后再保存。',409)
            known=latest['references']+[r['reference'] for r in prepared]
            if any(ref not in known for ref in normalized['references']):self.fail('原始材料缺失，请重新导入。')
            for row in prepared:
                target=importer.directory/row['reference']['id']
                if target.exists():
                    if target.read_bytes()!=row['raw']:self.fail('原始材料发生冲突，未保存。',409)
                else:
                    target.parent.mkdir(parents=True,exist_ok=True)
                    with target.open('xb') as output:output.write(row['raw'])
            self.h['write_json'](self.path,{'version':1,**normalized})
            return self.document()
