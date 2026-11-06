"""Shared academic placement for semantic courses; source files stay untouched."""
import copy
import json
import academic_import
STAGES={'highschool','university','postgraduate'}
def placement(value):
    if not isinstance(value,dict) or value.get('stage') not in STAGES:return None
    y,s=value.get('year'),value.get('semester')
    if type(y) is not int or type(s) is not int or not 1<=y<=9007199254740991 or not 1<=s<=9007199254740991:return None
    return {'stage':value['stage'],'year':y,'semester':s}
def key_for(value):
    value=placement(value)
    return f"{value['stage']}|{value['year']}|{value['semester']}" if value else None
class Organization:
    def __init__(self,host):self.h=host
    @property
    def path(self):return self.h['VAULT']/'学业安排.json'
    def fail(self,message,status=400):raise self.h['Problem'](message,status)
    def normalize(self,data):
        if not isinstance(data,dict) or not isinstance(data.get('terms'),list) or not isinstance(data.get('assignments'),dict):self.fail('学期信息不完整。')
        if len(data['terms'])>200 or len(data['assignments'])>2000:self.fail('学期或课程信息过多。')
        terms=[];keys=set()
        for term in data['terms']:
            a=placement(term);key=key_for(a)
            if not a:self.fail('请选择阶段，年级和学期请填写大于 0 的整数。')
            if key in keys:self.fail('同一年级的学期不能重复。')
            name=term.get('name','')
            if not isinstance(name,str) or len(name.strip())>80:self.fail('学期名称最多 80 个字。')
            extra={}
            try:
                for field,clean in [('calendar',academic_import.calendar_rows),('timetable',academic_import.timetable_rows),('events',academic_import.event_rows),('references',academic_import.references)]:
                    if field in term:extra[field]=clean(term[field])
            except ValueError as error:self.fail(str(error))
            terms.append({**a,'key':key,'name':name.strip(),**extra});keys.add(key)
        assignments={}
        for course,key in data['assignments'].items():
            if not isinstance(course,str) or not 1<=len(course.strip())<=150:self.fail('课程名称无效。')
            if key is not None and (not isinstance(key,str) or key not in keys):self.fail('课程所属学期不存在。')
            assignments[course.strip()]=key
        removed=data.get('removed_terms',[])
        if not isinstance(removed,list) or len(removed)>2000:self.fail('已移除学期信息无效。')
        removed_keys=set()
        for key in removed:
            try:
                stage,year,semester=key.split('|')
                parsed={'stage':stage,'year':int(year),'semester':int(semester)}
            except (AttributeError,TypeError,ValueError):self.fail('已移除学期信息无效。')
            if key_for(parsed)!=key:self.fail('已移除学期信息无效。')
            if key not in keys:removed_keys.add(key)
        return {'terms':terms,'assignments':assignments,'removed_terms':sorted(removed_keys)}
    def defaults(self,courses):
        terms={};seen={}
        for c in courses:
            course=(c.get('tags') or {}).get('course') or c.get('course_label') or ''
            a=placement(c.get('academic'));key=key_for(a)
            if a:terms[key]={**a,'key':key,'name':''}
            if course:seen.setdefault(course,set()).add(key)
        return {'removed_terms':[],'terms':list(terms.values()),'assignments':{course:next(iter(keys)) for course,keys in seen.items() if len(keys)==1 and None not in keys}}
    def document(self,courses=None):
        raw=self.path.read_text(encoding='utf-8') if self.path.exists() else ''
        if raw:
            try:doc=self.normalize(json.loads(raw))
            except (ValueError,TypeError,self.h['Problem']):self.fail('学业安排文件无法读取，未改动原文件。',409)
        else:
            if courses is None:
                courses=[]
                for path in (self.h['VAULT']/'课程').glob('*/course.json'):
                    try:courses.append(self.h['read_json'](path))
                    except (ValueError,OSError):continue
            doc=self.defaults(courses)
        return {**doc,'etag':self.h['digest'](raw or json.dumps(doc,ensure_ascii=False,sort_keys=True))}
    def save(self,data):
        normalized=self.normalize(data)
        importer=academic_import.Importer(self.h)
        prepared=importer.files(data.get('reference_files',[]))
        with self.h['LOCK']:
            latest=self.document()
            if data.get('etag')!=latest['etag']:self.fail('学期信息已在其他位置修改。当前修改已保留，请重新打开后再保存。',409)
            known=[ref for term in latest['terms'] for ref in term.get('references',[])]+[row['reference'] for row in prepared]
            for term in normalized['terms']:
                for ref in term.get('references',[]):
                    if ref not in known:self.fail('参考原件缺失，请重新选择文件。')
            active={term['key'] for term in normalized['terms']}
            removed=set(latest.get('removed_terms',[]))|set(normalized['removed_terms'])|({term['key'] for term in latest['terms']}-active)
            normalized['removed_terms']=sorted(removed-active)
            for row in prepared:
                target=importer.directory/row['reference']['id']
                if target.exists():
                    if target.read_bytes()!=row['raw']:self.fail('参考原件发生冲突，未保存。',409)
                else:
                    target.parent.mkdir(parents=True,exist_ok=True)
                    with target.open('xb') as output:output.write(row['raw'])
            self.h['write_json'](self.path,{'version':2,**copy.deepcopy(normalized)})
            return self.document()
