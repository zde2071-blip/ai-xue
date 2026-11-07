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
 function lessonImport(lesson){
  const {course,week,classType}=lesson;
  const tags={course};
  if(week!=null)tags.weeks=[week];
  if(classType)tags.class_type=classType;
  return {tags,confirm_fields:Object.keys(tags),...(week!=null||classType?{sessions:[{week,class_type:classType}]}:{})};
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={records,lessonImport};return;}
 let owner='',query='',expanded=false,opening=false,calendar=null,request=null,selectedLesson=null;
 function resetOwner(){const next=S.user?.id||'guest';if(next===owner)return;owner=next;query='';expanded=false;calendar=null;request=null;selectedLesson=null;}
 const weekView=()=>calendar?.document&&root.AcademicCalendar.learningWeek(calendar.document,root.AcademicCalendar.today());
 const shortDate=date=>date.slice(5).split('-').map(Number).join('/');
 function weekMarkup(){
  if(calendar?.error)return '<header><h2>本周课程</h2><button type="button" class="outline-button" data-learning-action="refresh-week">重新加载</button></header><p class="learning-week-empty">暂时无法读取日历。</p>';
  const week=weekView();if(!week)return '';
  const today=root.AcademicCalendar.today(),label=root.AcademicCalendar.teachingWeekLabel(week.weeks);
  const rows=week.days.filter(d=>d.classes.length).map(d=>`<li class="learning-week-day"><div class="learning-week-date" ${d.date===today?'aria-current="date"':''}>${d.label} <time datetime="${d.date}">${shortDate(d.date)}</time>${d.date===today?'<small>今天</small>':''}</div><div class="learning-week-lessons">${d.classes.map((c,i)=>`<button type="button" class="learning-week-lesson" data-learning-action="lesson" data-date="${d.date}" data-index="${i}" aria-haspopup="dialog"><span class="learning-week-time">${esc(c.time||'全天')}</span><span class="learning-week-class"><strong>${esc(c.course)}</strong>${c.classType||c.location?`<small>${esc([c.classType,c.location].filter(Boolean).join(' · '))}</small>`:''}</span>${icon('chevron-right')}</button>`).join('')}</div></li>`).join('');
  return `<header><h2>本周课程</h2><span>${[label,shortDate(week.start)+'–'+shortDate(week.end)].filter(Boolean).join(' · ')}</span></header>${rows?`<ul>${rows}</ul>`:`<p class="learning-week-empty">${label?'本周没有安排课程。':'本周没有可显示的课程，可在学习设置的日历中添加课表和校历。'}</p>`}`;
 }
 async function mount(){
  resetOwner();if(S.demonstration||request)return;
  const id=owner,token={};request=token;
  try{const doc=await api('/api/calendar');if(request===token&&id===S.user?.id)calendar={document:doc};}
  catch{if(request===token&&id===S.user?.id)calendar={error:true};}
  finally{
   if(request===token){
    request=null;
    const region=document.querySelector('#learning-current-week');
    if(id===S.user?.id&&region){region.innerHTML=weekMarkup();region.hidden=false;icons();}
   }
  }
 }
 function showLesson(lesson){
  selectedLesson=lesson;
  const normalize=value=>String(value||'').trim().toLowerCase();
  const identity=value=>{const name=normalize(value);return name.match(/^[a-z]{2,6}\s*\d{2,4}(?![a-z0-9])/)?.[0].replace(/\s/g,'')||name;};
  const courses=S.courses.filter(c=>{
   if(c.status==='completed'||lesson.week==null)return false;
   const tags=c.tags||{},type=tags.class_type||c.class_type;
   return identity(tags.course||c.course_label)===identity(lesson.course)&&(tags.weeks||c.weeks||[]).includes(lesson.week)&&(!lesson.classType||normalize(type)===normalize(lesson.classType));
  });
  const details=[shortDate(lesson.date),lesson.time,lesson.week!=null?root.AcademicCalendar.teachingWeekLabel([lesson.week]):'',lesson.classType].filter(Boolean);
  modalContent(esc(lesson.course),`<p class="modal-description">${esc(details.join(' · '))}</p>${courses.length?`<div class="learning-week-resume">${courses.map(c=>`<button type="button" class="outline-button" data-learning-action="resume-lesson" data-id="${esc(c.id)}">继续学习 · ${esc(c.title)}</button>`).join('')}</div>`:''}<div class="modal-actions"><button type="button" class="primary" data-learning-action="choose-lesson">${icon('plus')}选择课件</button><input type="file" id="learning-lesson-file" accept=".pdf,.ppt,.pptx,.doc,.docx,.md,.txt,.png,.jpg,.jpeg,.webp" hidden></div>`);
 }
 function markup({scope,entries}){
  resetOwner();const filtered=entries,available=records(S.courses,filtered),items=records(S.courses,filtered,{query}),visible=expanded||query?items:items.slice(0,5),empty=!available.length&&!query;
  const search=`<label class="learning-history-search">${icon('search')}<input id="learning-history-search" aria-label="搜索学习记录" placeholder="搜索学习记录" value="${esc(query)}"></label>`;
  const rows=visible.map(r=>{
   const location=['待开始','尚未开始'].includes(r.location)?'待开始':r.location==='待整理笔记'?r.location:'接着学：'+r.location;
   return `<button type="button" class="learning-record" data-action="nav-select" data-id="${esc(r.id)}" aria-label="${esc(r.title)}" aria-haspopup="menu"><span class="learning-record-mark">${icon('messages-square')}</span><span class="learning-record-title"><strong>${esc(r.title)}</strong><small><span class="learning-record-course">${esc(r.course||'未设置课程')}</span><span class="learning-record-location">${esc(location)}</span></small></span>${icon('arrow-up-right')}</button>`;
  }).join('');
  return `<section class="learning-home has-learning" aria-label="学习首页"><header class="learning-home-toolbar">${search}</header><div class="learning-home-content"><section class="learning-import" aria-label="导入课件" data-learning-drop><div class="learning-import-copy"><h1>导入课件</h1><p>将课件拖到这里</p></div><button type="button" class="outline-button learning-choose" data-learning-action="choose" title="PDF、PPTX、Word、文字或图片，最大 15 MB">${icon('plus')}选择课件</button><input id="learning-home-file" type="file" aria-label="选择新课件" accept=".pdf,.ppt,.pptx,.doc,.docx,.md,.txt,.png,.jpg,.jpeg,.webp" hidden></section>${S.demonstration?'':`<section id="learning-current-week" class="learning-week" aria-label="本周课程" ${calendar?'':'hidden'}>${weekMarkup()}</section>`}${empty?'':`<section class="learning-recents" aria-label="学习记录"><header><h2>继续学习</h2></header><div class="learning-record-list">${rows||`<p class="learning-no-records">${query?'没有找到相关记录':'暂无未完成的学习'}</p>`}</div>${!expanded&&!query&&items.length>5?'<button type="button" class="learning-more" data-learning-action="more">显示更多</button>':''}</section>`}</div></section>`;
 }
 async function openImport(file,lesson=null){
  if(opening||S.busy||S.threadBusy)return;opening=true;
  try{
   if(file&&(!file.size||file.size>15*1024*1024))throw new Error('请选择 15 MB 以内的非空课件。');
   await root.StudyUnits.importFile(file,lesson?lessonImport(lesson):{});
  }catch(error){toast(error.message);}finally{opening=false;}
 }
 root.StudyLearningHome={markup,mount,install(){
  document.addEventListener('click',async event=>{const button=event.target.closest('[data-learning-action]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();if(S.busy||S.threadBusy)return;
   if(button.dataset.learningAction==='choose')document.querySelector('#learning-home-file')?.click();
   else if(button.dataset.learningAction==='lesson'){
    const lesson=weekView()?.days.find(d=>d.date===button.dataset.date)?.classes[Number(button.dataset.index)];
    if(lesson)showLesson(lesson);
   }
   else if(button.dataset.learningAction==='choose-lesson')document.querySelector('#learning-lesson-file')?.click();
   else if(button.dataset.learningAction==='resume-lesson'){modal.close();await loadCourse(button.dataset.id);}
   else if(button.dataset.learningAction==='refresh-week')await mount();
   else if(button.dataset.learningAction==='more'){expanded=true;render();}
  },true);
  document.addEventListener('change',async event=>{if(!['learning-home-file','learning-lesson-file'].includes(event.target.id))return;const file=event.target.files[0];event.target.value='';if(file)await openImport(file,event.target.id==='learning-lesson-file'?selectedLesson:null);},true);
  document.addEventListener('input',event=>{if(event.target.id!=='learning-history-search')return;const start=event.target.selectionStart,end=event.target.selectionEnd;query=event.target.value;render();const next=document.querySelector('#learning-history-search');next?.focus();next?.setSelectionRange(start,end);},true);
  document.addEventListener('dragover',event=>{const target=event.target.closest('[data-learning-drop]');if(!target)return;event.preventDefault();target.classList.add('dragging');});
  document.addEventListener('dragleave',event=>{const target=event.target.closest('[data-learning-drop]');if(target&&!target.contains(event.relatedTarget))target.classList.remove('dragging');});
  document.addEventListener('drop',async event=>{const target=event.target.closest('[data-learning-drop]');if(!target)return;event.preventDefault();target.classList.remove('dragging');if(event.dataTransfer.files.length>1){toast('请每次导入一份课件。');return;}const file=event.dataTransfer.files[0];if(file)await openImport(file);});
 }};
})(typeof window==='undefined'?{}:window);
