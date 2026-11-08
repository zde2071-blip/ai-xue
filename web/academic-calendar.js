/* Semester calendar: explicit week/date mappings, recurring classes and dated exams. */
(function(root){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const HOUR=64;
 const defaultColors={calendar:'#808080',timetable:'#548568',exam:'#a07848'};
 const palette=['#808080','#548568','#527eac','#8070a0','#b16c79','#a07848','#b47c4c','#555555'];
 const validColor=v=>/^#[0-9a-f]{6}$/i.test(v||'');
 const categoryOf=(source,kind)=>source==='events'||kind==='exam'?'exam':source;
 function localSource(t,key){
  const rows=['calendar','timetable','events'].flatMap(field=>(t[field]||[]).filter(row=>!row.source_id&&!row.calendar_group&&categoryOf(field,row.kind)===key));
  if(!rows.length)return null;
  return {name:'手动添加',origin:'在日历中手动添加的安排'};
 }
 function removeCalendarSource(t,id,isSource=true){
  if(isSource&&!t.sources?.some(source=>source.id===id))return;
  for(const field of ['calendar','timetable','events'])t[field]=(t[field]||[]).filter(row=>isSource?row.source_id!==id:!!row.source_id||categoryOf(field,row.kind)!==id);
  if(isSource)t.sources=t.sources.filter(source=>source.id!==id);
 }
 const sourceOf=(t,row)=>(t.sources||[]).find(s=>s.id===row.source_id);
 const editorCategory=(t,source,row)=>{const kind=sourceOf(t,row)?.kind;return kind==='exam'?'events':kind||source;};
 const shown=(t,row,category)=>row.source_id?sourceOf(t,row)?.visible!==false:t.visible?.[category]!==false;
 function colorFor(t,source,row){const key=categoryOf(source,row.kind),group=sourceOf(t,row);return validColor(row.color)?row.color:group?(group.color||t.colors?.[group.kind]||defaultColors[group.kind]):validColor(t.colors?.[key])?t.colors[key]:defaultColors[key]||defaultColors.calendar;}
 function colorStyle(color){if(!validColor(color))color=defaultColors.calendar;const ink='#'+[1,3,5].map(i=>Math.round(parseInt(color.slice(i,i+2),16)*.56).toString(16).padStart(2,'0')).join('');return `--event-color:${color};--event-bg:${color}18;--event-ink:${ink};`;}
 function colorPicker(value,attributes,automatic=false){return `<div class="calendar-color-picker">${automatic?`<button type="button" class="color-auto ${!value?'selected':''}" ${attributes} data-color="" aria-pressed="${!value}">跟随分类</button>`:''}<div class="calendar-color-swatches">${palette.map(c=>`<button type="button" class="calendar-swatch ${value===c?'selected':''}" style="--swatch:${c}" ${attributes} data-color="${c}" aria-label="颜色 ${c}" aria-pressed="${value===c}"></button>`).join('')}<label class="calendar-custom-color" title="自选颜色"><input type="color" value="${validColor(value)?value:'#808080'}" ${attributes} aria-label="自选颜色"><span>＋</span></label></div></div>`;}
 const dayNames=['周一','周二','周三','周四','周五','周六','周日'];
 const dateOf=value=>new Date(value+'T12:00:00Z');
 const iso=d=>d.toISOString().slice(0,10);
 function addDays(value,n){const d=dateOf(value);d.setUTCDate(d.getUTCDate()+n);return iso(d);}
 function weekday(value){return (dateOf(value).getUTCDay()+6)%7;}
 const monday=value=>addDays(value,-weekday(value));
 function monthDays(value){const d=dateOf(value);d.setUTCDate(1);const first=iso(d),start=monday(first);d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);const count=Math.ceil((weekday(first)+d.getUTCDate())/7)*7;return Array.from({length:count},(_,i)=>addDays(start,i));}
 function moveMonth(value,n){const d=dateOf(value);d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);return iso(d);}
 function weekAt(t,day,group=null){return (t.calendar||[]).find(r=>r.kind==='teaching'&&(group===null||(r.calendar_group||'')===group)&&r.start<=day&&r.end>=day)?.week??null;}
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
 function importedDate(kind,rows,current){
  if(kind==='timetable')return current;
  if(rows.some(r=>(r.date||r.start)<=current&&(r.date||r.end)>=current))return current;
  return rows.map(r=>r.date||r.start).filter(Boolean).sort()[0]||current;
 }
 function currentTeachingWeeks(t,day){
  const start=monday(day),end=addDays(start,6);
  return [...new Set((t.calendar||[]).filter(r=>r.kind==='teaching'&&r.week!=null&&r.start<=end&&r.end>=start).map(r=>r.week))].sort((a,b)=>a-b);
 }
 function teachingWeekLabel(weeks){return weeks.length?'第 '+weeks.join('、')+' 教学周':'';}
 function classWeek(t,row,day,fallback){
  const group=row.calendar_group||'';
  return (t.calendar||[]).some(c=>c.kind==='teaching'&&(c.calendar_group||'')===group)?weekAt(t,day,group):fallback;
 }
 function learningWeek(t,day){
  const start=monday(day),end=addDays(start,6),weeks=currentTeachingWeeks(t,day),days=[];
  const sources=new Map((t.sources||[]).map(r=>[r.id,r]));
  for(let i=0;i<7;i++){
   const date=addDays(start,i),week=weekAt(t,date),classes=[];
   const off=(t.calendar||[]).some(r=>['break','nonteaching'].includes(r.kind)&&sources.get(r.source_id)?.type!=='subscription'&&r.start<=date&&r.end>=date);
   for(const r of t.timetable||[]){
    const mapped=classWeek(t,r,date,week);
    if(off||r.weekday!==i+1||mapped===null||(r.weeks?.length&&!r.weeks.includes(mapped))||sources.get(r.source_id)?.visible===false)continue;
    classes.push({course:r.course,date,week:mapped,classType:r.class_type||'',time:r.time,location:r.location||'',color:colorFor(t,'timetable',r)});
   }
   for(const r of t.events||[]){
    const source=sources.get(r.source_id);
    if(r.date!==date||r.kind==='exam'||source?.kind!=='timetable'||source.visible===false)continue;
    classes.push({course:r.title,date,week,classType:'',time:r.start?(r.end?r.start+'–'+r.end:r.start):'',location:r.location||'',color:colorFor(t,'events',r)});
   }
   const seen=new Set();
   days.push({date,label:dayNames[i],classes:classes.filter(r=>{
    const key=JSON.stringify([r.course.trim().toLowerCase(),r.week,r.classType,clockRange(r.time)||r.time]);
    if(seen.has(key))return false;seen.add(key);return true;
   }).sort((a,b)=>(clockRange(a.time)?.start??1440)-(clockRange(b.time)?.start??1440)||a.course.localeCompare(b.course,'zh-CN'))});
  }
  return {start,end,weeks,days};
 }
 function entriesForDay(t,day,genericWeek=null){
  const off=(t.calendar||[]).some(r=>['break','nonteaching'].includes(r.kind)&&sourceOf(t,r)?.type!=='subscription'&&r.start<=day&&r.end>=day);
  const w=genericWeek===null?(off?null:weekAt(t,day)):genericWeek,result=[];
  (t.timetable||[]).forEach((r,i)=>{
   const mapped=classWeek(t,r,day,w);
   if(!shown(t,r,'timetable')||off||r.weekday!==weekday(day)+1||mapped===null||r.weeks.length&&!r.weeks.includes(mapped))return;
   result.push({key:'timetable:'+i,title:r.course,subtitle:[r.class_type,r.location].filter(Boolean).join(' · '),time:r.time,range:clockRange(r.time),kind:'course',color:colorFor(t,'timetable',r)});
  });
  (t.calendar||[]).forEach((r,i)=>{if(r.kind!=='teaching'&&shown(t,r,r.kind==='exam'?'exam':'calendar')&&r.start<=day&&r.end>=day)result.push({key:'calendar:'+i,title:r.label||({break:'假期',exam:'考试',nonteaching:'其他安排'})[r.kind],subtitle:'',time:'',range:null,kind:r.kind,color:colorFor(t,'calendar',r)});});
  (t.events||[]).forEach((r,i)=>{if(shown(t,r,'exam')&&r.date===day)result.push({key:'events:'+i,title:r.title,subtitle:r.location,time:r.start?`${r.start}–${r.end}`:'',range:r.start?clockRange(`${r.start}–${r.end}`):null,kind:r.kind,color:colorFor(t,'events',r)});});
  return result;
 }
 function timedLayout(entries,minimumMinutes=0){
  const sorted=entries.filter(r=>r.range).map(r=>({...r})).sort((a,b)=>a.range.start-b.range.start||a.range.end-b.range.end);
  let cluster=[],ends=[],until=-1;
  function flush(){for(const row of cluster)row.columns=ends.length;cluster=[];ends=[];}
  for(const row of sorted){
   const {start,end}=row.range;
   const displayEnd=Math.max(end,start+minimumMinutes);
   if(start>=until){flush();until=-1;}
   let col=ends.findIndex(end=>end<=start);
   if(col<0)col=ends.length;
   ends[col]=displayEnd;
   row.column=col;
   cluster.push(row);
   until=Math.max(until,displayEnd);
  }
  flush();return sorted;
 }
 function tabsMarkup(mode){return `<div class="calendar-view-switch" aria-label="日历视图">${[['day','日'],['week','周'],['month','月'],['year','年']].map(([key,label])=>`<button type="button" data-calendar-action="view" data-view="${key}" aria-pressed="${mode===key}" class="${mode===key?'selected':''}">${label}</button>`).join('')}</div>`;}
 if(typeof module!=='undefined'&&module.exports){module.exports={addDays,weekday,monday,monthDays,moveMonth,weekAt,clockRange,firstDate,entriesForDay,timedLayout,periodLanes,colorFor,colorStyle,localSource,removeCalendarSource,importedDate,editorCategory,learningWeek,learningWeekGrid};return;}
 const manager=()=>root.StudySchedule?.manager(),term=manager;
 const redraw=()=>root.StudySchedule?.paint();
 function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
 function view(M=manager()){
  const t=M;
  return M.calendarView||={cursor:firstDate(t,today()),mode:'month',week:[...new Set((t.timetable||[]).flatMap(r=>r.weeks))].sort((a,b)=>a-b)[0]||1,editor:null,error:''};
 }
 function entryButton(entry,layout,attributes,{label=entry.title,showTime=true}={}){
  const classes=['calendar-entry'];
  if(entry.kind==='exam')classes.push('is-exam');
  if(entry.range&&entry.range.end-entry.range.start<45)classes.push('is-short');
  if(entry.completed)classes.push('learning-lesson-complete');
  const title=[entry.title,entry.time,entry.subtitle,entry.completed?'已学完课件':''].filter(Boolean).join(' · ');
  const completion=entry.completed?'<i data-lucide="check" class="learning-lesson-check" aria-hidden="true"></i>':'';
  return `<button type="button" class="${classes.join(' ')}" ${attributes} ${entry.completed||!showTime?`aria-label="${esc(title)}"`:''} title="${esc(title)}" style="${colorStyle(entry.color)}${layout}"><strong>${esc(label)}</strong>${showTime&&entry.time?`<span>${esc(entry.time)}</span>`:''}${entry.subtitle?`<small>${esc(entry.subtitle)}</small>`:''}${completion}</button>`;
 }
 const button=(entry,layout='')=>entryButton(entry,layout,`data-calendar-action="edit" data-entry="${esc(entry.key)}"`);

 function weekGrid(dates,entries,{currentDate,renderDay,dayAttributes=()=>'',renderEntry,hourHeight=HOUR,fitHours=false}){
  const all=entries.flat(),timed=all.filter(entry=>entry.range);
  const headings=dates.map(day=>`<div class="${day===currentDate?'is-today':''}"><span>${dayNames[weekday(day)]}</span>${renderDay(day)}</div>`).join('');
  const allDay=all.some(entry=>!entry.range)
   ?`<div class="week-all-day"><span>全天 / 节次</span>${entries.map(rows=>`<div>${rows.filter(entry=>!entry.range).map(entry=>renderEntry(entry,'')).join('')}</div>`).join('')}</div>`:'';
  const header=`<div class="week-day-headings"><span></span>${headings}</div>${allDay}`;
  if(fitHours&&!timed.length)return header;

  const first=Math.min(fitHours?24:8,...timed.map(entry=>Math.floor(entry.range.start/60)));
  const last=Math.max(fitHours?0:20,...timed.map(entry=>Math.ceil(entry.range.end/60)));
  const minimumMinutes=fitHours?24*60/hourHeight:0;
  const durationHeight=(last-first)*hourHeight;
  const gridHeight=fitHours?Math.max(durationHeight,...timed.map(entry=>((entry.range.start-first*60)/60)*hourHeight+24)):durationHeight;
  const hourLabels=Array.from({length:last-first+1},(_,i)=>`<span style="top:${i*hourHeight}px">${String(first+i).padStart(2,'0')}:00</span>`).join('');
  const hourLines=Array.from({length:last-first},(_,i)=>`<div class="calendar-hour-line" style="top:${i*hourHeight}px"></div>`).join('');
  const columns=dates.map((day,index)=>{
   const events=timedLayout(entries[index],minimumMinutes).map(entry=>{
    const top=(entry.range.start-first*60)/60*hourHeight;
    const height=Math.max(24,(entry.range.end-entry.range.start)/60*hourHeight);
    const style=`top:${top}px;height:${height}px;left:calc(${entry.column/entry.columns*100}% + 3px);width:calc(${100/entry.columns}% - 6px)`;
    return renderEntry(entry,style);
   }).join('');
   return `<div class="week-time-day" ${dayAttributes(day,first)}>${hourLines}${events}</div>`;
  }).join('');
  return `${header}<div class="week-time-scroll"><div class="week-time-grid" style="height:${gridHeight}px"><div class="week-hours">${hourLabels}</div>${columns}</div></div>`;
 }
 function learningWeekGrid(week,currentDate){
  const dates=week.days.map(day=>day.date);
  const entries=week.days.map(day=>day.classes.map((lesson,index)=>({
   ...lesson,index,title:lesson.course,subtitle:lesson.classType,range:clockRange(lesson.time)
  })));
  const grid=weekGrid(dates,entries,{
   currentDate,hourHeight:36,fitHours:true,
   renderDay:day=>`<time datetime="${day}" ${day===currentDate?'aria-current="date"':''}>${Number(day.slice(8))}</time>`,
   renderEntry:(entry,layout)=>{
    const code=entry.title.trim().match(/^[a-z]{2,6}\s*\d{2,4}(?![a-z0-9])/i)?.[0];
    const label=code?code.replace(/\s/g,'').toUpperCase():entry.title;
    return entryButton(entry,layout,`data-learning-action="lesson" data-date="${entry.date}" data-index="${entry.index}" aria-haspopup="dialog"`,{label,showTime:false});
   }
  });
  return `<div class="learning-week-scroll"><div class="semester-week" aria-label="周课表">${grid}</div></div>`;
 }

 function periodLanes(t,days){
  const rows=(t.calendar||[]).map((r,i)=>({...r,key:'calendar:'+i,color:colorFor(t,'calendar',r)})).filter(r=>shown(t,r,r.kind==='exam'?'exam':'calendar')&&r.start<=days[days.length-1]&&r.end>=days[0]);
  const lanes=[];
  return rows.sort((a,b)=>a.start.localeCompare(b.start)||b.end.localeCompare(a.end)).map(r=>{
   const first=r.start>days[0]?r.start:days[0],last=r.end<days[days.length-1]?r.end:days[days.length-1];let lane=lanes.findIndex(end=>end<first);if(lane<0)lane=lanes.length;lanes[lane]=last;
   return {...r,lane,left:days.indexOf(first),span:days.indexOf(last)-days.indexOf(first)+1};
  });
 }
 function periodsMarkup(rows){return rows.map(r=>`<button type="button" class="calendar-period-entry ${r.kind==='teaching'?'teaching-period':''}" data-calendar-action="edit" data-entry="${r.key}" style="${colorStyle(r.color)}grid-column:${r.left+1}/span ${r.span};grid-row:${r.lane+1}" title="${esc(r.start+' — '+r.end)}">${esc(r.kind==='teaching'?'Week '+r.week:r.label||({break:'假期',exam:'考试',nonteaching:'其他安排'})[r.kind])}</button>`).join('');}
 function monthMarkup(t,s){
  const dates=monthDays(s.cursor),month=s.cursor.slice(0,7);
  return `<div class="semester-month" style="--month-rows:${dates.length/7}" role="grid" aria-label="月历"><div class="month-weekdays">${dayNames.map(n=>`<span>${n}</span>`).join('')}</div>${Array.from({length:dates.length/7},(_,row)=>{
   const days=dates.slice(row*7,row*7+7),periods=periodLanes(t,days),laneCount=Math.max(0,...periods.map(r=>r.lane+1));
   return `<div class="month-week" role="row">${days.map(day=>{
    const entries=entriesForDay(t,day).filter(r=>!r.key.startsWith('calendar:'));
    return `<div class="calendar-day ${day.slice(0,7)!==month?'outside-month':''} ${day===today()?'is-today':''}" role="gridcell" data-calendar-day="${day}"><button type="button" class="calendar-date" data-calendar-action="day" data-date="${day}" aria-label="查看 ${day}">${Number(day.slice(8))}</button><div class="month-day-entries" style="padding-top:${laneCount*22+6}px">${entries.slice(0,3).map(r=>button({...r,time:r.time.split(/[–—-]/)[0]})).join('')}${entries.length>3?`<button type="button" class="calendar-more" data-calendar-action="day" data-date="${day}">+${entries.length-3} 个</button>`:''}</div></div>`;
   }).join('')}<div class="month-period-lanes">${periodsMarkup(periods)}</div></div>`;
  }).join('')}</div>`;
 }
 function weekMarkup(t,s){
  const dayView=s.mode==='day';
  const generic=!!t.timetable?.length&&!(t.calendar||[]).some(r=>r.kind==='teaching')&&!(t.events||[]).length,start=dayView?s.cursor:monday(s.cursor),dates=Array.from({length:dayView?1:7},(_,i)=>addDays(start,i));
  const entries=dates.map(day=>entriesForDay(t,day,generic?s.week:null).filter(entry=>!entry.key.startsWith('calendar:')));
  const periods=periodLanes(t,dates);
  const grid=weekGrid(dates,entries,{
   currentDate:generic?null:today(),
   renderDay:day=>generic?'':`<button type="button" data-calendar-action="day" data-date="${day}" aria-label="查看 ${day}">${Number(day.slice(8))}</button>`,
   dayAttributes:(day,first)=>`data-calendar-slot="${day}" data-grid-start="${first}" tabindex="0" role="gridcell" aria-label="${dayNames[weekday(day)]}，点击添加课程"`,
   renderEntry:button
  });
  return `<div class="semester-week ${dayView?'is-day-view':''}" style="--day-count:${dates.length}" aria-label="${dayView?'日历':generic?'每周课表':'周历'}">${periods.length?`<div class="week-period-row"><span></span><div class="week-period-lanes">${periodsMarkup(periods)}</div></div>`:''}${grid}${generic?'<p class="calendar-unmapped">尚未导入校历，当前显示每周排课。</p>':''}</div>`;

 }
 function field(name,label,value,type='text',extra=''){return `<label><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;}
 function editorMarkup(t,s){
  const e=s.editor;if(!e)return '';const r=e.draft;
  const originals=root.AcademicReferences.originalLinks(t,sourceOf(t,r));
  const select=(name,label,items,value)=>`<label><span>${label}</span><select name="${name}">${items.map(([id,n])=>`<option value="${id}" ${String(id)===String(value)?'selected':''}>${n}</option>`).join('')}</select></label>`;
  const choice=(name,label,value,values)=>{
   const options=[...new Set([...values,value].filter(Boolean))];
   if(r['_custom_'+name])return `<label><span>${label}</span><div class="calendar-custom-choice"><input name="${name}" aria-label="${label}" value="${esc(value)}" maxlength="${name==='course'?150:60}" ${name==='course'?'required':''}><button type="button" data-calendar-action="existing-choice" data-field="${name}" aria-label="选择已有${label}" title="选择已有${label}">${icon('chevron-down')}</button></div></label>`;
   return `<label><span>${label}</span><select name="${name}" data-calendar-choice ${name==='course'?'required':''}><option value="">选择${label}</option>${options.map(v=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(v)}</option>`).join('')}<option value="__new_calendar_value__">输入新的${label}…</option></select></label>`;
  };
  let body='';
  const contentCategory=editorCategory(t,e.source,r);
  let category=select('category','内容',[['calendar','校历'],['timetable','课表'],['events','考试信息']],contentCategory);
  if(r.source_id)category=category.replace('<select ','<select disabled ');
  if(e.source==='timetable')body=choice('course','课程归属',r.course,[...(S.tag_catalog?.groups?.course||[]),...(t.timetable||[]).map(row=>row.course)])+choice('class_type','课程类型',r.class_type,[...(S.tag_catalog?.groups?.class_type||[]),...(t.timetable||[]).map(row=>row.class_type)])+`<div class="calendar-editor-pair">${select('weekday','星期',dayNames.map((n,i)=>[i+1,n]),r.weekday)}${field('weeks','教学周',r._weeksText??root.AcademicReferences.formatWeeks(r.weeks),'text','placeholder="每周，如 1–6, 8–16"')}</div>`+field('time','时间 / 节次',r.time,'text','placeholder="09:00–10:00 或第1–2节" maxlength="80" required')+field('location','地点',r.location,'text','maxlength="120"');
  else if(e.source==='calendar')body=`<div class="calendar-editor-pair">${select('kind','类型',[['teaching','教学周'],['break','假期'],['exam','考试周'],['nonteaching','其他安排']],r.kind)}${r.kind==='teaching'?field('week','教学周',r.week,'number','min="1" max="60"'):''}</div><div class="calendar-editor-pair">${field('start','开始日期',r.start,'date','required')}${field('end','结束日期',r.end,'date','required')}</div>`+field('label','备注',r.label,'text','maxlength="80"');
  else body=field('title',contentCategory==='timetable'?'课程':'名称',r.title,'text','maxlength="150" required')+`<input type="hidden" name="kind" value="${r.kind||'exam'}">${field('date','日期',r.date,'date','required')}<div class="calendar-editor-pair">${field('start','开始时间',r.start,'time')}${field('end','结束时间',r.end,'time')}</div>`+field('location','地点',r.location,'text','maxlength="120"');
  return `<aside class="calendar-event-editor" aria-label="编辑日历安排"><header><span>${contentCategory==='timetable'?'课程安排':contentCategory==='calendar'?'校历安排':'日历安排'}</span><button type="button" class="icon-button" data-calendar-action="close-editor" aria-label="关闭编辑">${icon('x')}</button></header><form id="calendar-event-form">${category}${body}${originals}<div class="calendar-editor-color"><span>颜色</span>${colorPicker(r.color||'','data-calendar-editor-color',true)}</div><p class="error-message" role="alert" ${s.error?'':'hidden'}>${esc(s.error)}</p><footer>${e.index>=0?`<button type="button" class="outline-button calendar-delete" data-calendar-action="delete" aria-label="删除这项安排" title="删除">${icon('trash-2')}删除</button>`:'<span></span>'}<button type="submit" class="outline-button">完成</button></footer></form></aside>`;
 }
 function yearMarkup(t,s){
  const year=dateOf(s.cursor).getUTCFullYear();
  return `<div class="calendar-year" aria-label="年历">${Array.from({length:12},(_,i)=>{
   const month=`${year}-${String(i+1).padStart(2,'0')}`,days=monthDays(month+'-01');
   return `<section class="year-month"><button class="year-month-title" data-calendar-action="month" data-date="${month}-01">${i+1}月</button><div class="year-month-grid">${dayNames.map(n=>`<span>${n.slice(1)}</span>`).join('')}${days.map(day=>day.startsWith(month)?`<button class="${day===today()?'is-today':''} ${entriesForDay(t,day).length?'has-events':''}" data-calendar-action="day" data-date="${day}" aria-label="查看 ${day}">${Number(day.slice(8))}</button>`:'<span></span>').join('')}</div></section>`;
  }).join('')}</div>`;
 }
 function sourceRow(t,id,name,color,checked,source=false){
  const attr=source?`data-calendar-source="${esc(id)}"`:`data-calendar-filter="${id}"`;
  return `<div class="calendar-source-row"><label style="--swatch:${color}"><input type="checkbox" ${attr} ${checked?'checked':''}><span title="${esc(name)}">${esc(name)}</span></label><button type="button" class="calendar-source-settings-button" data-calendar-action="source-settings" data-source-id="${esc(id)}" data-is-source="${source}" aria-label="设置${esc(name)}" title="日历设置">${icon('ellipsis')}</button></div>`;
 }
 function sourceSettingsMarkup(t,s){
  const e=s.sourceEditor;if(!e)return '';const d=e.draft,originals=root.AcademicReferences.originalLinks(t,d),names={calendar:'校历',timetable:'课表',exam:'考试信息'};
  return `<div class="calendar-editor-shade"><section class="academic-reference-import calendar-source-settings" role="dialog" aria-modal="true" aria-label="日历设置"><header><span>日历设置</span><button type="button" class="icon-button" data-calendar-action="close-source-settings" aria-label="关闭日历设置" ${e.busy?'disabled':''}>${icon('x')}</button></header><form id="calendar-source-settings-form"><fieldset ${e.busy?'disabled':''}>${e.isSource?`<label class="source-settings-field"><span>名称</span><input name="name" value="${esc(d.name)}" maxlength="150" required></label>`:''}<label class="source-settings-field"><span>分类</span><select name="kind" ${e.isSource&&!d.handbook?'':'disabled'}>${Object.entries(names).map(([key,name])=>`<option value="${key}" ${d.kind===key?'selected':''}>${name}</option>`).join('')}</select></label><div class="source-settings-field"><span>来源</span><span class="source-settings-value">${d.type==='subscription'?'链接订阅':d.handbook?'Module Handbook':d.type==='import'?'导入资料':esc(localSource(t,e.id)?.origin||'未标注来源')}</span></div>${d.type==='subscription'?`<label class="source-settings-field"><span>订阅 URL</span><input name="url" value="${esc(d.url)}" placeholder="https:// 或 webcal://" autocomplete="off" required></label><div class="source-settings-refresh"><button type="button" class="outline-button" data-calendar-action="refresh-source-settings">${icon('refresh-cw')}${e.busy?'正在读取…':'读取订阅更新'}</button>${d.updated_at?`<span>上次读取 ${esc(new Date(d.updated_at).toLocaleString('zh-CN',{hour12:false}))}</span>`:''}</div>`:''}<div class="source-settings-field source-settings-colors"><span>颜色</span>${colorPicker(d.color,'data-source-settings-color')}</div><label class="source-settings-visible"><input type="checkbox" name="visible" ${d.visible!==false?'checked':''}><span>在日历中显示</span></label></fieldset>${originals}${d.handbook?root.AcademicReferences.handbookDetails(d.handbook,!originals):''}<p class="error-message" role="alert" ${e.error?'':'hidden'}>${esc(e.error)}</p><p class="source-settings-notice" role="status" ${e.notice?'':'hidden'}>${esc(e.notice)}</p><footer><button type="button" class="outline-button source-settings-delete" data-calendar-action="delete-source" title="删除这份日历及其中的安排，保存后生效" ${e.busy?'disabled':''}>${icon('trash-2')}删除日历</button><button type="button" class="outline-button" data-calendar-action="close-source-settings" ${e.busy?'disabled':''}>取消</button><button type="submit" class="primary" ${e.busy?'disabled':''}>完成</button></footer></form></section></div>`;
 }
 function openSourceSettings(id,isSource){
  const t=manager(),s=view();if(s.editor){root.StudySchedule.reportError('请先完成或取消安排编辑。');return;}
  const source=isSource?(t.sources||[]).find(r=>r.id===id):null;if(isSource&&!source)return;
  s.sourceEditor={id,isSource,draft:source?structuredClone(source):{kind:id,type:'local',visible:t.visible?.[id]!==false},busy:false,error:'',notice:''};
  s.sourceEditor.colorExplicit=isSource?validColor(source.color):validColor(t.colors?.[id]);s.sourceEditor.draft.color||=t.colors?.[s.sourceEditor.draft.kind]||defaultColors[s.sourceEditor.draft.kind];s.sourceEditor.initialColor=s.sourceEditor.draft.color;redraw();
 }
 async function refreshSourceSettings(){
  const t=manager(),s=view(),e=s.sourceEditor;if(!e||e.busy)return false;
  e.busy=true;e.error='';e.notice='';redraw();
  try{const result=await root.AcademicReferences.readSubscription(e.draft);if(manager()!==t)return false;e.result=result;e.loadedUrl=e.draft.url;e.draft.updated_at=result.source.updated_at;e.notice='已读取更新，完成后在日历中核对。';return true;}
  catch(error){e.error=error.message;return false;}
  finally{e.busy=false;if(manager()===t)redraw();}
 }
 async function applySourceSettings(){
  const t=manager(),s=view(),e=s.sourceEditor;if(!e||e.busy||t.saving)return;
  const before=structuredClone(Object.fromEntries(['sources','calendar','timetable','events','colors','visible'].map(k=>[k,t[k]])));
  if(e.isSource){
   if(!e.draft.name?.trim()){e.error='请填写日历名称。';redraw();return;}
   const old=t.sources.find(row=>row.id===e.id);
   if(e.draft.type==='subscription'&&e.draft.url!==old.url&&e.loadedUrl!==e.draft.url){if(!await refreshSourceSettings()||manager()!==t)return;}
   const draft={...e.draft,name:e.draft.name.trim()};if(!e.colorExplicit&&draft.color===e.initialColor)delete draft.color;Object.assign(old,draft);
   if(e.result&&e.loadedUrl===e.draft.url)for(const key of ['calendar','timetable','events'])t[key]=t[key].filter(row=>row.source_id!==e.id).concat(e.result[key]||[]);
  }else{t.colors||={};if(e.colorExplicit||e.draft.color!==e.initialColor)t.colors[e.id]=e.draft.color;t.visible[e.id]=e.draft.visible;}
  s.sourceEditor=null;
  if(!await root.StudySchedule.save({quiet:true})){Object.assign(t,before);e.error=t.error||'保存失败，请重试。';t.error='';s.sourceEditor=e;redraw();return;}redraw();toast('已保存');
 }
 function sidebarMarkup(t){
  const collapsed=view(t).collapsedCategories||{};
  return `<div class="calendar-sidebar" id="calendar-source-tree" aria-label="日历分类">${[['calendar','校历'],['timetable','课表'],['exam','考试信息']].map(([key,name])=>{
   const sources=(t.sources||[]).filter(source=>source.kind===key);
   const existing=localSource(t,key);
   const rows=sources.map(r=>r.handbook?
    `<button type="button" class="calendar-handbook-row" data-calendar-action="source-settings" data-source-id="${esc(r.id)}" data-is-source="true" title="${esc(r.name)}">${icon('file-text')}<span>${esc(r.name)}</span>${icon('chevron-right')}</button>`:
    sourceRow(t,r.id,r.name,r.color||t.colors?.[key]||defaultColors[key],r.visible!==false,true)).join('');
   return `<details class="calendar-category" data-calendar-category="${key}" ${collapsed[key]?'':'open'}><summary>${icon('chevron-right')}<span>${name}</span></summary><div class="calendar-category-sources">${existing?sourceRow(t,key,existing.name,colorFor(t,key==='exam'?'events':key,{}),t.visible?.[key]!==false):''}${rows}</div></details>`;
  }).join('')}</div>`;
 }
 function markup(M,t,kind,{tools='',importPanel='',message=''}={}){
  const s=view(M),generic=['day','week'].includes(s.mode)&&!!t.timetable?.length&&!(t.calendar||[]).some(r=>r.kind==='teaching')&&!(t.events||[]).length,date=dateOf(s.cursor),allWeeks=[...new Set((t.timetable||[]).flatMap(r=>r.weeks))].sort((a,b)=>a-b);
  const title=generic?'每周课表':`${date.getUTCFullYear()}年${s.mode==='year'?'':`${date.getUTCMonth()+1}月${s.mode==='day'?date.getUTCDate()+'日':''}`}`;
  const currentWeek=teachingWeekLabel(currentTeachingWeeks(t,today()));
  const unit={day:'天',week:'周',month:'月',year:'年'}[s.mode];
  return `<section class="academic-calendar" aria-label="学习日历"><div class="calendar-body"><div class="calendar-main"><div class="calendar-navigation-row"><div class="calendar-period">${title}${generic?`<select aria-label="查看教学周" data-calendar-week>${(allWeeks.length?allWeeks:[1]).map(w=>`<option value="${w}" ${s.week===w?'selected':''}>Week ${w}</option>`).join('')}</select>`:''}${currentWeek?`<small class="calendar-current-week">本周 · ${currentWeek}</small>`:''}</div>${tabsMarkup(s.mode)}<div class="calendar-date-nav"><button type="button" class="icon-button" data-calendar-action="previous" aria-label="上一${unit}">${icon('chevron-left')}</button><button type="button" data-calendar-action="today">今天</button><button type="button" class="icon-button" data-calendar-action="next" aria-label="下一${unit}">${icon('chevron-right')}</button></div></div>${message}<div class="calendar-workspace ${s.editor?'has-editor':''}"><div class="calendar-canvas">${s.mode==='year'?yearMarkup(t,s):s.mode==='month'?monthMarkup(t,s):weekMarkup(t,s)}</div>${editorMarkup(t,s)}</div></div></div>${importPanel}${sourceSettingsMarkup(t,s)}</section>`;
 }
 function open(source,index,draft,original=null){const s=view();if(s.editor?.dirty){s.error='请先完成或取消当前编辑。';redraw();return;}s.error='';s.editor={source,index,draft:structuredClone(draft),dirty:false,original};redraw();document.querySelector('#calendar-event-form input')?.focus();}
 async function applyEditor(form){
  const M=manager(),t=term(),s=view(),e=s.editor;if(!e||M.saving)return;const before=structuredClone({calendar:t.calendar,timetable:t.timetable,events:t.events});const d=Object.fromEntries(new FormData(form));let row;
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
  if(validColor(d.color||e.draft.color))row.color=d.color||e.draft.color;
  if(e.draft.source_id)row.source_id=e.draft.source_id;
  if(e.original)t[e.original.source].splice(e.original.index,1);
  if(e.index>=0&&e.source!=='events'&&t[e.source][e.index]?.calendar_group)row.calendar_group=t[e.source][e.index].calendar_group;
  t[e.source]||=[];if(e.index<0)t[e.source].push(row);else t[e.source][e.index]=row;
  if(e.source==='events')s.cursor=row.date;
  s.editor=null;s.error='';if(!await root.StudySchedule.save({quiet:true})){Object.assign(t,before);s.editor=e;s.error=t.error||'保存失败，请重试。';t.error='';redraw();return;}redraw();toast('已保存');
 }
 let dragStart=null,suppressedSlotClick=null;
 function newDate(day){open('events',-1,{id:'',title:'',date:day,kind:'exam',start:'',end:'',location:''});}
 function openManual(kind){
  const day=view().cursor;
  if(kind==='exam')return newDate(day);
  if(kind==='calendar')return open('calendar',-1,{kind:'teaching',week:weekAt(term(),day)??1,start:monday(day),end:addDays(monday(day),6),label:''});
  open('timetable',-1,{course:'',class_type:'',weekday:weekday(day)+1,time:'09:00–10:00',weeks:[],location:''});
 }
 root.AcademicCalendar={openManual,learningWeek,learningWeekGrid,teachingWeekLabel,today,addDays,focusImported(M,kind,rows){view(M).cursor=importedDate(kind,rows,today());},markup,sidebar:()=>manager()&&view().sidebar!==false?sidebarMarkup(manager()):'',sidebarExpanded:()=>!!manager()&&view().sidebar!==false,toggleSidebar(){if(manager()){view().sidebar=view().sidebar===false;redraw();}},pending:M=>!!(M?.calendarView?.editor||M?.calendarView?.sourceEditor),reset(M){delete M.calendarView;}};
 function setColor(node,value){if(!manager()||manager().saving||root.AcademicReferences.busy(manager())||value&&!validColor(value))return;if(node.hasAttribute('data-source-settings-color')&&view().sourceEditor){view().sourceEditor.draft.color=value;redraw();}else if(node.hasAttribute('data-calendar-source-color')){const source=sourceOf(manager(),{source_id:node.dataset.calendarSourceColor});if(source)source.color=value;redraw();}else if(node.hasAttribute('data-calendar-category-color')){manager().colors||={};manager().colors[node.dataset.calendarCategoryColor]=value;redraw();}else if(node.hasAttribute('data-calendar-editor-color')&&view().editor){view().editor.draft.color=value;view().editor.dirty=true;redraw();}}
 document.addEventListener('click',event=>{const node=event.target.closest('button[data-color]');if(!node||!node.closest('.study-settings-shell'))return;event.preventDefault();setColor(node,node.dataset.color);},true);
 document.addEventListener('change',event=>{if(event.target.type==='color')setColor(event.target,event.target.value);if(event.target.hasAttribute('data-calendar-source')){const source=sourceOf(manager(),{source_id:event.target.dataset.calendarSource});if(source)source.visible=event.target.checked;redraw();}if(event.target.hasAttribute('data-source-name')){const source=sourceOf(manager(),{source_id:event.target.dataset.sourceName});if(source)source.name=event.target.value.trim()||source.name;redraw();}});
 document.addEventListener('click',async event=>{
  if(!manager()||!term())return;
  const suppressed=suppressedSlotClick;suppressedSlotClick=null;
  if(suppressed&&event.timeStamp<suppressed.until&&event.target.closest('[data-calendar-slot]')?.dataset.calendarSlot===suppressed.day&&!event.target.closest('button')){event.preventDefault();return;}
  const node=event.target.closest('[data-calendar-action]');
  if(node){
   event.preventDefault();event.stopImmediatePropagation();if(root.AcademicReferences.busy(manager())||manager().saving)return;
   const s=view(),t=term(),action=node.dataset.calendarAction;
   if(s.editor?.dirty&&!['close-editor','delete','existing-choice'].includes(action)){s.error='请先完成或取消当前编辑。';redraw();return;}

   if(action==='existing-choice'){if(s.editor){s.editor.draft['_custom_'+node.dataset.field]=false;redraw();}return;}
   if(action==='source-settings'){openSourceSettings(node.dataset.sourceId,node.dataset.isSource==='true');return;}
   if(action==='delete-source'){const e=s.sourceEditor;if(e&&!e.busy){removeCalendarSource(t,e.id,e.isSource);s.sourceEditor=null;t.importUI||={};t.importUI.notice='';redraw();toast('已删除，保存后生效');}return;}
   if(action==='close-source-settings'){if(!s.sourceEditor?.busy){s.sourceEditor=null;redraw();}return;}
   if(action==='refresh-source-settings'){await refreshSourceSettings();return;}
   if(s.sourceEditor)return;
   if(action==='month'){s.cursor=node.dataset.date;s.mode='month';redraw();}
   else if(action==='view'){s.mode=node.dataset.view;redraw();}
   else if(action==='previous'||action==='next'){s.cursor=['month','year'].includes(s.mode)?moveMonth(s.cursor,(action==='next'?1:-1)*(s.mode==='year'?12:1)):addDays(s.cursor,(action==='next'?1:-1)*(s.mode==='day'?1:7));redraw();}
   else if(action==='today'){s.cursor=today();redraw();}
   else if(action==='new-date')newDate(node.dataset.date);
   else if(action==='day'){s.cursor=node.dataset.date;s.mode='day';redraw();}
   else if(action==='edit'){const [source,index]=node.dataset.entry.split(':');open(source,Number(index),t[source][Number(index)]);}
   else if(action==='close-editor'){s.editor=null;s.error='';redraw();}
   else if(action==='delete'){const e=s.editor;t[e.source].splice(e.index,1);s.editor=null;redraw();}
   return;
  }
  const slot=event.target.closest('[data-calendar-slot]'),day=event.target.closest('[data-calendar-day]');
  if(slot){
   event.preventDefault();const s=view();if(s.editor)return;
   const offset=event.clientY-slot.getBoundingClientRect().top,start=event.detail===0?9*60:Math.max(0,Math.min(23*60,Math.floor((Number(slot.dataset.gridStart)*60+offset/HOUR*60)/30)*30));
   open('timetable',-1,{course:'',class_type:'',weekday:weekday(slot.dataset.calendarSlot)+1,time:`${clock(start)}–${clock(Math.min(1439,start+60))}`,weeks:[],location:''});
  }else if(day&&!view().editor)newDate(day.dataset.calendarDay);
 },true);
 document.addEventListener('pointerdown',event=>{const slot=event.target.closest('[data-calendar-slot]');if(!slot||event.target.closest('button')||view().editor||root.AcademicReferences.busy(manager())||manager().saving)return;dragStart={slot,y:event.clientY};});
 document.addEventListener('pointerup',event=>{const start=dragStart;dragStart=null;if(!start||Math.abs(event.clientY-start.y)<6)return;const {slot}=start,top=slot.getBoundingClientRect().top,base=Number(slot.dataset.gridStart)*60;const minute=y=>Math.max(base,Math.min(1439,Math.floor((base+(y-top)/HOUR*60)/30)*30));const a=minute(Math.min(start.y,event.clientY)),b=Math.max(a+30,minute(Math.max(start.y,event.clientY)));suppressedSlotClick={until:event.timeStamp+300,day:slot.dataset.calendarSlot};open('timetable',-1,{course:'',class_type:'',weekday:weekday(slot.dataset.calendarSlot)+1,time:`${clock(a)}–${clock(Math.min(1439,b))}`,weeks:[],location:''});});
 document.addEventListener('submit',async event=>{if(event.target.id==='calendar-source-settings-form'){event.preventDefault();event.stopImmediatePropagation();await applySourceSettings();return;}if(event.target.id!=='calendar-event-form')return;event.preventDefault();event.stopImmediatePropagation();try{await applyEditor(event.target);}catch(e){const s=view();s.error=e.message;const error=event.target.querySelector('[role="alert"]');error.hidden=false;error.textContent=e.message;}} ,true);
 document.addEventListener('input',event=>{if(event.target.closest('#calendar-source-settings-form')&&event.target.name&&view().sourceEditor){view().sourceEditor.draft[event.target.name]=event.target.type==='checkbox'?event.target.checked:event.target.value;return;}if(event.target.closest('#calendar-event-form')&&event.target.name){const e=view().editor,{name,value}=event.target;e.dirty=true;if(event.target.hasAttribute('data-calendar-choice')&&value==='__new_calendar_value__')return;if(name==='weeks')e.draft._weeksText=value;else e.draft[name]=['weekday','week'].includes(name)?value?Number(value):null:value;root.StudySchedule.refreshActions();}});
 document.addEventListener('change',event=>{if(event.target.hasAttribute('data-calendar-choice')&&event.target.value==='__new_calendar_value__'&&view().editor){const name=event.target.name;view().editor.draft['_custom_'+name]=true;view().editor.draft[name]='';redraw();document.querySelector(`#calendar-event-form input[name="${name}"]`)?.focus();return;}if(event.target.name==='kind'&&event.target.closest('#calendar-event-form')&&view().editor?.source==='calendar'){view().editor.draft.kind=event.target.value;view().editor.draft.week=event.target.value==='teaching'?view().editor.draft.week||1:null;redraw();return;}if(event.target.name==='category'&&event.target.closest('#calendar-event-form')){const e=view().editor,source=event.target.value,day=e.draft.date||view().cursor,original=e.original||(e.index>=0?{source:e.source,index:e.index}:null);const draft=source==='calendar'?{kind:'teaching',week:1,start:monday(day),end:addDays(monday(day),6),label:''}:source==='events'?{id:'',title:e.draft.course||'',kind:'exam',date:day,start:'09:00',end:'10:00',location:e.draft.location||''}:{course:e.draft.title||'',class_type:'',weekday:weekday(day)+1,time:'09:00–10:00',weeks:[],location:e.draft.location||''};view().editor=null;open(source,-1,draft,original);view().editor.dirty=true;return;}if(event.target.hasAttribute('data-calendar-week')){view().week=Number(event.target.value);redraw();}});
 document.addEventListener('toggle',event=>{if(event.target.matches?.('details[data-calendar-category]')&&manager()){view().collapsedCategories||={};view().collapsedCategories[event.target.dataset.calendarCategory]=!event.target.open;}},true);
 document.addEventListener('pointerdown',event=>{for(const menu of document.querySelectorAll('.calendar-source-menu[open],.calendar-color-menu[open]'))if(!menu.contains(event.target))menu.removeAttribute('open');},true);
 document.addEventListener('keydown',event=>{if(!document.querySelector('.academic-calendar'))return;if(event.key==='Escape')document.querySelectorAll('.calendar-source-menu[open],.calendar-color-menu[open]').forEach(menu=>menu.removeAttribute('open'));if(event.key==='Escape'&&manager()&&view().sourceEditor){if(!view().sourceEditor.busy){view().sourceEditor=null;redraw();}return;}if(event.key==='Escape'&&manager()&&view().editor){event.preventDefault();view().editor=null;redraw();}else if(event.key==='Enter'&&event.target.hasAttribute('data-calendar-slot')){event.preventDefault();event.target.click();}});
})(typeof window==='undefined'?{}:window);
