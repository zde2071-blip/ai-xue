"""Account-scoped metadata and stable material references, separate from note text."""
import copy
import json
import re
from pathlib import Path
import material_metadata as metadata
import learning_units

FIELDS=('course','weeks','class_type','chapter','topic','custom','sessions','note_kind','relations')
ROLES=('primary','supplement','reference')


def sources_normalized(raw):
    result={}
    for key,value in raw.items() if isinstance(raw,dict) else []:
        key={'week':'weeks','course_id':'course'}.get(key,key)
        if key not in FIELDS or not isinstance(value,dict):continue
        record=copy.deepcopy(value)
        record['source']=str(value.get('source') or '')[:80]
        record['evidence']=str(value.get('evidence') or '')[:600]
        record['status']=value.get('status') if value.get('status') in ('confirmed','conflict','unconfirmed') else 'confirmed' if value.get('source') in ('用户确认','用户修改') else 'unconfirmed'
        result[key]=record
    return result


def effective(item,course,index):
    """Compute inherited tags without writing a migration or mutating source records."""
    override=index['metadata'].get(item['id'],{})
    source_id=(course.get('origin_material_id') if course.get('source_ref') else 'source-'+course['id']) if course else None
    source_override=index['metadata'].get(source_id,{})
    tags=copy.deepcopy(course.get('tags',{})) if course else {}
    if course:tags.setdefault('course',course.get('course_label',''))
    if course and isinstance(source_override.get('tags'),dict):tags.update(source_override['tags'])
    # library_items already incorporates source inheritance and older flat overrides.
    for key in ('weeks','class_type','chapter','topic'):
        if key in item:tags[key]=item[key]
    if 'week' in override and 'weeks' not in override:tags['weeks']=[override['week']] if override['week'] else []
    if isinstance(item.get('tags'),dict):tags.update(item['tags'])
    if isinstance(override.get('tags'),dict):tags.update(override['tags'])
    tags=learning_units.clean_tags(tags,metadata.normalize_fields)
    sessions=override.get('sessions',item.get('sessions',source_override.get('sessions',course.get('sessions',[]) if course else [])))
    sessions=metadata.normalize_sessions(sessions)
    sources=sources_normalized(item.get('metadata_sources',{}))
    sources.update(sources_normalized(override.get('metadata_sources',{})))
    kind=override.get('note_kind',item.get('note_kind',course.get('learning_kind') if course else None))
    if not isinstance(kind,str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,64}',kind):kind='solutions' if tags['class_type'].casefold() in ('tutorial','exam','workshop','exercise') else 'concepts'
    return {**item,'tags':tags,**{k:tags[k] for k in ('weeks','class_type','chapter','topic')},'week':tags['weeks'][0] if tags['weeks'] else None,'sessions':sessions,'metadata_sources':sources,'note_kind':kind}


class Details:
    def __init__(self,host):self.h=host
    def call(self,name,*args,**kwargs):return self.h[name](*args,**kwargs)
    def fail(self,message,status=400):raise self.h['Problem'](message,status)
    def unit(self,item):
        if item.get('unit_id'):return item['unit_id']
        if item.get('note_id') or item['id'].startswith('source-'):return item.get('course_id') or None
        return next((c['id'] for c in self.call('course_records') if c.get('origin_material_id')==item['id']),None)
    def relations(self,item,index=None):
        index=index or self.call('library_index');override=index['metadata'].get(item['id'],{})
        if 'relations' in override:return copy.deepcopy(override['relations'])
        unit_id=self.unit(item)
        if unit_id:
            c=self.call('get_course',unit_id)
            source_id=c.get('origin_material_id') if c.get('source_ref') else 'source-'+unit_id
            if item.get('note_id'):
                source_override=index['metadata'].get(source_id,{})
                if 'relations' in source_override:return copy.deepcopy(source_override['relations'])
            return [{'material_id':source_id,'role':'primary','pages':'','title':c['source_name'],'filename':c['source_name']}]
        return [] if item.get('kind')=='notes' else [{'material_id':item['id'],'role':'primary','pages':'','title':item['title'],'filename':item['filename']}]
    def candidates(self,items):
        return [{'id':r['id'],'title':r['title'],'filename':r['filename'],'available':r['available'],'course_id':r.get('course_id',''),'tags':r.get('tags',{})} for r in items if r.get('kind')!='notes' and not r.get('note_id')]
    def expanded_relations(self,relations,items):
        by_id={r['id']:r for r in items};out=[]
        for relation in relations:
            linked=by_id.get(relation['material_id'])
            out.append({**relation,'title':linked['title'] if linked else relation.get('title','原件不可用'),'filename':linked['filename'] if linked else relation.get('filename',''),'available':bool(linked and linked['available'])})
        return out
    def get(self,item_id):
        item=self.call('find_library_item',item_id);items=self.call('library_items');index=self.call('library_index')
        relations=self.expanded_relations(self.relations(item,index),items)
        related=[]
        if item.get('kind')!='notes':
            for r in items:
                if r.get('kind')=='notes' and any(link['material_id']==item['id'] for link in self.relations(r,index)):
                    related.append({k:r.get(k,'') for k in ('id','title','course_id','note_id')})
        result={'item':item,'unit_id':self.unit(item),'tags':item['tags'],'sessions':item['sessions'],'note_kind':item['note_kind'],'metadata_sources':item['metadata_sources'],'relations':relations,'relation_candidates':self.candidates(items),'related_notes':related}
        # Both content and relation state participate: an external note edit, rename or
        # removed source must be reviewed rather than silently saved over stale details.
        version={'item':item,'relations':relations,'content_version':self.call('file_store').snapshot(item)}
        result['templates']=self.call('template_store').choices()
        result['choices']=self.call('settings_store').document()['groups']
        result['etag']=self.call('digest',json.dumps(version,sort_keys=True,ensure_ascii=False))
        return result
    def clean_relations(self,raw,current,items):
        if not isinstance(raw,list) or len(raw)>100:self.fail('关联原件最多 100 份。')
        allowed={r['id']:r for r in items if r.get('kind')!='notes' and not r.get('note_id')}
        previous={r['material_id']:r for r in current};out=[];seen=set()
        for row in raw:
            if not isinstance(row,dict):self.fail('原件关联无效。')
            ident=row.get('material_id');role=row.get('role','reference');pages=row.get('pages','')
            if not isinstance(ident,str) or ident in seen:self.fail('同一原件只需关联一次。')
            target=allowed.get(ident)
            if not target and ident not in previous:self.fail('原件不存在或不属于当前账户。',404)
            if role not in ROLES:self.fail('请选择主材料、补充材料或参考材料。')
            if not isinstance(pages,str) or len(pages)>120:self.fail('页码无效。')
            pages=pages.strip().replace('，',',').replace('–','-').replace('—','-')
            if pages:
                for part in pages.split(','):
                    match=re.fullmatch(r'\s*([1-9]\d{0,4})(?:\s*-\s*([1-9]\d{0,4}))?\s*',part)
                    if not match or match[2] and int(match[1])>int(match[2]):self.fail('页码请填写 1-3, 5 这样的范围。')
            original=target or previous[ident]
            if pages and Path(original.get('filename','')).suffix.lower() not in ('.pdf','.pptx'):
                self.fail('只有 PDF 和 PPTX 支持按页引用；请清空这份材料的页码。')
            out.append({'material_id':ident,'role':role,'pages':pages,'title':original.get('title',''),'filename':original.get('filename','')});seen.add(ident)
        return out
    def save(self,item_id,data):
        with self.h['LOCK']:
            current=self.get(item_id);item=current['item'];index=self.call('library_index')
            if not data.get('etag') or data['etag']!=current['etag']:self.fail('详细信息或文件已改变，请重新打开后保存。',409)
            try:
                tags=learning_units.clean_tags(data.get('tags',current['tags']),metadata.normalize_fields)
                sessions=metadata.normalize_sessions(data.get('sessions',current['sessions']))
            except ValueError as error:self.fail(str(error))
            kind=data.get('note_kind',current['note_kind'])
            if not self.call('template_store').has(kind):self.fail('学习模板不存在。')
            relations=self.clean_relations(data.get('relations',current['relations']),current['relations'],self.call('library_items'))
            confirm=data.get('confirm_fields',[])
            if not isinstance(confirm,list) or any(not isinstance(k,str) for k in confirm):self.fail('确认字段无效。')
            confirm=[{'week':'weeks','course_id':'course'}.get(k,k) for k in confirm]
            if any(k not in FIELDS for k in confirm):self.fail('确认字段无效。')
            old={**current['tags'],'sessions':current['sessions'],'note_kind':current['note_kind'],'relations':[{k:r[k] for k in ('material_id','role','pages')} for r in current['relations']]}
            new={**tags,'sessions':sessions,'note_kind':kind,'relations':[{k:r[k] for k in ('material_id','role','pages')} for r in relations]}
            changed={key for key in FIELDS if old[key]!=new[key]}
            sources=copy.deepcopy(current['metadata_sources'])
            for key in changed|set(confirm):
                previous=sources.get(key,{})
                record=copy.deepcopy(previous)
                if key in changed:
                    history=list(record.get('history',[]))[-19:]
                    if previous:history.append({k:v for k,v in previous.items() if k!='history'})
                    record.update(source='用户修改',evidence=previous.get('evidence',''),previous_value=old[key],history=history)
                elif not record:record={'source':'用户确认','evidence':''}
                record.update(status='confirmed',confirmed_at=self.call('now'));sources[key]=record
            override=index['metadata'].setdefault(item['id'],{})
            # Only actual changes become overrides; unchanged inherited values follow
            # the source later. Explicit confirmation freezes that field intentionally.
            tag_keys=set(tags)&(changed|set(confirm))
            if tag_keys:
                override.setdefault('tags',{}).update({k:tags[k] for k in tag_keys})
                for key in tag_keys&{'weeks','class_type','chapter','topic'}:override[key]=tags[key]
                if 'weeks' in tag_keys:override['week']=tags['weeks'][0] if tags['weeks'] else None
            for key,value in [('sessions',sessions),('note_kind',kind),('relations',relations)]:
                if key in changed or key in confirm:override[key]=value
            own_sources=sources_normalized(override.get('metadata_sources',{}))
            own_sources.update({key:sources[key] for key in changed|set(confirm)})
            if own_sources:override['metadata_sources']=own_sources
            # Preserve a stable disk-file ID when it is later renamed through the app.
            if item['id'].startswith('disk-') and not any(r['id']==item['id'] for r in index['assets']):
                index['assets'].append({k:v for k,v in item.items() if k not in ('path','available','size')})
            self.call('write_json',self.h['VAULT']/'library.json',index)
            return self.get(item['id'])
    def source_originals(self,c,note_id=None):
        import original_inputs
        source_id=c.get('origin_material_id') if c.get('source_ref') else 'source-'+c['id']
        target='note-'+c['id']+'-'+note_id if note_id else source_id
        item=self.call('find_library_item',target)
        by_id={row['id']:row for row in self.call('library_items')};files=[]
        for link in self.relations(item):
            row=by_id.get(link['material_id'])
            if not row or not row['available']:self.fail('关联原件不可用，请在详细信息中检查后重试。',409)
            path=self.call('library_path',row['relative_path'])
            try:
                if path.stat().st_size>original_inputs.MAX_BYTES:self.fail('原件超过 15 MB，请缩小材料范围。',413)
                raw=path.read_bytes();pages=link.get('pages','')
                raw=original_inputs.select_pages(row['filename'],raw,pages)
            except (OSError,ValueError):self.fail('无法读取关联原件或指定页码，请检查后重试。',409)
            files.append({'filename':row['filename'],'raw':raw,'pages':pages})
        if not files:self.fail('没有关联的课件原件，请在详细信息中添加原件。',409)
        return files

    def source_context(self,c,note_id=None,limit=110000):
        """Read only linked originals; excerpts honor PDF/PPT page markers."""
        source_id=c.get('origin_material_id') if c.get('source_ref') else 'source-'+c['id']
        target='note-'+c['id']+'-'+note_id if note_id else source_id
        try:item=self.call('find_library_item',target)
        except self.h['Problem']:return c.get('overview','')
        items=self.call('library_items');by_id={r['id']:r for r in items};parts=[]
        def append_part(value):
            if sum(map(len,parts))+len(parts)+len(value)>limit:
                self.fail('关联材料过长，无法完整用于本次讲解。请在详细信息中缩小 PDF/PPTX 页码范围，或减少关联材料。',413)
            parts.append(value)
        for link in self.relations(item):
            r=by_id.get(link['material_id'])
            pages=link.get('pages','')
            if pages and Path((r or link).get('filename','')).suffix.lower() not in ('.pdf','.pptx'):
                self.fail('这份材料不支持按页引用，请在详细信息中清空页码后重试。',409)
            if not r or not r['available']:
                append_part('[原件不可用：'+link.get('title','')+']');continue
            try:
                path=self.call('library_path',r['relative_path'])
                if path.stat().st_size>15*1024*1024:continue
                if r['id']=='source-'+c['id'] and (path.parent/'提取文本.md').exists():text=(path.parent/'提取文本.md').read_text(encoding='utf-8')
                else:text=self.call('extract',r['filename'],path.read_bytes())
            except (OSError,ValueError,ImportError,self.h['Problem']):
                append_part('[原件暂时无法读取：'+r['title']+']');continue
            if pages:
                wanted=set()
                for span in pages.split(','):
                    pair=[int(x.strip()) for x in span.split('-')];a=pair[0];b=pair[-1]
                    wanted.update(range(a,b+1))
                chunks=re.split(r'(?=【第 \d+ 页】)',text)
                available={int(match[1]) for chunk in chunks if (match:=re.match(r'【第 (\d+) 页】',chunk))}
                if not available or not wanted.issubset(available):
                    self.fail('关联材料的页码无法对应原件，请在详细信息中检查页码范围。',409)
                text='\n'.join(chunk for chunk in chunks if (match:=re.match(r'【第 (\d+) 页】',chunk)) and int(match[1]) in wanted)
            heading='\n<原件 '+link['role']+'：'+r['filename']+('；页码 '+pages if pages else '')+'>\n'
            append_part(heading+text+'\n</原件>')
        return '\n'.join(parts)
