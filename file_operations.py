"""Reversible per-file operations; notes and discussion links keep stable IDs."""
import copy
import hashlib
import os
import re
from pathlib import Path

class Files:
    def __init__(self,host):self.h=host
    def call(self,key,*args,**kwargs):return self.h[key](*args,**kwargs)
    def fail(self,text,status=400):raise self.h['Problem'](text,status)
    def base(self):return self.call('library_path','.回收站')
    def snapshot(self,item):
        path=self.call('library_path',item['relative_path'])
        return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else ''
    def checked_name(self,raw,item):
        if not isinstance(raw,str):self.fail('请输入名称。')
        name=raw.strip()
        if not name or name in ('.','..') or len(name)>150 or re.search(r'[/\\\x00-\x1f]',name):self.fail('名称不能包含斜杠、换行或特殊路径。')
        if item.get('note_id'):return name[:-3] if name.lower().endswith('.md') else name
        suffix=Path(item['filename']).suffix
        if not Path(name).suffix:name+=suffix
        if Path(name).suffix.lower()!=suffix.lower():self.fail('请保留原文件的扩展名。')
        return name
    def manage(self,data):
        item=self.call('find_library_item',data.get('id'))
        action=data.get('action')
        if action not in ('rename','trash'):self.fail('不支持这个文件操作。')
        with self.call('course_lock',item.get('course_id') or 'library-files'),self.h['LOCK']:
            item=self.call('find_library_item',item['id'])
            version=self.snapshot(item)
            if not version:self.fail('文件不存在，请刷新后重试。',404)
            if data.get('version') and data['version']!=version:self.fail('文件已被修改，请刷新后重试。',409)
            return self.rename(item,data) if action=='rename' else self.trash(item)
    def rename(self,item,data):
        name=self.checked_name(data.get('name'),item);index=self.call('library_index')
        if item.get('note_id'):
            c=self.call('get_course',item['course_id']);note=next(n for n in c['notes'] if n['id']==item['note_id']);note['title']=name;self.call('save_course',c)
        elif item['id']=='source-'+item.get('course_id',''):
            c=self.call('get_course',item['course_id']);c['source_name']=name;self.call('save_course',c)
        else:
            old=self.call('library_path',item['relative_path']);new=old.with_name(name)
            if new!=old and new.exists():self.fail('同名文件已存在，请换一个名称。',409)
            new=self.call('library_path',str(new.relative_to(self.h['VAULT'].resolve())))
            entry=next((x for x in index['assets'] if x['id']==item['id']),None)
            if entry is None:entry={k:v for k,v in item.items() if k not in ('path','available','size')};index['assets'].append(entry)
            entry.update(title=name,filename=name,relative_path=str(new.relative_to(self.h['VAULT'].resolve())))
            if new!=old:os.rename(old,new)
            try:self.call('write_json',self.h['VAULT']/'library.json',index)
            except Exception:
                if new!=old:os.rename(new,old)
                raise
        return {'item':self.call('find_library_item',item['id'])}
    def trash(self,item):
        source=self.call('library_path',item['relative_path']);identity=self.call('uid');directory=self.base()/identity
        index=self.call('library_index');old_index=copy.deepcopy(index)
        c=self.call('get_course',item['course_id']) if item.get('course_id') else None;old_c=copy.deepcopy(c)
        note=next((n for n in c['notes'] if n['id']==item.get('note_id')),None) if c else None
        ticket={'id':identity,'item_id':item['id'],'title':item['title'],'relative_path':item['relative_path'],'course_id':item.get('course_id',''),'note':note,'asset':next((x for x in index['assets'] if x['id']==item['id']),None),'metadata':copy.deepcopy(index['metadata'].get(item['id'])),'created_at':self.call('now'),'status':'pending','sha256':self.snapshot(item)}
        directory.mkdir(parents=True,exist_ok=False);self.call('write_json',directory/'ticket.json',ticket)
        try:
            os.rename(source,directory/'payload')
            if note:c['notes']=[n for n in c['notes'] if n['id']!=note['id']];self.call('save_course',c)
            index['assets']=[x for x in index['assets'] if x['id']!=item['id']]
            index['metadata'].setdefault(item['id'],{})['trashed']=identity
            self.call('write_json',self.h['VAULT']/'library.json',index)
            ticket['status']='ready';self.call('write_json',directory/'ticket.json',ticket)
        except Exception:
            if (directory/'payload').exists() and not source.exists():os.rename(directory/'payload',source)
            if old_c:self.call('save_course',old_c)
            self.call('write_json',self.h['VAULT']/'library.json',old_index)
            ticket['status']='rolled-back';self.call('write_json',directory/'ticket.json',ticket)
            raise
        return {'trashed':identity,'title':item['title']}
    def listing(self):
        result=[]
        if not self.base().exists():return {'items':[]}
        for directory in self.base().iterdir():
            if directory.is_symlink() or not directory.is_dir():continue
            path=directory/'ticket.json'
            try:
                t=self.call('read_json',path)
                if t.get('status')=='ready' and (directory/'payload').is_file():result.append({k:t[k] for k in ('id','title','created_at')})
            except (ValueError,KeyError,OSError):continue
        return {'items':sorted(result,key=lambda t:t['created_at'],reverse=True)}
    def restore(self,data):
        identity=self.call('valid_id',data.get('id'));directory=self.base()/identity
        if directory.is_symlink() or not (directory/'ticket.json').is_file():self.fail('没有找到这份回收站文件。',404)
        t=self.call('read_json',directory/'ticket.json')
        with self.call('course_lock',t.get('course_id') or 'library-files'),self.h['LOCK']:
            t=self.call('read_json',directory/'ticket.json')
            if t.get('status')!='ready':self.fail('这份文件已经恢复。',409)
            payload=directory/'payload'
            if payload.is_symlink() or not payload.is_file():self.fail('回收站文件不可用。',409)
            target=self.call('library_path',t['relative_path'])
            allowed=self.call('folder',t['course_id']) if t.get('course_id') else self.h['VAULT']/'未归档'
            if not target.is_relative_to(allowed.resolve()) or target.suffix.lower() not in self.h['LIBRARY_EXTENSIONS']:self.fail('恢复路径无效。',403)
            if target.exists():self.fail('原位置已有同名文件，未覆盖它。',409)
            c=self.call('get_course',t['course_id']) if t.get('course_id') else None
            if t.get('note') and any(n['id']==t['note']['id'] for n in c['notes']):self.fail('这份笔记已存在。',409)
            index=self.call('library_index');old_index=copy.deepcopy(index);old_c=copy.deepcopy(c)
            try:
                target.parent.mkdir(parents=True,exist_ok=True);os.rename(payload,target)
                if t.get('note'):
                    c['notes'].append(t['note']);c['notes'].sort(key=lambda n:n['created_at']);self.call('save_course',c)
                if t.get('asset') and not any(x['id']==t['asset']['id'] for x in index['assets']):index['assets'].append(t['asset'])
                if t.get('metadata') is None:index['metadata'].pop(t['item_id'],None)
                else:index['metadata'][t['item_id']]=t['metadata']
                self.call('write_json',self.h['VAULT']/'library.json',index)
                t['status']='restored';self.call('write_json',directory/'ticket.json',t)
            except Exception:
                if target.exists() and not payload.exists():os.rename(target,payload)
                if old_c:self.call('save_course',old_c)
                self.call('write_json',self.h['VAULT']/'library.json',old_index)
                raise
            return {'restored':t['item_id']}
