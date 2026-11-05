/* Semester calendar: explicit week/date mappings, recurring classes and dated exams. */
(function(root){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const HOUR=48;
 const dayNames=['周一','周二','周三','周四','周五','周六','周日'];
 const dateOf=value=>new Date(value+'T12:00:00Z');
 const iso=d=>d.toISOString().slice(0,10);
 function addDays(value,n){const d=dateOf(value);d.setUTCDate(d.getUTCDate()+n);return iso(d);}
 function weekday(value){return (dateOf(value).getUTCDay()+6)%7;}
 const monday=value=>addDays(value,-weekday(value));
 function monthDays(value){const d=dateOf(value);d.setUTCDate(1);const first=iso(d),start=monday(first);d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);const count=Math.ceil((weekday(first)+d.getUTCDate())/7)*7;return Array.from({length:count},(_,i)=>addDays(start,i));}
 function moveMonth(value,n){const d=dateOf(value);d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);return iso(d);}
 function weekAt(t,day){return (t.calendar||[]).find(r=>r.kind==='teaching'&&r.start<=day&&r.end>=day)?.week??null;}
 function clockRange(value){
  const m=String(value).trim().match(/^(\d{1,2})[:：](\d{2})\s*(?:[-–—~至]|to)\s*(\d{1,2})[:：](\d{2})$/i);
  if(!m)return null;const [,a,b,c,d]=m.map(Number),start=a*60+b,end=c*60+d;
  return a<24&&c<24&&b<60&&d<60&&end>start?{start,end}:null;
 }
 const clock=value=>`${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
 function firstDate(t,today){
  if(weekAt(t,today)!==null)return today;
  return (t.calendar||[]).filter(r=>r.kind==='teaching').map(r=>r.start).sort()[0]||(t.events||[]).map(r=>r.date).sort()[0]||today;
 }
 function entriesForDay(t,day,genericWeek=null){
  const off=(t.calendar||[]).some(r=>['break','nonteaching'].includes(r.kind)&&r.start<=day&&r.end>=day);
  const w=genericWeek===null?(off?null:weekAt(t,day)):genericWeek,result=[];
  (t.timetable||[]).forEach((r,i)=>{
   if(r.weekday!==weekday(day)+1||w===null||r.weeks.length&&!r.weeks.includes(w))return;
   result.push({key:'timetable:'+i,title:r.course,subtitle:[r.class_type,r.location].filter(Boolean).join(' · '),time:r.time,range:clockRange(r.time),kind:'course'});
  });
  (t.calendar||[]).forEach((r,i)=>{if(r.kind!=='teaching'&&r.start<=day&&r.end>=day)result.push({key:'calendar:'+i,title:r.label||({break:'假期',exam:'考试',nonteaching:'其他安排'})[r.kind],subtitle:'',time:'',range:null,kind:r.kind});});
  (t.events||[]).forEach((r,i)=>{if(r.date===day)result.push({key:'events:'+i,title:r.title,subtitle:r.location,time:r.start?`${r.start}–${r.end}`:'',range:r.start?clockRange(`${r.start}–${r.end}`):null,kind:r.kind});});
  return result;
 }
 function timedLayout(entries){
  const sorted=entries.filter(r=>r.range).map(r=>({...r})).sort((a,b)=>a.range.start-b.range.start||a.range.end-b.range.end);
  let cluster=[],ends=[],until=-1;
  function flush(){for(const row of cluster)row.columns=ends.length;cluster=[];ends=[];}
  for(const row of sorted){if(row.range.start>=until){flush();until=-1;}let col=ends.findIndex(end=>end<=row.range.start);if(col<0)col=ends.length;ends[col]=row.range.end;row.column=col;cluster.push(row);until=Math.max(until,row.range.end);}
  flush();return sorted;
 }
 function tabsMarkup(mode){return `<div class="calendar-view-switch" aria-label="日历视图"><button type="button" data-calendar-action="view" data-view="week" aria-pressed="${mode==='week'}" class="${mode==='week'?'selected':''}">周</button><button type="button" data-calendar-action="view" data-view="month" aria-pressed="${mode==='month'}" class="${mode==='month'?'selected':''}">月</button></div>`;}
 if(typeof module!=='undefined'&&module.exports){module.exports={addDays,weekday,monday,monthDays,moveMonth,weekAt,clockRange,firstDate,entriesForDay,timedLayout};return;}
 const manager=()=>root.StudyAcademic?.manager(),term=()=>root.StudyAcademic?.currentTerm();
 const redraw=()=>root.StudyAcademic?.paint();
 function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
 function view(M=manager(),kind=M?.referenceTab){
  M.calendarViews||={};const key=M.selected+':'+kind,t=term();
  return M.calendarViews[key]||={cursor:firstDate(t,today()),mode:kind==='timetable'?'week':'month',week:[...new Set((t.timetable||[]).flatMap(r=>r.weeks))].sort((a,b)=>a-b)[0]||1,editor:null,error:''};
 }
 const button=(r,extra='')=>`<button type="button" class="calendar-entry ${r.kind==='exam'?'is-exam':''}" data-calendar-action="edit" data-entry="${esc(r.key)}" title="${esc([r.title,r.time,r.subtitle].filter(Boolean).join(' · '))}" ${extra}><strong>${esc(r.title)}</strong>${r.time?`<span>${esc(r.time)}</span>`:''}${r.subtitle?`<small>${esc(r.subtitle)}</small>`:''}</button>`;
 function monthMarkup(t,s){
  const dates=monthDays(s.cursor),month=s.cursor.slice(0,7);
  return `<div class="semester-month" style="--month-rows:${dates.length/7}" role="grid" aria-label="月历"><div class="month-weekdays"><span></span>${dayNames.map(n=>`<span>${n}</span>`).join('')}</div>${Array.from({length:dates.length/7},(_,row)=>{
   const days=dates.slice(row*7,row*7+7),periods=(t.calendar||[]).map((r,i)=>({r,i})).filter(({r})=>r.kind!=='teaching'&&r.start<=dates[row*7+6]&&r.end>=dates[row*7]),weekRows=(t.calendar||[]).map((r,i)=>({r,i})).filter(({r})=>r.kind==='teaching'&&r.start<=days[6]&&r.end>=days[0]);
   return `<div class="month-week" role="row"><div class="month-week-number">${weekRows.map(({r,i})=>`<button type="button" data-calendar-action="edit" data-entry="calendar:${i}" title="修改 Week ${r.week} 日期">Week ${r.week}</button>`).join('')}</div>${days.map(day=>{
    const entries=entriesForDay(t,day).filter(r=>!r.key.startsWith('calendar:'));
    return `<div class="calendar-day ${day.slice(0,7)!==month?'outside-month':''} ${day===today()?'is-today':''}" role="gridcell" data-calendar-day="${day}"><button type="button" class="calendar-date" data-calendar-action="new-date" data-date="${day}" aria-label="${day} 添加安排">${Number(day.slice(8))}</button><div class="month-day-entries" style="padding-top:${periods.length*20+3}px">${entries.slice(0,3).map(r=>button(r)).join('')}${entries.length>3?`<button type="button" class="calendar-more" data-calendar-action="day" data-date="${day}">查看当日</button>`:''}</div></div>`;
   }).join('')}<div class="month-period-lanes">${periods.map(({r,i},lane)=>{const first=Math.max(0,days.indexOf(r.start)),last=r.end>=days[6]?6:days.indexOf(r.end);return `<button type="button" class="calendar-period-entry" data-calendar-action="edit" data-entry="calendar:${i}" style="left:calc(${first/7*100}% + 3px);width:calc(${(last-first+1)/7*100}% - 6px);top:${lane*20}px">${esc(r.label||(({break:'假期',exam:'考试周',nonteaching:'其他安排'})[r.kind]))}</button>`;}).join('')}</div></div>`;
  }).join('')}</div>`;
 }
 function weekMarkup(t,s){
  const generic=!(t.calendar||[]).some(r=>r.kind==='teaching'),start=monday(s.cursor),dates=Array.from({length:7},(_,i)=>addDays(start,i));
  const entries=dates.map(day=>entriesForDay(t,day,generic?s.week:null));
  // With no school calendar, show the recurring pattern without inventing dates.
  if(generic)for(const rows of entries)for(let i=rows.length-1;i>=0;i--)if(rows[i].key.startsWith('events:')||rows[i].key.startsWith('calendar:'))rows.splice(i,1);
  const hasUntimed=entries.flat().some(r=>!r.range),timed=entries.flat().filter(r=>r.range),first=Math.min(8,...timed.map(r=>Math.floor(r.range.start/60))),last=Math.max(20,...timed.map(r=>Math.ceil(r.range.end/60))),height=(last-first)*HOUR;
  return `<div class="semester-week" aria-label="${generic?'每周课表':'周历'}"><div class="week-day-headings"><span>${generic?'':`Week ${weekAt(t,s.cursor)??'—'}`}</span>${dates.map((day,i)=>`<div class="${day===today()&&!generic?'is-today':''}"><span>${dayNames[i]}</span>${!generic?`<button type="button" data-calendar-action="new-date" data-date="${day}" aria-label="${day} 添加安排">${Number(day.slice(8))}</button>`:''}</div>`).join('')}</div>${hasUntimed?`<div class="week-all-day"><span>全天 / 节次</span>${entries.map(rows=>`<div>${rows.filter(r=>!r.range).map(r=>button(r)).join('')}</div>`).join('')}</div>`:''}<div class="week-time-scroll"><div class="week-time-grid" style="height:${height}px"><div class="week-hours">${Array.from({length:last-first+1},(_,i)=>`<span style="top:${i*HOUR}px">${String(i+first).padStart(2,'0')}:00</span>`).join('')}</div>${dates.map((day,i)=>`<div class="week-time-day" data-calendar-slot="${day}" data-grid-start="${first}" tabindex="0" role="gridcell" aria-label="${dayNames[i]}，点击添加课程">${Array.from({length:last-first},(_,h)=>`<div class="calendar-hour-line" style="top:${h*HOUR}px"></div>`).join('')}${timedLayout(entries[i]).map(r=>button(r,`style="top:${(r.range.start-first*60)/60*HOUR}px;height:${Math.max(24,(r.range.end-r.range.start)/60*HOUR)}px;left:calc(${r.column/r.columns*100}% + 3px);width:calc(${100/r.columns}% - 6px)"`)).join('')}</div>`).join('')}</div></div>${generic?'<p class="calendar-unmapped">尚未导入校历，当前显示每周排课。</p>':''}</div>`;
 }
 function field(name,label,value,type='text',extra=''){return `<label><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;}
 function editorMarkup(t,s){
  const e=s.editor;if(!e)return '';const r=e.draft;
  const select=(name,label,items,value)=>`<label><span>${label}</span><select name="${name}">${items.map(([id,n])=>`<option value="${id}" ${String(id)===String(value)?'selected':''}>${n}</option>`).join('')}</select></label>`;
  let body='';
  if(e.source==='timetable')body=field('course','课程归属',r.course,'text','list="schedule-course-options" maxlength="150" required')+field('class_type','课程类型',r.class_type,'text','list="schedule-type-options" maxlength="60"')+`<div class="calendar-editor-pair">${select('weekday','星期',dayNames.map((n,i)=>[i+1,n]),r.weekday)}${field('weeks','教学周',r._weeksText??root.AcademicReferences.formatWeeks(r.weeks),'text','placeholder="每周，如 1–6, 8–16"')}</div>`+field('time','时间 / 节次',r.time,'text','placeholder="09:00–10:00 或第1–2节" maxlength="80" required')+field('location','地点',r.location,'text','maxlength="120"');
  else if(e.source==='calendar')body=`<div class="calendar-editor-pair">${select('kind','类型',[['teaching','教学周'],['break','假期'],['exam','考试周'],['nonteaching','其他安排']],r.kind)}${field('week','教学周',r.week,'number','min="1" max="60"')}</div><div class="calendar-editor-pair">${field('start','开始日期',r.start,'date','required')}${field('end','结束日期',r.end,'date','required')}</div>`+field('label','备注',r.label,'text','maxlength="80"');
  else body=field('title','名称',r.title,'text','maxlength="150" required')+`<div class="calendar-editor-pair">${select('kind','类型',[['exam','考试'],['event','事项']],r.kind)}${field('date','日期',r.date,'date','required')}</div><div class="calendar-editor-pair">${field('start','开始时间',r.start,'time')}${field('end','结束时间',r.end,'time')}</div>`+field('location','地点',r.location,'text','maxlength="120"');
  return `<div class="calendar-editor-shade"><section class="calendar-event-editor" role="dialog" aria-modal="true" aria-label="${e.source==='timetable'?'课程安排':e.source==='calendar'?'校历安排':'日历安排'}"><header><span>${e.source==='timetable'?'课程安排':e.source==='calendar'?'校历安排':'日历安排'}</span><button type="button" class="icon-button" data-calendar-action="close-editor" aria-label="关闭编辑">${icon('x')}</button></header><form id="calendar-event-form">${body}<p class="error-message" role="alert" ${s.error?'':'hidden'}>${esc(s.error)}</p><footer>${e.index>=0?`<button type="button" class="icon-button calendar-delete" data-calendar-action="delete" aria-label="删除这项安排" title="删除">${icon('trash-2')}</button>`:'<span></span>'}<button type="submit" class="outline-button">完成</button></footer></form></section></div>`;
 }
 function markup(M,t,kind,{tools='',importPanel='',message=''}={}){
  const s=view(M,kind),generic=s.mode==='week'&&!(t.calendar||[]).some(r=>r.kind==='teaching'),date=dateOf(s.cursor),allWeeks=[...new Set([...(t.calendar||[]).filter(r=>r.week).map(r=>r.week),...(t.timetable||[]).flatMap(r=>r.weeks)])].sort((a,b)=>a-b);
  const title=generic?'每周课表':`${date.getUTCFullYear()}年 <strong>${date.getUTCMonth()+1}月</strong>`;
  return `<section class="academic-calendar" aria-label="学期日历"><header class="calendar-toolbar"><div class="calendar-period">${title}${generic?`<select aria-label="查看教学周" data-calendar-week>${(allWeeks.length?allWeeks:[1]).map(w=>`<option value="${w}" ${s.week===w?'selected':''}>Week ${w}</option>`).join('')}</select>`:''}</div><div class="calendar-toolbar-actions">${tabsMarkup(s.mode)}<div class="calendar-date-nav"><button type="button" class="icon-button" data-calendar-action="previous" aria-label="上${s.mode==='month'?'个月':'一周'}" ${generic?'disabled':''}>${icon('chevron-left')}</button><button type="button" data-calendar-action="today" ${generic?'disabled':''}>今天</button><button type="button" class="icon-button" data-calendar-action="next" aria-label="下${s.mode==='month'?'个月':'一周'}" ${generic?'disabled':''}>${icon('chevron-right')}</button></div>${tools}</div></header>${importPanel}${message}${s.mode==='month'?monthMarkup(t,s):weekMarkup(t,s)}${editorMarkup(t,s)}</section>`;
 }
 function open(source,index,draft){const s=view();if(s.editor?.dirty){s.error='请先完成或取消当前编辑。';redraw();return;}s.error='';s.editor={source,index,draft:structuredClone(draft),dirty:false};redraw();document.querySelector('#calendar-event-form input')?.focus();}
 function applyEditor(form){
  const M=manager(),t=term(),s=view(),e=s.editor;if(!e)return;const d=Object.fromEntries(new FormData(form));let row;
  if(e.source==='timetable'){
   if(!d.course.trim()||!d.time.trim())throw new Error('请填写课程和上课时间。');
   row={course:d.course.trim(),class_type:d.class_type.trim(),weekday:Number(d.weekday),time:d.time.trim(),weeks:root.AcademicReferences.parseWeeks(d.weeks),location:d.location.trim()};
  }else if(e.source==='calendar'){
   if(!d.start||!d.end||d.end<d.start)throw new Error('请填写有效的起止日期。');
   const week=d.week?Number(d.week):null;if(d.kind==='teaching'&&(!Number.isInteger(week)||week<1||week>60))throw new Error('请填写教学周（1–60）。');
   if(d.kind==='teaching'&&(dateOf(d.end)-dateOf(d.start))/86400000>6)throw new Error('请将每个教学周分别记录，最多 7 天。');
   if((t.calendar||[]).some((r,i)=>i!==e.index&&r.kind==='teaching'&&d.kind==='teaching'&&r.start<=d.end&&r.end>=d.start))throw new Error('日期与已有教学周重叠。');
   row={kind:d.kind,week,start:d.start,end:d.end,label:d.label.trim()};
  }else{
   if(!d.title.trim()||!d.date)throw new Error('请填写名称和日期。');
   if((d.start||d.end)&&(!d.start||!d.end||d.end<=d.start))throw new Error('请填写有效的起止时间；全天安排可同时留空。');
   row={id:e.draft.id||crypto.randomUUID(),title:d.title.trim(),kind:d.kind,date:d.date,start:d.start,end:d.end,location:d.location.trim()};
  }
  t[e.source]||=[];if(e.index<0)t[e.source].push(row);else t[e.source][e.index]=row;
  if(e.source==='timetable'&&!M.assignments[row.course])M.assignments[row.course]=M.selected;
  if(e.source==='events')s.cursor=row.date;
  s.editor=null;s.error='';redraw();
 }
 function newDate(day){open('events',-1,{id:'',title:'',date:day,kind:'exam',start:'',end:'',location:''});}
 root.AcademicCalendar={markup,pending:M=>Object.values(M?.calendarViews||{}).some(v=>v.editor?.dirty),reset(M,kind){delete M.calendarViews?.[M.selected+':'+kind];},add(){const M=manager(),s=view();if(M.referenceTab==='timetable')open('timetable',-1,{course:'',class_type:'',weekday:weekday(s.cursor)+1,time:'09:00–10:00',weeks:[],location:''});else newDate(s.cursor);}};
 document.addEventListener('click',event=>{
  if(!manager()||!term())return;const node=event.target.closest('[data-calendar-action]');
  if(node){
   event.preventDefault();event.stopImmediatePropagation();if(root.AcademicReferences.busy(manager())||manager().saving)return;
   const s=view(),t=term(),action=node.dataset.calendarAction;
   if(s.editor?.dirty&&!['close-editor','delete'].includes(action)){s.error='请先完成或取消当前编辑。';redraw();return;}
   node.closest('.calendar-new-menu')?.removeAttribute('open');
   if(action==='add-range'){const last=(t.calendar||[]).filter(r=>r.kind==='teaching').sort((a,b)=>a.end.localeCompare(b.end)).at(-1),start=last?addDays(last.end,1):monday(s.cursor);open('calendar',-1,{kind:'teaching',week:last?last.week+1:1,start,end:addDays(start,6),label:''});}
   else if(action==='view'){s.mode=node.dataset.view;redraw();}
   else if(action==='previous'||action==='next'){s.cursor=s.mode==='month'?moveMonth(s.cursor,action==='next'?1:-1):addDays(s.cursor,action==='next'?7:-7);redraw();}
   else if(action==='today'){s.cursor=today();redraw();}
   else if(action==='new-date')newDate(node.dataset.date);
   else if(action==='day'){s.cursor=node.dataset.date;s.mode='week';redraw();}
   else if(action==='edit'){const [source,index]=node.dataset.entry.split(':');open(source,Number(index),t[source][Number(index)]);}
   else if(action==='close-editor'){s.editor=null;s.error='';redraw();}
   else if(action==='delete'){const e=s.editor;t[e.source].splice(e.index,1);s.editor=null;redraw();}
   return;
  }
  const slot=event.target.closest('[data-calendar-slot]'),day=event.target.closest('[data-calendar-day]');
  if(slot){
   event.preventDefault();const s=view();if(s.editor)return;
   const offset=event.clientY-slot.getBoundingClientRect().top,start=event.detail===0?9*60:Math.max(0,Math.min(23*60,Math.floor((Number(slot.dataset.gridStart)*60+offset/HOUR*60)/30)*30));
   if(manager().referenceTab==='calendar')open('events',-1,{id:'',title:'',date:slot.dataset.calendarSlot,kind:'exam',start:clock(start),end:clock(Math.min(1439,start+60)),location:''});
   else open('timetable',-1,{course:'',class_type:'',weekday:weekday(slot.dataset.calendarSlot)+1,time:`${clock(start)}–${clock(Math.min(1439,start+60))}`,weeks:[],location:''});
  }else if(day&&!view().editor)newDate(day.dataset.calendarDay);
 },true);
 document.addEventListener('submit',event=>{if(event.target.id!=='calendar-event-form')return;event.preventDefault();event.stopImmediatePropagation();try{applyEditor(event.target);}catch(e){const s=view();s.error=e.message;const error=event.target.querySelector('[role="alert"]');error.hidden=false;error.textContent=e.message;}} ,true);
 document.addEventListener('input',event=>{if(event.target.closest('#calendar-event-form')){const e=view().editor,{name,value}=event.target;e.dirty=true;if(name==='weeks')e.draft._weeksText=value;else e.draft[name]=['weekday','week'].includes(name)?value?Number(value):null:value;root.StudyAcademic.refreshActions();}});
 document.addEventListener('change',event=>{if(event.target.hasAttribute('data-calendar-week')){view().week=Number(event.target.value);redraw();}});
 document.addEventListener('pointerdown',event=>{for(const menu of document.querySelectorAll('.calendar-source-menu[open],.calendar-new-menu[open]'))if(!menu.contains(event.target))menu.removeAttribute('open');},true);
 document.addEventListener('keydown',event=>{if(!document.querySelector('.academic-calendar'))return;if(event.key==='Escape')document.querySelectorAll('.calendar-source-menu[open],.calendar-new-menu[open]').forEach(menu=>menu.removeAttribute('open'));if(event.key==='Escape'&&manager()&&view().editor){event.preventDefault();view().editor=null;redraw();}else if(event.key==='Enter'&&event.target.hasAttribute('data-calendar-slot')){event.preventDefault();event.target.click();}});
})(typeof window==='undefined'?{}:window);
