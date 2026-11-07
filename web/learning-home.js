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
 function importCourseOptions(){
  const doc=calendar?.document||{};
  const sources=new Set((doc.sources||[]).filter(source=>source.kind==='timetable').map(source=>source.id));
  const names=[
   ...(doc.timetable||[]).map(row=>row.course),
   ...(doc.events||[]).filter(row=>row.kind!=='exam'&&sources.has(row.source_id)).map(row=>row.title),
   ...S.courses.map(course=>courseTags(course).course)
  ];
  return [...new Set(names.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN')).slice(0,150)
   .map(name=>`<option value="${esc(name)}"></option>`).join('');
 }
 async function openImport(file,lesson=null){
  if(opening||S.busy||S.threadBusy||!file)return;
  if(!file.size||file.size>15*1024*1024){toast('请选择 15 MB 以内的非空课件。');return;}
  const preset={course:lesson?.course||'',weeks:lesson?.week!=null?String(lesson.week):'',class_type:lesson?.classType||''};
  const draft={file,lesson,preset,recognition:null,owner:S.user?.id};
  importDraft=draft;
  modalContent('确认课件归属',`<form id="learning-import-confirm">
   <p class="learning-import-filename">${icon('file-text')}<span>${esc(file.name)}</span></p>
   <p class="modal-description" data-import-status role="status">${lesson?`已按课表选定 ${esc(shortDate(lesson.date))} ${esc(lesson.time)} 的课程，请核对。`:'正在识别课件归属…'}</p>
   <label class="field"><span class="field-label">所属课程</span><input name="course" list="learning-import-courses" maxlength="150" placeholder="可留空"></label>
   <datalist id="learning-import-courses">${importCourseOptions()}</datalist>
   <div class="learning-import-fields">
    <label class="field"><span class="field-label">教学周</span><input name="weeks" maxlength="120" placeholder="如 8 或 8–10"></label>
    <label class="field"><span class="field-label">课堂类型</span><input name="class_type" maxlength="60" placeholder="如 Lecture"></label>
   </div>
   <p class="error-message" data-import-error role="alert"></p>
   <div class="modal-actions"><button type="button" class="outline-button" data-action="close-modal">取消</button><button type="submit" class="primary" ${lesson?'':'disabled'}>确认并开始学习</button></div>
  </form>`);
  const form=document.querySelector('#learning-import-confirm');
  if(!form)return;
  for(const [name,value] of Object.entries(preset))form.elements[name].value=value;
  if(lesson)return;
  const active=()=>importDraft===draft&&draft.owner===S.user?.id&&modal.open&&modal.contains(form);
  const status=form.querySelector('[data-import-status]');
  try{
   const encoded=await readUpload(file);
   if(!active())return;
   const result=await api('/api/library/recognize',{filename:file.name,file:encoded,learning_import:true});
   if(!active())return;
   draft.recognition=result;
   const matched=S.courses.find(course=>course.id===result.course_id);
   draft.preset={
    course:result.course_title||courseTags(matched||{}).course,
    weeks:result.fields?.weeks?.join('、')||'',
    class_type:result.fields?.class_type||''
   };
   for(const [name,value] of Object.entries(draft.preset)){
    if(!form.elements[name].dataset.edited)form.elements[name].value=value;
   }
   status.textContent=Object.values(draft.preset).some(Boolean)?'已填入识别建议，请核对后开始学习。':'没有识别到课程归属，可以填写或直接开始学习。';
  }catch(error){
   if(active())status.textContent='暂时无法识别课件归属，可以手动填写。';
  }finally{
   if(active())form.querySelector('button[type="submit"]').disabled=false;
  }
 }
 async function confirmImport(form){
  const draft=importDraft;
  if(!draft||draft.owner!==S.user?.id||opening||S.busy||S.threadBusy)return;
  const values=Object.fromEntries(['course','weeks','class_type'].map(name=>[name,form.elements[name].value.trim()]));
  const submit=form.querySelector('button[type="submit"]');
  const error=form.querySelector('[data-import-error]');
  if(submit.disabled)return;
  error.textContent='';
  try{
   const weeks=values.weeks?root.AcademicReferences.parseWeeks(values.weeks):[];
   const tags={...values,weeks};
   const data={tags,confirm_fields:Object.keys(tags)};
   if(draft.recognition)data.recognition=draft.recognition;
   const lesson=draft.lesson;
   if(lesson&&courseIdentity(tags.course)===courseIdentity(lesson.course)
    &&(lesson.week==null||weeks.length===1&&weeks[0]===lesson.week)
    &&(!lesson.classType||normalized(tags.class_type)===normalized(lesson.classType))){
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
 root.StudyLearningHome={markup,mount,install(){
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
  document.addEventListener('change',async event=>{if(!['learning-home-file','learning-lesson-file'].includes(event.target.id))return;const file=event.target.files[0];event.target.value='';if(file)await openImport(file,event.target.id==='learning-lesson-file'?selectedLesson:null);},true);
  document.addEventListener('input',event=>{if(event.target.form?.id==='learning-import-confirm')event.target.dataset.edited='true';if(event.target.id!=='learning-history-search')return;const start=event.target.selectionStart,end=event.target.selectionEnd;query=event.target.value;render();const next=document.querySelector('#learning-history-search');next?.focus();next?.setSelectionRange(start,end);},true);
  document.addEventListener('dragover',event=>{const target=event.target.closest('[data-learning-drop]');if(!target)return;event.preventDefault();target.classList.add('dragging');});
  document.addEventListener('dragleave',event=>{const target=event.target.closest('[data-learning-drop]');if(target&&!target.contains(event.relatedTarget))target.classList.remove('dragging');});
  document.addEventListener('drop',async event=>{const target=event.target.closest('[data-learning-drop]');if(!target)return;event.preventDefault();target.classList.remove('dragging');if(event.dataTransfer.files.length>1){toast('请每次导入一份课件。');return;}const file=event.dataTransfer.files[0];if(file)await openImport(file);});
 }};
})(typeof window==='undefined'?{}:window);
