/* Start learning from an import or a recent conversation, without browsing folders. */
(function(root){
 'use strict';
 function records(courses,entries,{query=''}={}){
  const byId=new Map(courses.map(c=>[c.id,c])),seen=new Set(),rows=[];
  for(const row of entries){
   const course=byId.get(row.unit_id),identity=course?'unit:'+course.id:row.id;if(seen.has(identity))continue;seen.add(identity);
   if(row.available===false||course?.status==='completed')continue;
   const block=course?((course.status!=='planning'&&course.blocks?.find(b=>b.id===course.active&&!course.completed?.includes(b.id)))||course.blocks?.find(b=>!course.completed?.includes(b.id))):null;
   const location=course?.status==='planning'?'待开始':block?.title||(course?.blocks?.length&&course.blocks.every(b=>course.completed?.includes(b.id))?'待整理笔记':'尚未开始');
   const title=course?.title||row.title.replace(/\.(md|txt|pdf|pptx|docx)$/i,'');
   const keywords=[title,row.course,row.class_type,...(row.weeks||[]).map(w=>'Week '+w)].join(' ').toLocaleLowerCase();
   if(!query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).every(q=>keywords.includes(q)))continue;
   rows.push({...row,title,location,updated:course?.updated_at||course?.created_at||row.created_at||''});
  }
  return rows.sort((a,b)=>b.updated.localeCompare(a.updated)||a.title.localeCompare(b.title,'zh-CN',{numeric:true}));
 }
 const normalized=value=>String(value||'').trim().toLowerCase();
 function courseIdentity(value){
  const name=normalized(value);
  return name.match(/^[a-z]{2,6}\s*\d{2,4}(?![a-z0-9])/)?.[0].replace(/\s/g,'')||name;
 }
 function lessonKey(lesson){
  return JSON.stringify([lesson.date,courseIdentity(lesson.course),normalized(lesson.time),normalized(lesson.classType??lesson.class_type)]);
 }
 function courseTags(course){
  return {
   course:course.tags?.course||course.course_label||'',
   weeks:course.tags?.weeks??course.weeks??(course.week?[course.week]:[]),
   classType:course.tags?.class_type||course.class_type||''
  };
 }
 function matchesLesson(course,lesson){
  if(course.demo)return false;
  if(course.scheduled_lesson)return lessonKey(course.scheduled_lesson)===lessonKey(lesson);
  const tags=courseTags(course);
  return lesson.week!=null&&tags.weeks.includes(lesson.week)&&courseIdentity(tags.course)===courseIdentity(lesson.course)
   &&(!lesson.classType||normalized(tags.classType)===normalized(lesson.classType));
 }
 function isComplete(course){
  return course.status==='completed'||Boolean(course.blocks?.length&&course.blocks.every(block=>course.completed?.includes(block.id)));
 }
 function markCompleted(week,courses,calendarRows=[]){
  const lessons=week.days.flatMap(day=>day.classes),completed=new Set();
  for(const course of courses){
   if(!isComplete(course))continue;
   const matches=lessons.filter(lesson=>{
    if(!matchesLesson(course,lesson))return false;
    return course.scheduled_lesson||!calendarRows.some(row=>row.kind==='teaching'&&row.week===lesson.week&&(row.start>week.end||row.end<week.start));
   });
   if(matches.length===1)completed.add(lessonKey(matches[0]));
  }
  return {...week,days:week.days.map(day=>({...day,classes:day.classes.map(lesson=>({...lesson,completed:completed.has(lessonKey(lesson))}))}))};
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={records,markCompleted};return;}
 let owner='',query='',expanded=false,opening=false,calendar=null,request=null,selectedLesson=null,weekCursor=null,importDraft=null;
 function resetOwner(){const next=S.user?.id||'guest';if(next===owner)return;owner=next;query='';expanded=false;calendar=null;request=null;selectedLesson=null;weekCursor=null;importDraft=null;}
 const weekView=date=>calendar?.document&&root.AcademicCalendar.learningWeek(calendar.document,date||weekCursor||root.AcademicCalendar.today());
 const shortDate=date=>date.slice(5).split('-').map(Number).join('/');
 function dateRange(start,end){
  const [year,month,day]=start.split('-').map(Number);
  const [endYear,endMonth,endDay]=end.split('-').map(Number);
  const first=`${year}年${month}月${day}日`;
  const last=endYear!==year?`${endYear}年${endMonth}月${endDay}日`:endMonth!==month?`${endMonth}月${endDay}日`:`${endDay}日`;
  return first+'–'+last;
 }
 function weekMarkup(){
  if(calendar?.error)return '<header><h2>周课表</h2><button type="button" class="outline-button" data-learning-action="refresh-week">重新加载</button></header><p class="learning-week-empty">暂时无法读取日历。</p>';
  const week=weekView();if(!week)return '';
  const today=root.AcademicCalendar.today(),label=root.AcademicCalendar.teachingWeekLabel(week.weeks);
  const hasClasses=week.days.some(day=>day.classes.length);
  return `<header>
   <div class="learning-week-title">
    <div class="learning-week-heading"><h2 aria-live="polite">${dateRange(week.start,week.end)}</h2>${label?`<span>${label}</span>`:''}</div>
    ${hasClasses?'<p>点课程卡片，导入课件或继续学习。</p>':''}
   </div>
   <div class="calendar-date-nav" aria-label="切换周课表">
    <button type="button" class="icon-button" data-learning-action="previous-week" aria-label="上一周">${icon('chevron-left')}</button>
    <button type="button" data-learning-action="current-week">本周</button>
    <button type="button" class="icon-button" data-learning-action="next-week" aria-label="下一周">${icon('chevron-right')}</button>
   </div>
  </header>${hasClasses?'':'<p class="learning-week-empty">这一周没有安排课程。</p>'}${root.AcademicCalendar.learningWeekGrid(markCompleted(week,S.courses,calendar.document.calendar),today)}`;
 }
 function paintWeek(focusAction){
  const region=document.querySelector('#learning-current-week');
  if(!region)return;
  region.innerHTML=weekMarkup();
  region.hidden=false;
  icons();
  if(focusAction)region.querySelector(`[data-learning-action="${focusAction}"]`)?.focus({preventScroll:true});
 }
 async function mount(){
  resetOwner();if(S.demonstration||request)return;
  const id=owner,token={};request=token;
  try{const doc=await api('/api/calendar');if(request===token&&id===S.user?.id)calendar={document:doc};}
  catch{if(request===token&&id===S.user?.id)calendar={error:true};}
  finally{
   if(request===token){
    request=null;
    if(id===S.user?.id)paintWeek();
   }
  }
 }
 function showLesson(lesson){
  selectedLesson=lesson;
  const courses=S.courses.filter(course=>matchesLesson(course,lesson));
  const related=courses.map(course=>course.status==='completed'
   ?`<div class="learning-week-done">${icon('check')}<span>已学完 · ${esc(course.title)}</span></div>`
   :`<button type="button" class="outline-button" data-learning-action="resume-lesson" data-id="${esc(course.id)}">${isComplete(course)?'整理笔记':'继续学习'} · ${esc(course.title)}</button>`).join('');
  const details=[shortDate(lesson.date),lesson.time,lesson.week!=null?root.AcademicCalendar.teachingWeekLabel([lesson.week]):'',lesson.classType,lesson.location].filter(Boolean);
  modalContent(esc(lesson.course),`<p class="modal-description">${esc(details.join(' · '))}</p>
   ${related?`<div class="learning-week-resume">${related}</div>`:''}
   <div class="modal-actions">
    <button type="button" class="primary" data-learning-action="choose-lesson">${icon('plus')}导入课件</button>
    <input type="file" id="learning-lesson-file" accept=".pdf,.ppt,.pptx,.doc,.docx,.md,.txt,.png,.jpg,.jpeg,.webp" hidden>
   </div>`);
 }
 function markup({scope,entries}){
  resetOwner();const filtered=entries,available=records(S.courses,filtered),items=records(S.courses,filtered,{query}),visible=expanded||query?items:items.slice(0,5),empty=!available.length&&!query;
  const search=`<label class="learning-history-search">${icon('search')}<input id="learning-history-search" aria-label="搜索学习记录" placeholder="搜索学习记录" value="${esc(query)}"></label>`;
  const rows=visible.map(r=>{
   const location=['待开始','尚未开始'].includes(r.location)?'待开始':r.location==='待整理笔记'?r.location:'接着学：'+r.location;
   return `<button type="button" class="learning-record" data-action="nav-select" data-id="${esc(r.id)}" aria-label="${esc(r.title)}" aria-haspopup="menu"><span class="learning-record-mark">${icon('messages-square')}</span><span class="learning-record-title"><strong>${esc(r.title)}</strong><small><span class="learning-record-course">${esc(r.course||'未设置课程')}</span><span class="learning-record-location">${esc(location)}</span></small></span>${icon('arrow-up-right')}</button>`;
  }).join('');
  const timetable=S.demonstration?'':`<section id="learning-current-week" class="learning-week" aria-label="周课表" ${calendar?'':'hidden'}>${weekMarkup()}</section>`;
  const upload=`<section class="learning-import" aria-label="导入课件" data-learning-drop>
   <div class="learning-import-copy"><h1>导入课件</h1><p>选择或拖入课件，识别后确认课程。</p></div>
   <button type="button" class="outline-button learning-choose" data-learning-action="choose" title="PDF、PPTX、Word、文字或图片，最大 15 MB">${icon('plus')}选择课件</button>
   <input id="learning-home-file" type="file" aria-label="选择新课件" accept=".pdf,.ppt,.pptx,.doc,.docx,.md,.txt,.png,.jpg,.jpeg,.webp" hidden>
  </section>`;
  const more=!expanded&&!query&&items.length>5?'<button type="button" class="learning-more" data-learning-action="more">显示更多</button>':'';
  const recents=empty?'':`<section class="learning-recents" aria-label="学习记录">
   <header><h2>继续学习</h2>${search}</header>
   <div class="learning-record-list">${rows||'<p class="learning-no-records">没有找到相关记录</p>'}</div>${more}
  </section>`;
  return `<section class="learning-home has-learning" aria-label="学习首页"><div class="learning-home-content">${timetable}${upload}${recents}</div></section>`;
 }
 const classTypes=['Lecture','Tutorial','Lab','Seminar','Workshop','Exercise','Exam'];
 const customType='__custom__';
 const options=values=>values.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');
 function importType(fields){
  return (fields.class_type_choice.value===customType?fields.class_type_custom.value:fields.class_type_choice.value).trim();
 }
 function showImportTemplate(form){
  const hint=form.querySelector('[data-import-template]');
  const name=root.StudyTemplates?.templateName(importType(form.elements));
  hint.hidden=!name;
  hint.textContent=name?'讲解与笔记 · '+name:'';
 }
 function setImportType(form,type){
  const select=form.elements.class_type_choice;
  if(type&&!Array.from(select.options).some(option=>option.value===type))select.add(new Option(type,type),select.options.length-1);
  select.value=type;
  form.elements.class_type_custom.hidden=true;
 }
 async function openImport(file,lesson=null){
  if(opening||S.busy||S.threadBusy||!file)return;
  if(!file.size||file.size>15*1024*1024){toast('请选择 15 MB 以内的非空课件。');return;}
  const courses=calendar?.document?.course_choices||[];
  const timetableTypes=(calendar?.document?.timetable||[]).map(row=>row.class_type).filter(Boolean);
  const types=Array.from(new Map([...timetableTypes,...classTypes].map(type=>[normalized(type),type])).values());
  const preset={course:lesson?courses.find(course=>courseIdentity(course)===courseIdentity(lesson.course))||'':'',weeks:lesson?.week!=null?String(lesson.week):'',class_type:lesson?.classType||''};
  const draft={file,lesson,preset,courses,recognition:null,owner:S.user?.id};
  importDraft=draft;
  modalContent('确认课件归属',`<form id="learning-import-confirm">
   <p class="learning-import-filename">${icon('file-text')}<span>${esc(file.name)}</span></p>
   <p class="modal-description" data-import-status role="status">${preset.course?'已选中课表课程，正在识别课件信息…':'正在识别课件并匹配课表…'}</p>
   <label class="field"><span class="field-label">所属课程</span><select name="course" class="learning-import-select">
    <option value="">${courses.length?'选择课表课程':'暂无已导入的课表课程'}</option>${options(courses)}
   </select></label>
   <div class="learning-import-fields">
    <label class="field"><span class="field-label">教学周</span><input name="weeks" maxlength="120" placeholder="如 8 或 8–10"></label>
    <label class="field"><span class="field-label">课程类型</span>
     <select name="class_type_choice" class="learning-import-select"><option value="">选择类型（可选）</option>${options(types)}<option value="${customType}">自定义…</option></select>
     <input name="class_type_custom" aria-label="自定义课程类型" maxlength="60" placeholder="输入课程类型" hidden>
    </label>
   </div>
   <p class="learning-import-template muted" data-import-template hidden></p>
   <p class="error-message" data-import-error role="alert"></p>
   <div class="modal-actions"><button type="button" class="outline-button" data-action="close-modal">取消</button><button type="submit" class="primary" >确认并开始学习</button></div>
  </form>`);
  const form=document.querySelector('#learning-import-confirm');
  if(!form)return;
  form.elements.course.value=preset.course;
  form.elements.weeks.value=preset.weeks;
  setImportType(form,preset.class_type);
  const active=()=>importDraft===draft&&draft.owner===S.user?.id&&modal.open&&modal.contains(form);
  root.StudyTemplates?.prepare().then(doc=>{if(doc&&active())showImportTemplate(form);});
  const status=form.querySelector('[data-import-status]');
  try{
   const encoded=await readUpload(file);
   if(!active())return;
   const result=await api('/api/library/recognize',{filename:file.name,file:encoded,learning_import:true});
   if(!active())return;
   draft.recognition=result;
   const courseField=form.elements.course;
   if(Array.isArray(result.course_choices)){
    const current=courseField.value;
    draft.courses=result.course_choices;
    courseField.innerHTML=`<option value="">${draft.courses.length?'选择课表课程':'暂无已导入的课表课程'}</option>${options(draft.courses)}`;
    courseField.value=draft.courses.includes(current)?current:'';
   }
   const recognizedCourse=draft.courses.includes(result.course_title)?result.course_title:'';
   draft.preset={
    course:draft.courses.includes(preset.course)?preset.course:recognizedCourse,
    weeks:preset.weeks||result.fields?.weeks?.join('、')||'',
    class_type:preset.class_type||result.fields?.class_type||''
   };
   if(!courseField.dataset.edited)courseField.value=draft.preset.course;
   if(!form.elements.weeks.dataset.edited)form.elements.weeks.value=draft.preset.weeks;
   if(!form.elements.class_type_choice.dataset.edited)setImportType(form,draft.preset.class_type);
   showImportTemplate(form);
   const conflicting=recognizedCourse&&preset.course&&recognizedCourse!==preset.course;
   const hint=conflicting?`课件匹配到 ${recognizedCourse}，请核对所选课表课程。`
    :recognizedCourse?'已按课表匹配课件，请核对。'
    :preset.course?'已带入所选课表课程，请核对教学周和课程类型。'
    :draft.courses.length?'没有匹配到课表课程，请从下拉列表选择。':'请先导入课表，或暂时按未归类课件学习。';
   status.textContent=[result.notice,hint].filter(Boolean).join(' ');
  }catch(error){
   if(active())status.textContent=`${error.message||'课件识别暂时不可用。'} 请核对课程和类型后继续。`;
  }
 }
 async function confirmImport(form){
  const draft=importDraft;
  if(!draft||draft.owner!==S.user?.id||opening||S.busy||S.threadBusy)return;
  const fields=form.elements;
  const chosenType=fields.class_type_choice.value;
  const values={course:fields.course.value,weeks:fields.weeks.value.trim(),
   class_type:importType(fields)};
  const submit=form.querySelector('button[type="submit"]');
  const error=form.querySelector('[data-import-error]');
  if(submit.disabled)return;
  error.textContent='';
  try{
   if(draft.courses.length&&!draft.courses.includes(values.course))throw new Error('请从已导入的课表选择课程。');
   if(chosenType===customType&&!values.class_type)throw new Error('请输入自定义课程类型。');
   const weeks=values.weeks?root.AcademicReferences.parseWeeks(values.weeks):[];
   const tags={...values,weeks};
   const data={tags,confirm_fields:Object.keys(tags),learning_import:true};
   if(draft.recognition)data.recognition=draft.recognition;
   const lesson=draft.lesson;
   if(lesson&&courseIdentity(tags.course)===courseIdentity(lesson.course)&&(lesson.week==null||weeks.length===1&&weeks[0]===lesson.week)){
    data.scheduled_lesson={date:lesson.date,course:lesson.course,time:lesson.time,class_type:lesson.classType};
    if(weeks.length===1||tags.class_type)data.sessions=[{week:weeks[0]??null,class_type:tags.class_type}];
   }else if(values.weeks!==draft.preset.weeks||values.class_type!==draft.preset.class_type){
    data.sessions=[];
   }
   opening=true;
   submit.disabled=true;
   await root.StudyUnits.importFile(draft.file,data);
  }catch(failure){error.textContent=failure.message;}
  finally{opening=false;submit.disabled=false;}
 }
 root.StudyLearningHome={markup,mount,updateCalendar(doc){
  resetOwner();request=null;calendar={document:doc};paintWeek();
 },install(){
  document.addEventListener('submit',async event=>{
   if(event.target.id!=='learning-import-confirm')return;
   event.preventDefault();
   event.stopImmediatePropagation();
   await confirmImport(event.target);
  },true);
  document.addEventListener('close',event=>{if(event.target.id==='modal'&&!event.target.open)importDraft=null;},true);
  document.addEventListener('click',async event=>{const button=event.target.closest('[data-learning-action]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();if(S.busy||S.threadBusy)return;
   if(button.dataset.learningAction==='choose')document.querySelector('#learning-home-file')?.click();
   else if(button.dataset.learningAction==='lesson'){
    const lesson=weekView(button.dataset.date)?.days.find(d=>d.date===button.dataset.date)?.classes[Number(button.dataset.index)];
    if(lesson)showLesson(lesson);
   }
   else if(button.dataset.learningAction==='choose-lesson')document.querySelector('#learning-lesson-file')?.click();
   else if(button.dataset.learningAction==='resume-lesson'){modal.close();await loadCourse(button.dataset.id);}
   else if(['previous-week','current-week','next-week'].includes(button.dataset.learningAction)){
    const action=button.dataset.learningAction;
    weekCursor=action==='current-week'?null:root.AcademicCalendar.addDays(weekView().start,action==='previous-week'?-7:7);
    paintWeek(action);
   }
   else if(button.dataset.learningAction==='refresh-week')await mount();
   else if(button.dataset.learningAction==='more'){expanded=true;render();}
  },true);
  document.addEventListener('change',async event=>{
   const input=event.target;
   if(input.form?.id==='learning-import-confirm'){
    input.dataset.edited='true';
    if(input.name==='class_type_choice'){
     const custom=input.form.elements.class_type_custom;
     custom.hidden=input.value!==customType;
     if(!custom.hidden)custom.focus();
     showImportTemplate(input.form);
    }
    return;
   }
   if(!['learning-home-file','learning-lesson-file'].includes(input.id))return;
   const file=input.files[0];input.value='';
   if(file)await openImport(file,input.id==='learning-lesson-file'?selectedLesson:null);
  },true);
  document.addEventListener('input',event=>{const input=event.target;if(input.form?.id==='learning-import-confirm'){input.dataset.edited='true';if(input.name==='class_type_custom')showImportTemplate(input.form);}if(input.id!=='learning-history-search')return;const start=input.selectionStart,end=input.selectionEnd;query=input.value;render();const next=document.querySelector('#learning-history-search');next?.focus();next?.setSelectionRange(start,end);},true);
  document.addEventListener('dragover',event=>{const target=event.target.closest('[data-learning-drop]');if(!target)return;event.preventDefault();target.classList.add('dragging');});
  document.addEventListener('dragleave',event=>{const target=event.target.closest('[data-learning-drop]');if(target&&!target.contains(event.relatedTarget))target.classList.remove('dragging');});
  document.addEventListener('drop',async event=>{const target=event.target.closest('[data-learning-drop]');if(!target)return;event.preventDefault();target.classList.remove('dragging');if(event.dataTransfer.files.length>1){toast('请每次导入一份课件。');return;}const file=event.dataTransfer.files[0];if(file)await openImport(file);});
 }};
})(typeof window==='undefined'?{}:window);
