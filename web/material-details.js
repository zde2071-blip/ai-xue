/* Resource metadata is edited here; document text and source files stay untouched. */
(function(root){
 'use strict';
 const labels={course:'课程归属',weeks:'教学周',class_type:'课程类型',chapter:'章节',topic:'主题',sessions:'课次',note_kind:'笔记类型',relations:'原始材料'};
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const glyph=name=>`<i data-lucide="${name}"></i>`;
 const clone=value=>JSON.parse(JSON.stringify(value));
 function parseWeeks(value){
  if(Array.isArray(value))value=value.join(',');
  if(!String(value??'').trim())return [];
  const values=[];
  for(const part of String(value).trim().replace(/\s*([-–—~至])\s*/g,'$1').split(/[,，、;；\s]+/)){
   const match=part.match(/^(\d+)(?:\s*[-–—~至]\s*(\d+))?$/);
   if(!match)throw new Error('教学周请填写数字，例如 3、4 或 3–5。');
   const start=Number(match[1]),end=Number(match[2]||match[1]);
   if(start<1||end>60||end<start)throw new Error('教学周应在 1–60 之间。');
   for(let week=start;week<=end;week++)values.push(week);
  }
  return [...new Set(values)].sort((a,b)=>a-b);
 }
 function draftFromDetails(data){return {tags:{course:'',weeks:[],class_type:'',chapter:'',topic:'',custom:[],...clone(data.tags||{})},sessions:clone(data.sessions||[]),note_kind:data.note_kind||'concepts',relations:clone(data.relations||[]),confirm_fields:[]};}
 function optionalNumber(value,max,label){if(value===''||value===null||value===undefined)return null;const n=Number(value);if(!Number.isInteger(n)||n<1||n>max)throw new Error(`${label}应在 1–${max} 之间，也可以留空。`);return n;}
 function buildPayload(draft,etag){
  const tags={...draft.tags,weeks:parseWeeks(draft.tags.weeks),custom:Array.isArray(draft.tags.custom)?draft.tags.custom:String(draft.tags.custom||'').split(/[,，、\n]/)};
  for(const key of ['course','class_type','chapter','topic'])tags[key]=String(tags[key]||'').trim();
  tags.custom=[...new Set(tags.custom.map(s=>String(s).trim()).filter(Boolean))];
  const sessions=draft.sessions.map(row=>({week:optionalNumber(row.week,60,'教学周'),class_type:String(row.class_type||'').trim(),number:optionalNumber(row.number,999,'课次')})).filter(row=>row.week!==null||row.class_type||row.number!==null);
  return {etag,tags,sessions,note_kind:draft.note_kind,relations:draft.relations.map(row=>({material_id:row.material_id,role:row.role||'reference',pages:String(row.pages||'').trim()})),confirm_fields:[...new Set(draft.confirm_fields||[])]};
 }
 function currentResourceId(resources,courseId,noteId){return (noteId?resources.find(r=>r.note_id===noteId&&(r.unit_id===courseId||r.course_id===courseId))?.id:resources.find(r=>!r.note_id&&r.unit_id===courseId)?.id)||(!noteId?resources.find(r=>r.id==='source-'+courseId)?.id:null);}
 const editableFields=['course','class_type','weeks','note_kind'];
 function fieldValue(draft,key){
  if(key==='note_kind')return draft.note_kind;
  const value=draft.tags[key];return Array.isArray(value)?value.join(', '):String(value||'');
 }
 function setField(draft,key,value){
  if(!editableFields.includes(key))throw new Error('这项信息暂不能修改。');
  if(key==='weeks')draft.tags.weeks=parseWeeks(value);
  else if(key==='note_kind'){
   if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(value))throw new Error('请选择笔记类型。');
   draft.note_kind=value;
  }else draft.tags[key]=String(value||'').trim();
 }
 function hasChanges(data,draft,editor){
  if(editor&&String(editor.value).trim()!==fieldValue(draft,editor.key))return true;
  return JSON.stringify(buildPayload(draft,''))!==JSON.stringify(buildPayload(draftFromDetails(data),''));
 }
 function displayValue(draft,key,templates=[]){
  if(key==='note_kind')return escape(templates.find(row=>row.id===draft.note_kind)?.name||({concepts:'知识点总结',solutions:'题目讲解'}[draft.note_kind]||draft.note_kind));
  const values=draft.tags[key];
  if(Array.isArray(values))return values.length?values.map(value=>`<span class="details-chip">${escape(key==='weeks'?'Week '+value:value)}</span>`).join(''):'<span class="details-unset">添加</span>';
  return values?escape(values):'<span class="details-unset">未设置</span>';
 }
 function fieldMarkup(draft,key,editor,catalog,templates){
  const label=labels[key],value=fieldValue(draft,key),multiple=key==='weeks';
  let values;
  if(key==='note_kind')values=templates.map(row=>({value:row.id,label:row.name}));
  else values=[...new Set([...(catalog[key]||[]).map(String),...(multiple?draft.tags.weeks.map(String):value?[value]:[])])].map(v=>({value:v,label:multiple?'Week '+v:v}));
  if(multiple)values.sort((a,b)=>Number(a.value)-Number(b.value));
  if(!multiple&&key!=='note_kind')values.unshift({value:'',label:'未设置'});
  const selected=multiple?draft.tags.weeks.map(String):[value];
  const summary=key==='note_kind'?displayValue(draft,key,templates):displayValue(draft,key);
  return `<div class="details-property" data-field="${key}"><label class="details-label">${label}</label><details class="details-picker" data-details-list="${key}"><summary aria-label="选择${label}"><span class="details-picker-value">${summary}</span>${glyph('chevron-down')}</summary><div class="details-picker-menu"><input class="details-choice-search" data-details-search="${key}" aria-label="搜索${label}" placeholder="搜索"><div class="details-picker-options" aria-label="${label}选项">${values.map(row=>multiple?`<label class="details-choice-row"><input type="checkbox" data-details-choice="weeks" aria-label="${escape(row.label)}" value="${escape(row.value)}" ${selected.includes(row.value)?'checked':''}><span>${escape(row.label)}</span></label>`:`<button type="button" class="details-choice-row ${selected.includes(row.value)?'selected':''}" data-details-action="choose" data-key="${key}" data-value="${escape(row.value)}" aria-pressed="${selected.includes(row.value)}">${escape(row.label)}</button>`).join('')}</div></div></details></div>`;
 }
 function originalsMarkup(draft){
  return `<section class="details-originals"><h3>原始材料</h3>${draft.relations.map(row=>row.available===false
   ? `<div class="details-original-unavailable">${glyph('file-text')}<span>${escape(row.title||row.filename)}</span><small>文件暂不可用</small></div>`
   : `<a class="details-original-link" href="/api/library/${encodeURIComponent(row.material_id)}/file" target="_blank" rel="noopener">${glyph('file-text')}<span>${escape(row.title||row.filename)}</span>${glyph('arrow-up-right')}</a>`
  ).join('')||'<p class="details-empty">暂无原始材料</p>'}</section>`;
 }
 function detailsMarkup(data,draft,options={}){
  if(typeof options!=='object')options={};
  const {error='',saving=false,notice=''}=options;
  const catalog=data.choices||options.catalog||{};
  const templates=data.templates?.length?data.templates:[{id:'concepts',name:'知识点总结'},{id:'solutions',name:'题目讲解'}];
  const dirty=hasChanges(data,draft);
  return `<header class="details-header"><span>详细信息</span><button type="button" class="icon-button" data-details-action="close" aria-label="关闭详细信息" title="关闭详细信息" ${saving?'disabled':''}>${glyph('x')}</button></header>
   <form id="material-details-form" autocomplete="off" aria-busy="${saving}"><div class="details-content"><h2 class="details-resource-title">${escape(data.item?.title||data.item?.filename||'资料')}</h2>
   <fieldset class="details-properties" aria-label="分类标签" ${saving?'disabled':''}>${editableFields.map(key=>fieldMarkup(draft,key,null,catalog,templates)).join('')}</fieldset>
   ${originalsMarkup(draft)}<p class="details-notice" role="status" ${notice?'':'hidden'}>${escape(notice)}</p></div>
   <div class="details-bottom"><div id="details-error" role="alert" ${error?'':'hidden'}>${escape(error)}</div><footer class="details-footer" ${dirty?'':'hidden'}><button type="button" class="outline-button" data-details-action="cancel" ${saving?'disabled':''}>取消</button><button type="submit" class="primary" ${saving?'disabled':''}>${saving?'保存中…':'保存'}</button></footer></div></form>`;
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={parseWeeks,draftFromDetails,buildPayload,currentResourceId,detailsMarkup,fieldValue,setField,hasChanges};return;}
 let installed=false,token=0,active=null,returnFocus=null;
 const url=id=>'/api/library/'+encodeURIComponent(id)+'/details';
 function panel(){return document.getElementById('material-details-panel');}
 function isDirty(){return !!active&&hasChanges(active.data,active.draft);}
 function setError(message){
  if(!active)return;active.error=message;
  const target=panel()?.querySelector('#details-error');if(target){target.hidden=!message;target.textContent=message;}
 }
 function refreshDraft(){
  if(!active)return;active.notice='';
  const footer=panel()?.querySelector('.details-footer');if(footer)footer.hidden=!isDirty();
  const notice=panel()?.querySelector('.details-notice');if(notice)notice.hidden=true;
 }
 function refreshPicker(key){
  const target=panel()?.querySelector(`[data-details-list="${key}"] .details-picker-value`);
  if(target)target.innerHTML=displayValue(active.draft,key,active.data.templates||[]);icons();refreshDraft();
 }
 function canDismiss(){
  if(!active)return true;
  if(active.saving){toast('正在保存详情。');return false;}
  if(isDirty()){setError('请先保存或取消修改。');panel()?.querySelector('.details-bottom')?.scrollIntoView({block:'nearest'});return false;}
  return true;
 }
 function close(force=false){
  if(!force&&!canDismiss())return false;
  active=null;++token;document.body.classList.remove('resource-details-open');panel()?.remove();syncToggle();
  if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
  returnFocus=null;return true;
 }
 function renderPanel(){
  if(!active)return;
  let target=panel();if(!target){target=document.createElement('aside');target.id='material-details-panel';target.className='material-details-panel';target.setAttribute('aria-label','资料详细信息');document.body.append(target);}
  document.body.classList.add('resource-details-open');
  target.innerHTML=detailsMarkup(active.data,active.draft,{catalog:S.tag_catalog?.groups||{},error:active.error,saving:active.saving,notice:active.notice});
  syncToggle();icons();
 }
 function syncToggle(){
  const toolbar=document.querySelector('.classified-toolbar-right');if(!toolbar)return;
  let button=toolbar.querySelector('[data-details-action="toggle"]');
  if(!button){button=document.createElement('button');button.type='button';button.className='icon-button details-toggle';button.dataset.detailsAction='toggle';button.innerHTML=glyph('panel-right');toolbar.append(button);}
  button.setAttribute('aria-label',active?'收起详细信息':'展开详细信息');button.title='详细信息';button.setAttribute('aria-expanded',String(!!active));button.classList.toggle('selected',!!active);
  button.disabled=!active&&!document.querySelector('.classified-file[aria-pressed="true"]');
 }
 async function open(id){
  if(!id)return;
  if(active?.id===id){panel()?.querySelector('[data-details-action="close"]')?.focus();return;}
  if(!canDismiss())return;
  if(S.busy||S.threadBusy){toast('请等待当前操作完成。');return;}
  const own=++token;const data=await api(url(id));if(own!==token||!canDismiss())return;
  returnFocus=document.activeElement;
  active={id,owner:S.user?.id,data,draft:draftFromDetails(data),error:'',notice:'',saving:false};renderPanel();
 }
 async function openCurrent(){
  const id=currentResourceId(S.resources||[],S.course?.id,S.view==='note'?S.note?.id:null);
  if(!id){toast('这份资料暂不可用。');return;}await open(id);
 }
 async function save(){
  if(!active||active.saving)return;
  try{
   if(!hasChanges(active.data,active.draft)){renderPanel();return;}
   const own=active;own.saving=true;own.error='';own.notice='';renderPanel();
   try{
    const result=await api(url(own.id),buildPayload(own.draft,own.data.etag));
    if(active!==own)return;own.data=result;own.draft=draftFromDetails(result);own.notice='已保存';
    try{
     const state=await api('/api/state');Object.assign(S,{courses:state.courses,resources:state.resources,units:state.units,tag_catalog:state.tag_catalog});
     if(S.course)S.course=state.courses.find(c=>c.id===S.course.id)||S.course;
     if(['courses','library'].includes(S.view))render();
    }catch{/* Saving succeeded; the library can refresh on the next navigation. */}
   }catch(error){own.error=error.status===409?'信息已被更新。你的修改仍保留，可取消后重新打开核对。':error.message;}
   finally{own.saving=false;if(active===own)renderPanel();}
  }catch(error){setError(error.message);}
 }
 function install(){
  if(installed||root.StudyDemo?.active)return;installed=true;
  showResourceClassification=open;if(root.StudyUnits)root.StudyUnits.showTags=openCurrent;
  const baseRender=render,baseCanLeave=canLeave;
  render=function(){baseRender();if(active&&(!S.user||S.user.id!==active.owner))close(true);syncToggle();icons();};
  canLeave=function(){if(!canDismiss())return false;const allowed=baseCanLeave();if(allowed){++token;if(active)close(true);}return allowed;};
  document.addEventListener('click',async event=>{
   const button=event.target.closest('[data-details-action]');if(!button)return;
   event.preventDefault();event.stopImmediatePropagation();if(active?.saving)return;
   try{
    const action=button.dataset.detailsAction;
    if(action==='toggle'){if(active)close();else await open(document.querySelector('.classified-file[aria-pressed="true"]')?.dataset.id);return;}
    if(!active)return;
    if(action==='close'){close();return;}
    if(action==='cancel'){active.draft=draftFromDetails(active.data);active.error='';active.notice='';renderPanel();return;}
    if(action==='choose'){
     const key=button.dataset.key;setField(active.draft,key,button.dataset.value);refreshPicker(key);
     const picker=button.closest('.details-picker');for(const option of picker.querySelectorAll('[data-details-action="choose"]')){const selected=option===button;option.classList.toggle('selected',selected);option.setAttribute('aria-pressed',String(selected));}
     picker.open=false;picker.querySelector('summary')?.focus();
    }
   }catch(error){setError(error.message);}
  },true);
  document.addEventListener('input',event=>{
   if(!active)return;
   if(event.target.matches('[data-details-search]')){
    const query=event.target.value.trim().toLocaleLowerCase();for(const row of event.target.closest('.details-picker').querySelectorAll('.details-choice-row'))row.hidden=!row.textContent.toLocaleLowerCase().includes(query);return;
   }
   if(!event.target.matches('[data-details-field]'))return;
   try{setField(active.draft,event.target.dataset.detailsField,event.target.value);active.error='';refreshDraft();}catch(error){setError(error.message);}
  });
  document.addEventListener('change',event=>{
   if(!active)return;
   if(event.target.matches('select[data-details-field]')){setField(active.draft,event.target.dataset.detailsField,event.target.value);refreshDraft();}
   if(event.target.matches('[data-details-choice]')){
    const key=event.target.dataset.detailsChoice,value=key==='weeks'?Number(event.target.value):event.target.value;
    active.draft.tags[key]=active.draft.tags[key].filter(v=>v!==value);if(event.target.checked)active.draft.tags[key].push(value);
    if(key==='weeks')active.draft.tags[key].sort((a,b)=>a-b);refreshPicker(key);
   }
  });
  document.addEventListener('keydown',event=>{
   if(!active||modal.open)return;
   if(event.target.matches('[data-details-search]')&&['Enter','ArrowDown'].includes(event.key)){
    event.preventDefault();event.stopImmediatePropagation();
    const row=[...event.target.closest('.details-picker').querySelectorAll('.details-choice-row')].find(row=>!row.hidden);
    const target=row?.matches('button')?row:row?.querySelector('input');
    if(event.key==='ArrowDown')target?.focus();else if(event.target.value.trim())target?.click();return;
   }
   if(event.key==='Escape'&&panel()?.contains(event.target)){
    event.preventDefault();event.stopImmediatePropagation();const picker=event.target.closest('details[open]');if(picker)picker.removeAttribute('open');else close();
   }
  },true);
  document.addEventListener('submit',event=>{if(event.target.id==='material-details-form'){event.preventDefault();event.stopImmediatePropagation();save();}},true);
  document.addEventListener('toggle',event=>{
   if(!event.target.matches?.('.details-picker')||!event.target.open)return;
   const search=event.target.querySelector('[data-details-search]');if(search)search.value='';for(const row of event.target.querySelectorAll('.details-choice-row'))row.hidden=false;
   for(const other of panel()?.querySelectorAll('.details-picker[open]')||[])if(other!==event.target)other.open=false;
  },true);
  window.addEventListener('beforeunload',event=>{if(active&&(active.saving||isDirty())){event.preventDefault();event.returnValue='';}});
 }
 root.StudyDetails={install,open,openCurrent,close};
})(typeof window==='undefined'?{}:window);
