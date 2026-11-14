/* Semester calendar: explicit week/date mappings, recurring classes and dated exams. */
(function(root){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const HOUR=64;
 const defaultColors={calendar:'#808080',timetable:'#548568',exam:'#a07848'};
 const palette=['#808080','#548568','#527eac','#8070a0','#b16c79','#a07848','#b47c4c','#555555'];
 const validColor=v=>/^#[0-9a-f]{6}$/i.test(v||'');
 const categoryOf=(source,kind)=>source==='events'||kind==='exam'?'exam':source;
 const localCategory=(field,row)=>field==='calendar'&&!row.calendar_group?'calendar':categoryOf(field,row.kind);
 function localSource(t,key){
  const rows=['calendar','timetable','events'].flatMap(field=>(t[field]||[]).filter(row=>!row.source_id&&!row.calendar_group&&localCategory(field,row)===key));
  if(!rows.length)return null;
  return {name:'手动添加',origin:'在日历中手动添加的安排'};
 }
 function removeCalendarSource(t,id,isSource=true){
  if(isSource&&!t.sources?.some(source=>source.id===id))return;
  for(const field of ['calendar','timetable','events'])t[field]=(t[field]||[]).filter(row=>isSource?row.source_id!==id:!!row.source_id||localCategory(field,row)!==id);
  if(isSource)t.sources=t.sources.filter(source=>source.id!==id);
 }
 const sourceOf=(t,row)=>(t.sources||[]).find(s=>s.id===row.source_id);
 const editorCategory=(t,source,row)=>{const kind=sourceOf(t,row)?.kind;return kind==='exam'?'events':kind||source;};
 const datedEntry=(t,row,index)=>({
  key:'events:'+index,title:row.title,subtitle:row.location,time:row.start?`${row.start}–${row.end}`:'',
  range:row.start?clockRange(`${row.start}–${row.end}`):null,kind:row.kind,color:colorFor(t,'events',row)
 });
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
 function semesterForDate(day,t){
  const {start,end}=schoolBounds(day,'year'),year=start.slice(0,4);
  const firstWeeks=[...new Set((t?.calendar||[]).filter(row=>row.kind==='teaching'&&row.week===1&&
   row.start>=start&&row.start<=end&&belongsTo(t,row,'calendar','calendar')&&shown(t,row,'calendar')).map(row=>row.start))].sort();
  const started=firstWeeks.filter(date=>date<=day).length;
  if(firstWeeks.length>=2&&started)return year+'-'+started;
  const month=Number(day.slice(5,7));
  return year+'-'+(month>=2&&month<9?2:1);
 }
 const semesterOf=(t,row)=>sourceOf(t,row)?.semester||row.semester||'';
 const timetableGroup=(t,row)=>{
  const source=sourceOf(t,row);
  return semesterOf(t,row)||(source?.kind==='timetable'&&source.type==='import'?'import:'+source.id:'');
 };
 const newestSemesterFirst=(a,b)=>b.localeCompare(a,'en',{numeric:true});
 function timetableSemesters(t){
  const rows=(t.timetable||[]).filter(row=>belongsTo(t,row,'timetable','timetable'));
  const sources=(t.sources||[]).filter(source=>source.kind==='timetable'&&source.type==='import');
  return [...new Set([...rows.map(row=>timetableGroup(t,row)),...sources.map(source=>timetableGroup(t,{source_id:source.id}))])].sort(newestSemesterFirst);
 }
 function examEntries(t){
  return (t.events||[]).flatMap((row,i)=>{
   const source=sourceOf(t,row);
   if(row.kind!=='exam'||(row.source_id&&source?.kind!=='exam')||!shown(t,row,'exam'))return [];
   return [{...datedEntry(t,row,i),date:row.date}];
  }).sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
 }
 function learningWeek(t,day){
  const start=monday(day),end=addDays(start,6),weeks=currentTeachingWeeks(t,day),days=[];
  const sources=new Map((t.sources||[]).map(r=>[r.id,r]));
  for(let i=0;i<7;i++){
   const date=addDays(start,i),week=weekAt(t,date),classes=[];
   const activeSemester=semesterForDate(date,t);
   const off=(t.calendar||[]).some(r=>['break','nonteaching'].includes(r.kind)&&sources.get(r.source_id)?.type!=='subscription'&&r.start<=date&&r.end>=date);
   for(const r of t.timetable||[]){
    const mapped=classWeek(t,r,date,week),semester=semesterOf(t,r),source=sources.get(r.source_id);
    const unplaced=source?.kind==='timetable'&&source.type==='import'&&!semester;
    if(off||unplaced||(semester&&semester!==activeSemester)||r.weekday!==i+1||mapped===null||(r.weeks?.length&&!r.weeks.includes(mapped))||sources.get(r.source_id)?.visible===false)continue;
    classes.push({course:r.course,date,week:mapped,classType:r.class_type||'',time:r.time,location:r.location||'',color:colorFor(t,'timetable',r)});
   }
   for(const r of t.events||[]){
    const source=sources.get(r.source_id);
    if(r.date!==date||r.kind==='exam'||source?.kind!=='timetable'||source.visible===false)continue;
    classes.push({course:r.title,date,week,classType:'',time:r.start?(r.end?r.start+'–'+r.end:r.start):'',location:r.location||'',color:colorFor(t,'events',r)});
   }
   const seen=new Set();
   days.push({date,label:dayNames[i],classes:classes.filter(r=>{
    const key=JSON.stringify([courseCode(r.course).toLowerCase(),r.week,r.classType,clockRange(r.time)||r.time]);
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
  (t.events||[]).forEach((row,i)=>{if(shown(t,row,'exam')&&row.date===day)result.push(datedEntry(t,row,i));});
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
 function schoolBounds(cursor,mode){
  if(mode==='week'){
   const start=monday(cursor);
   return {start,end:addDays(start,6)};
  }
  if(mode==='year'){
   const year=Number(cursor.slice(0,4))-(Number(cursor.slice(5,7))<9?1:0);
   return {start:year+'-09-01',end:(year+1)+'-08-31'};
  }
  const start=moveMonth(cursor,0);
  return {start,end:addDays(moveMonth(start,1),-1)};
 }
 function belongsTo(t,row,field,kind){
  if(row.source_id)return sourceOf(t,row)?.kind===kind;
  return field===kind;
 }
 function schoolYearOf(day){return Number(schoolBounds(day,'year').start.slice(0,4));}
 function schoolYearRows(t){
  const rows=schoolRows(t,'0001-01-01','9999-12-31',true),teachingYears=new Map(),sections=new Map();
  for(const row of rows){
   if(row.kind!=='teaching'||!row.source_id)continue;
   if(!teachingYears.has(row.source_id))teachingYears.set(row.source_id,new Set());
   teachingYears.get(row.source_id).add(schoolYearOf(row.start));
  }
  for(const row of rows){
   const midpoint=addDays(row.start,Math.floor((dateOf(row.end)-dateOf(row.start))/86400000/2));
   let year=schoolYearOf(row.kind==='teaching'?row.start:midpoint);
   const anchors=teachingYears.get(row.source_id);
   if(anchors&&!anchors.has(year)){
    // An annual calendar may print orientation or summer days just outside September–August.
    const next=year+1,previous=year-1;
    if(anchors.has(next)&&row.start>=addDays(next+'-09-01',-7))year=next;
    else if(anchors.has(previous)&&row.end<=addDays(previous+1+'-08-31',7))year=previous;
   }
   const assigned=sourceOf(t,row)?.school_year;
   if(Number.isInteger(assigned))year=assigned;
   if(!sections.has(year))sections.set(year,[]);
   sections.get(year).push(row);
  }
  return sections;
 }
 function schoolYears(t){return [...schoolYearRows(t).keys()].sort((a,b)=>b-a);}
 function courseCode(name=''){
  return name.trim().match(/^[a-z]{2,6}\s*\d{2,4}(?![a-z0-9])/i)?.[0].replace(/\s/g,'').toUpperCase()||name;
 }
 function schoolRows(t,start,end,includeHidden=false){
  const descriptions={break:'假期',exam:'考试期',nonteaching:'其他安排'};
  const rows=(t.calendar||[]).flatMap((row,i)=>{
   if(!belongsTo(t,row,'calendar','calendar')||(!includeHidden&&!shown(t,row,'calendar')))return [];
   const repeatedWeek=Number(row.label?.match(/^(?:teaching\s+)?week\s*(\d+)$/i)?.[1])===row.week;
   const title=row.kind==='teaching'?'第 '+row.week+' 教学周'+(row.label&&!repeatedWeek?' · '+row.label:''):row.label||descriptions[row.kind];
   const defaultColor={teaching:'#868b92',break:'#b16363',exam:'#548568',nonteaching:'#8070a0'}[row.kind];
   return [{...row,key:'calendar:'+i,title,color:row.color||sourceOf(t,row)?.color||t.colors?.calendar||defaultColor}];
  });
  (t.events||[]).forEach((row,i)=>{
   if(belongsTo(t,row,'events','calendar')&&(includeHidden||shown(t,row,'calendar')))rows.push({
    start:row.date,end:row.date,key:'events:'+i,title:row.title,kind:row.kind,source_id:row.source_id,color:colorFor(t,'events',row)
   });
  });
  return rows.filter(row=>row.start<=end&&row.end>=start).sort((a,b)=>a.start.localeCompare(b.start)||Number(b.kind==='teaching')-Number(a.kind==='teaching'));
 }
 function timetableEntries(t,day,week=null,semester){
  const off=week===null&&(t.calendar||[]).some(row=>belongsTo(t,row,'calendar','calendar')&&
   ['break','nonteaching'].includes(row.kind)&&sourceOf(t,row)?.type!=='subscription'&&row.start<=day&&row.end>=day);
  const teachingWeek=week===null?weekAt(t,day):week;
  const timedClasses=(t.timetable||[]).flatMap((row,i)=>{
   if(off||(semester!==undefined&&timetableGroup(t,row)!==semester)||!belongsTo(t,row,'timetable','timetable')||!shown(t,row,'timetable')||row.weekday!==weekday(day)+1)return [];
   const mapped=week===null?classWeek(t,row,day,teachingWeek):week;
   if(mapped!=='all'&&(mapped===null||row.weeks.length&&!row.weeks.includes(mapped)))return [];
   const typeColor={lecture:'#7769a9',tutorial:'#a568a1',lab:'#548568','comp.lab':'#527eac'}[row.class_type?.toLowerCase()];
   return [{key:'timetable:'+i,title:row.course,classType:row.class_type,weeks:row.weeks,time:row.time,range:clockRange(row.time),
    color:row.color||sourceOf(t,row)?.color||t.colors?.timetable||typeColor||defaultColors.timetable}];
  });
  if(week!==null)return timedClasses;
  (t.events||[]).forEach((row,i)=>{
   if(row.date===day&&row.kind!=='exam'&&belongsTo(t,row,'events','timetable')&&shown(t,row,'timetable'))timedClasses.push(datedEntry(t,row,i));
  });
  (t.calendar||[]).forEach((row,i)=>{
   if(row.start<=day&&row.end>=day&&belongsTo(t,row,'calendar','timetable')&&shown(t,row,'timetable'))
    timedClasses.push({key:'calendar:'+i,title:row.label,time:'',range:null,color:colorFor(t,'calendar',row)});
  });
  return timedClasses;
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={addDays,weekday,monday,monthDays,moveMonth,weekAt,clockRange,firstDate,entriesForDay,timedLayout,periodLanes,colorFor,colorStyle,localSource,removeCalendarSource,importedDate,editorCategory,learningWeek,learningWeekGrid,schoolBounds,schoolRows,schoolYears,schoolYearRows,timetableEntries,timetableSemesters,semesterForDate,examEntries};return;}
 const manager=()=>root.StudySchedule?.manager(),term=manager;
 const redraw=()=>root.StudySchedule?.paint();
 function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
 function view(M=manager()){
  if(!M.calendarView){
   const current=today(),rows=schoolRows(M,'0001-01-01','9999-12-31');
   const cursor=rows.length&&(current<rows[0].start||rows.every(row=>row.end<current))?rows[0].start:current;
   M.calendarView={scope:'calendar',cursor,cursors:{},editor:null,error:''};
  }
  return M.calendarView;
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

 function weekGrid(dates,entries,{currentDate,renderDay=()=>'',dayAttributes=()=>'',renderEntry,hourHeight=HOUR,fitHours=false,tickMinutes=60,entryGap=0,minimumHeight=24}){
  const all=entries.flat(),timed=all.filter(entry=>entry.range);
  const headings=dates.map(day=>`<div class="${day===currentDate?'is-today':''}"><span>${dayNames[weekday(day)]}</span>${renderDay(day)}</div>`).join('');
  const allDay=all.some(entry=>!entry.range)
   ?`<div class="week-all-day"><span>全天 / 节次</span>${entries.map(rows=>`<div>${rows.filter(entry=>!entry.range).map(entry=>renderEntry(entry,'')).join('')}</div>`).join('')}</div>`:'';
  const header=`<div class="week-day-headings"><span>${tickMinutes===30?'时间':''}</span>${headings}</div>${allDay}`;
  if(fitHours&&!timed.length)return header;

  const first=Math.min(fitHours?24:8,...timed.map(entry=>Math.floor(entry.range.start/60)));
  const last=Math.max(fitHours?0:20,...timed.map(entry=>Math.ceil(entry.range.end/60)));
  const minimumMinutes=minimumHeight*60/hourHeight;
  const durationHeight=(last-first)*hourHeight;
  const gridHeight=fitHours?Math.max(durationHeight,...timed.map(entry=>((entry.range.start-first*60)/60)*hourHeight+24)):durationHeight;
  const ticks=(last-first)*60/tickMinutes,stepHeight=hourHeight*tickMinutes/60;
  const hourLabels=Array.from({length:ticks+1},(_,i)=>`<span style="top:${i*stepHeight}px">${clock(first*60+i*tickMinutes)}</span>`).join('');
  const hourLines=Array.from({length:ticks+1},(_,i)=>`<div class="calendar-hour-line" style="top:${i*stepHeight}px"></div>`).join('');
  const columns=dates.map((day,index)=>{
   const events=timedLayout(entries[index],minimumMinutes).map(entry=>{
    const top=(entry.range.start-first*60)/60*hourHeight;
    const height=Math.max(minimumHeight,(entry.range.end-entry.range.start)/60*hourHeight);
    const style=`top:${top+entryGap/2}px;height:${height-entryGap}px;left:calc(${entry.column/entry.columns*100}% + 3px);width:calc(${100/entry.columns}% - 6px)`;
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
    const label=courseCode(entry.title);
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
 function schoolMarkup(t,s,rows){
  if(!rows?.length)return '<p class="calendar-overview-empty">添加校历后，这里会显示对应学年的安排。</p>';
  const bounds=schoolBounds(s.cursor,'year'),months=new Map();
  const start=rows.reduce((day,row)=>row.start<day?row.start:day,bounds.start);
  const end=rows.reduce((day,row)=>row.end>day?row.end:day,bounds.end);
  const current=today();
  for(let date=monday(start);date<=end;date=addDays(date,7)){
   const days=Array.from({length:7},(_,i)=>addDays(date,i));
   const month=(date<bounds.start?bounds.start:date).slice(0,7);
   const items=rows.filter(row=>shown(t,row,'calendar')&&row.start<=days[6]&&row.end>=date);
   if(!months.has(month))months.set(month,[]);
   months.get(month).push({days,items});
  }
  const dayCell=(day,index,items)=>{
   const outside=day<start||day>end;
   const marker=outside?null:items.find(row=>row.kind!=='teaching'&&row.start<=day&&row.end>=day);
   return `<td class="${outside?'is-outside':''} ${index>=5?'is-weekend':''}"><time datetime="${day}"
    ${day===current?'aria-current="date"':''} ${marker?`class="school-date-mark" style="${colorStyle(marker.color)}"`:''}>${Number(day.slice(8))}</time></td>`;
  };
  return `<div class="school-calendar-frame"><table class="school-calendar-table" aria-label="校历日期与安排">
   <thead><tr><th scope="col">月份</th>${dayNames.map(name=>`<th scope="col" aria-label="${name}"><span class="school-weekday-prefix">周</span>${name.slice(1)}</th>`).join('')}<th scope="col">周次与安排</th></tr></thead>
   ${[...months].map(([month,weeks])=>`<tbody>${weeks.map(({days,items},i)=>`<tr>
    ${i===0?`<th scope="rowgroup" rowspan="${weeks.length}"><strong>${Number(month.slice(5))} 月</strong><small>${month.slice(0,4)}</small></th>`:''}
    ${days.map((day,index)=>dayCell(day,index,items)).join('')}
    <td class="school-calendar-description">${items.map(row=>`<button type="button" data-kind="${esc(row.kind)}" data-calendar-action="edit"
     data-entry="${row.key}" style="${colorStyle(row.color)}" title="${row.start} — ${row.end}">${esc(row.title)}</button>`).join('')}</td>
   </tr>`).join('')}</tbody>`).join('')}
  </table></div>`;
 }
 function timetableMarkup(t,s){
  if(s.semester===undefined)return '<p class="calendar-overview-empty">添加课表后，这里会显示对应学期的安排。</p>';
  const start=monday(s.cursor),dates=Array.from({length:7},(_,i)=>addDays(start,i));
  const entries=dates.map(day=>timetableEntries(t,day,'all',s.semester));
  const populated=new Set((t.timetable||[]).map(row=>row.source_id));
  const unavailable=(t.sources||[]).filter(source=>source.kind==='timetable'&&source.type==='import'&&
   timetableGroup(t,{source_id:source.id})===s.semester&&(source.visible===false||!populated.has(source.id)));
  const importActions=unavailable.length?`<div class="calendar-overview-empty">${unavailable.map(source=>timetableImportButton(source,'管理 '+source.name)).join('')}</div>`:'';
  const minimumHeight=48;
  const lanes=entries.map(rows=>Math.max(1,...timedLayout(rows,minimumHeight*60/HOUR).map(row=>row.columns)));
  const columns=lanes.map(count=>`minmax(${count*86}px,${count}fr)`).join(' ');
  const width=62+lanes.reduce((total,count)=>total+count*86,0);
  const grid=weekGrid(dates,entries,{
   tickMinutes:30,entryGap:4,minimumHeight,
   dayAttributes:(day,first)=>`data-calendar-slot="${day}" data-grid-start="${first}" tabindex="0" aria-label="${dayNames[weekday(day)]}，添加课程"`,
   renderEntry:(entry,layout)=>{
    const code=courseCode(entry.title),numbers=entry.weeks||[];
    const weeks=numbers.length?'第 '+root.AcademicReferences.formatWeeks(numbers)+' 周':entry.weeks?'每个教学周':'';
    const alternating=numbers.length>=3&&numbers.slice(1).every((week,i)=>week-numbers[i]===2);
    const shortWeeks=alternating?`第 ${numbers[0]}–${numbers.at(-1)} 周（${numbers[0]%2?'单':'双'}）`:weeks;
    const label=[code,entry.classType,weeks,entry.time].filter(Boolean).join(' · ');
    return `<button type="button" class="calendar-entry settings-timetable-card" data-calendar-action="edit" data-entry="${entry.key}"
     aria-label="${esc(label)}" title="${esc(label)}" style="${colorStyle(entry.color)}${layout}"><strong>${esc(code)}</strong>
     ${entry.classType?`<small>${esc(entry.classType)}</small>`:''}${shortWeeks?`<small class="timetable-card-weeks">${esc(shortWeeks)}</small>`:''}
     ${entry.time?`<small>${esc(entry.time)}</small>`:''}</button>`;
   }
  });
  return `${importActions}<div class="semester-week settings-timetable-grid" style="min-width:${width}px;--timetable-columns:${columns}" aria-label="课表时间网格">${grid}</div>`;
 }
 function examMarkup(t){
  const assessmentSources=(t.sources||[]).filter(source=>source.kind==='exam'&&source.assessments?.length);
  const detailedIds=new Set(assessmentSources.flatMap(s=>s.assessments.map(r=>r.id)));
  const rows=examEntries(t).filter(r=>!detailedIds.has(t.events[Number(r.key.split(':')[1])]?.id));
  const handbooks=(t.sources||[]).filter(source=>source.kind==='exam'&&source.handbook&&source.visible!==false);
  return `<section class="exam-overview" aria-label="考试安排">${assessmentSources.map(source=>`<section class="exam-handbook">${root.AcademicReferences.originalLinks(t,source)}${source.assessments.map(r=>`<article class="prep-exam"><strong>${esc(r.course)} · ${esc(r.title)}</strong><p>${esc(r.date?(r.date+(r.date_end?' 至 '+r.date_end:'')+(r.start?' '+r.start:'')):r.timing||'日期待确认')}${r.weight?' · '+esc(r.weight):''}</p><p>${esc([r.location,r.duration,r.question_types,r.scope].filter(Boolean).join(' · '))}</p></article>`).join('')}</section>`).join('')}
   ${rows.length?`<ul class="exam-events">${rows.map(row=>`<li><button type="button" data-calendar-action="edit" data-entry="${row.key}">
    <time datetime="${row.date}">${row.date}</time><strong>${esc(row.title)}</strong>
    <span>${esc([row.time,row.subtitle].filter(Boolean).join(' · '))}</span></button></li>`).join('')}</ul>`:assessmentSources.length?'':'<p class="exam-empty">暂无已确定日期的考试。</p>'}
   ${handbooks.map(source=>`<details class="exam-handbook"><summary>${esc(courseCode(source.handbook.course))} · Module Handbook</summary>
    ${root.AcademicReferences.originalLinks(t,source)}${root.AcademicReferences.handbookDetails(source.handbook,false)}</details>`).join('')}
  </section>`;
 }
 function semesterLabel(key,t){
  if(!key)return '未标注学期';
  if(key.startsWith('import:'))return '未标注学期 · '+(sourceOf(t,{source_id:key.slice(7)})?.name||'课表');
  const [year,term]=key.split('-').map(Number);
  return `${year}–${year+1} · 第 ${term} 学期`;
 }
 function semesterPicker(t,s){
  const semesters=timetableSemesters(t),current=semesterForDate(today(),t);
  if(!semesters.includes(s.semester))s.semester=semesters.includes(current)?current:semesters[0];
  if(!semesters.length)return '';
  if(semesters.length===1)return `<span class="timetable-semester-label" title="${esc(semesterLabel(s.semester,t))}">${esc(semesterLabel(s.semester,t))}</span>`;
  return `<select class="timetable-week-picker timetable-semester-picker" aria-label="选择学期" data-timetable-semester>
   ${semesters.map(key=>`<option value="${esc(key)}" ${key===s.semester?'selected':''}>${esc(semesterLabel(key,t))}</option>`).join('')}
  </select>`;
 }
 function timetableImportButton(source,label='管理这份导入'){
  return `<button type="button" class="text-button" data-calendar-action="manage-timetable-import"
   data-source-id="${esc(source.id)}">${esc(label)}</button>`;
 }
 function field(name,label,value,type='text',extra=''){return `<label><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;}
 function editorMarkup(t,s){
  const e=s.editor;if(!e)return '';const r=e.draft;
  const source=sourceOf(t,r);
  const originals=root.AcademicReferences.originalLinks(t,source);
  const manageImport=source?.kind==='timetable'&&source.type==='import'?timetableImportButton(source):'';
  const select=(name,label,items,value)=>`<label><span>${label}</span><select name="${name}">${items.map(([id,n])=>`<option value="${id}" ${String(id)===String(value)?'selected':''}>${n}</option>`).join('')}</select></label>`;
  const choice=(name,label,value,values)=>{
   const options=[...new Set([...values,value].filter(Boolean))];
   if(r['_custom_'+name])return `<label><span>${label}</span><div class="calendar-custom-choice"><input name="${name}" aria-label="${label}" value="${esc(value)}" maxlength="${name==='course'?150:60}" ${name==='course'?'required':''}><button type="button" data-calendar-action="existing-choice" data-field="${name}" aria-label="选择已有${label}" title="选择已有${label}">${icon('chevron-down')}</button></div></label>`;
   return `<label><span>${label}</span><select name="${name}" data-calendar-choice ${name==='course'?'required':''}><option value="">选择${label}</option>${options.map(v=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(v)}</option>`).join('')}<option value="__new_calendar_value__">输入新的${label}…</option></select></label>`;
  };
  let body='';
  const contentCategory=editorCategory(t,e.source,r);
  const category=`<div class="calendar-editor-category">${contentCategory==='timetable'?esc(semesterLabel(s.semester,t)):contentCategory==='calendar'?'校历':'考试信息'}</div>`;
  if(e.source==='timetable')body=choice('course','课程代码',courseCode(r.course),[...new Map((t.timetable||[]).filter(row=>timetableGroup(t,row)===s.semester&&belongsTo(t,row,'timetable','timetable')).map(row=>[courseCode(row.course).toLowerCase(),courseCode(row.course)])).values()])+choice('class_type','课程类型',r.class_type,[...(t.timetable||[]).filter(row=>belongsTo(t,row,'timetable','timetable')).map(row=>row.class_type)])+`<div class="calendar-editor-pair">${select('weekday','星期',dayNames.map((n,i)=>[i+1,n]),r.weekday)}${field('weeks','教学周',r._weeksText??root.AcademicReferences.formatWeeks(r.weeks),'text','placeholder="每周，如 1–6, 8–16"')}</div>`+field('time','时间 / 节次',r.time,'text','placeholder="09:00–10:00 或第1–2节" maxlength="80" required');
  else if(e.source==='calendar')body=`<div class="calendar-editor-pair">${select('kind','类型',[['teaching','教学周'],['break','假期'],['exam','考试周'],['nonteaching','其他安排']],r.kind)}${r.kind==='teaching'?field('week','教学周',r.week,'number','min="1" max="60"'):''}</div><div class="calendar-editor-pair">${field('start','开始日期',r.start,'date','required')}${field('end','结束日期',r.end,'date','required')}</div>`+field('label','备注',r.label,'text','maxlength="80"');
  else body=field('title',contentCategory==='timetable'?'课程':'名称',r.title,'text','maxlength="150" required')+`<input type="hidden" name="kind" value="${r.kind||'exam'}">${field('date','日期',r.date,'date','required')}<div class="calendar-editor-pair">${field('start','开始时间',r.start,'time')}${field('end','结束时间',r.end,'time')}</div>`+(contentCategory==='timetable'?'':field('location','地点',r.location,'text','maxlength="120"'));
  return `<aside class="calendar-event-editor" aria-label="编辑日历安排"><header><span>${contentCategory==='timetable'?'课程安排':contentCategory==='calendar'?'校历安排':'考试安排'}</span><button type="button" class="icon-button" data-calendar-action="close-editor" aria-label="关闭编辑">${icon('x')}</button></header><form id="calendar-event-form">${category}${body}${originals}${manageImport}<p class="error-message" role="alert" ${s.error?'':'hidden'}>${esc(s.error)}</p><footer>${e.index>=0?`<button type="button" class="outline-button calendar-delete" data-calendar-action="delete" aria-label="删除这项安排" title="删除">${icon('trash-2')}删除</button>`:'<span></span>'}<button type="submit" class="outline-button">完成</button></footer></form></aside>`;
 }
 function sourceSettingsMarkup(t,s){
  const e=s.sourceEditor;if(!e)return '';const d=e.draft;
  if(d.kind==='calendar'||d.kind==='timetable'){
   const school=d.kind==='calendar',label=school?'学年':'学期';
   const originalYear=school?(d.school_year||schoolYearOf(s.cursor)):Number((d.semester||s.semester||'').split('-')[0])||schoolYearOf(s.cursor);
   const originalTerm=Number((d.semester||s.semester||'').split('-')[1])||1;
   e.periodDraft||={start:originalYear,end:originalYear+1,term:originalTerm};
   const values=e.periodDraft,sources=e.periodSources||[d];
   const originals=sources.map(source=>root.AcademicReferences.originalLinks(t,source)).filter(Boolean).join('');
   return `<div class="calendar-editor-shade"><section class="academic-reference-import calendar-source-settings" role="dialog" aria-modal="true" aria-label="${label}设置"><header><span>${label}设置</span><button type="button" class="icon-button" data-calendar-action="close-source-settings" aria-label="关闭${label}设置">${icon('x')}</button></header><form id="calendar-period-settings-form"><fieldset ${t.saving?'disabled':''}><div class="period-year-fields">${field('start','开始年份',values.start,'number','min="1000" max="9998" required')}${field('end','结束年份',values.end,'number','min="1001" max="9999" required')}</div>${school?'':field('term','学期',values.term,'number','min="1" max="99" required')}${originals||'<p class="subscription-hint">这份安排没有附带原件。</p>'}</fieldset><p class="error-message" role="alert" ${e.error?'':'hidden'}>${esc(e.error)}</p><footer><button type="button" class="outline-button" data-calendar-action="close-source-settings">取消</button><button type="submit" class="primary" ${t.saving?'disabled':''}>完成</button></footer></form></section></div>`;
  }
  const originals=root.AcademicReferences.originalLinks(t,d);
  const subscription=d.type==='subscription'&&/^https?:\/\//i.test(d.url||'')?`<div class="calendar-originals"><span>原件</span><a href="${esc(d.url)}" target="_blank" rel="noopener">打开订阅文件${icon('external-link')}</a></div>`:'';
  return `<div class="calendar-editor-shade"><section class="academic-reference-import calendar-source-settings" role="dialog" aria-modal="true" aria-label="资料详情"><header><span>资料详情</span><button type="button" class="icon-button" data-calendar-action="close-source-settings" aria-label="关闭资料详情" ${e.busy?'disabled':''}>${icon('x')}</button></header><form id="calendar-source-settings-form"><fieldset ${e.busy?'disabled':''}>${e.isSource?`<label class="source-settings-field"><span>名称</span><input name="name" value="${esc(d.name)}" maxlength="150" required></label>`:''}${originals||subscription||'<p class="subscription-hint">这份安排没有附带原件。</p>'}</fieldset><p class="error-message" role="alert" ${e.error?'':'hidden'}>${esc(e.error)}</p><footer><button type="button" class="outline-button source-settings-delete" data-calendar-action="delete-source" title="删除这份资料及其中的安排，保存后生效" ${e.busy?'disabled':''}>${icon('trash-2')}删除资料</button><button type="button" class="outline-button" data-calendar-action="close-source-settings" ${e.busy?'disabled':''}>取消</button><button type="submit" class="primary" ${e.busy?'disabled':''}>完成</button></footer></form></section></div>`;
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
 async function rereadTimetableSource(){
  const t=manager(),s=view(),e=s.sourceEditor;
  if(!e||e.busy||e.draft.kind!=='timetable'||e.draft.type!=='import')return;
  e.busy=true;e.error='';redraw();
  try{
   const result=await root.AcademicReferences.rereadTimetable(t,e.draft);
   if(manager()!==t)return;
   const old=t.timetable.filter(row=>row.source_id===e.id);
   const key=row=>JSON.stringify([courseCode(row.course),row.class_type,row.weekday,row.time,row.weeks]);
   const colors=new Map(old.map(row=>[key(row),row.color]));
   t.timetable=t.timetable.filter(row=>row.source_id!==e.id).concat(result.rows.map(row=>{
    const color=colors.get(key(row));
    return {...row,source_id:e.id,...(color?{color}:{})};
   }));
   const source=sourceOf(t,{source_id:e.id});
   if(source&&!source.semester&&/^[1-9]\d{3}-[1-9]\d?$/.test(result.semester||'')){
    source.semester=result.semester;s.semester=result.semester;
   }
   s.sourceEditor=null;
   t.importUI||={};t.importUI.notice='已重新识别 '+result.rows.length+' 项，请对照原图核对后保存。';
  }catch(error){e.error=error.message;}
  finally{e.busy=false;if(manager()===t)redraw();}
 }
 async function applySourceSettings(){
  const t=manager(),s=view(),e=s.sourceEditor;if(!e||e.busy||t.saving)return;
  const before=structuredClone(Object.fromEntries(['sources','calendar','timetable','events','colors','visible'].map(k=>[k,t[k]])));
  if(e.isSource){
   if(!e.draft.name?.trim()){e.error='请填写名称。';redraw();return;}
   const old=t.sources.find(row=>row.id===e.id);
   if(e.draft.type==='subscription'&&e.draft.url!==old.url&&e.loadedUrl!==e.draft.url){if(!await refreshSourceSettings()||manager()!==t)return;}
   const draft={...e.draft,name:e.draft.name.trim()};if(!e.colorExplicit&&draft.color===e.initialColor)delete draft.color;Object.assign(old,draft);
   if(e.result&&e.loadedUrl===e.draft.url)for(const key of ['calendar','timetable','events'])t[key]=t[key].filter(row=>row.source_id!==e.id).concat(e.result[key]||[]);
  }else{t.colors||={};if(e.colorExplicit||e.draft.color!==e.initialColor)t.colors[e.id]=e.draft.color;t.visible[e.id]=e.draft.visible;}
  s.sourceEditor=null;
  if(!await root.StudySchedule.save({quiet:true})){Object.assign(t,before);e.error=t.error||'保存失败，请重试。';t.error='';s.sourceEditor=e;redraw();return;}redraw();toast('已保存');
 }
 async function applyPeriodSettings(){
  const t=manager(),s=view(),e=s.sourceEditor;if(!e||t.saving)return;
  const v=e.periodDraft,start=Number(v.start),end=Number(v.end),termNumber=Number(v.term),school=e.draft.kind==='calendar';
  if(!Number.isInteger(start)||start<1000||start>9998||end!==start+1||!school&&(!Number.isInteger(termNumber)||termNumber<1||termNumber>99)){
   e.error='请填写连续的起止年份'+(school?'。':'和有效的学期（1–99）。');redraw();return;
  }
  const before=structuredClone({sources:t.sources,timetable:t.timetable}),cursor=s.cursor,semester=s.semester;
  const ids=new Set((e.periodSources||[e.draft]).map(source=>source.id));
  for(const source of t.sources)if(ids.has(source.id)){
   if(school)source.school_year=start;else source.semester=start+'-'+termNumber;
  }
  if(school)s.cursor=start+'-09-01';else s.semester=start+'-'+termNumber;
  s.sourceEditor=null;
  if(!await root.StudySchedule.save({quiet:true})){
   Object.assign(t,before);s.cursor=cursor;s.semester=semester;e.error=t.error||'保存失败，请重试。';t.error='';s.sourceEditor=e;
  }else toast('已保存');
  redraw();
 }
 function periodSources(t,kind,s){
  const ids=kind==='calendar'?new Set((schoolYearRows(t).get(schoolYearOf(s.cursor))||[]).map(row=>row.source_id)):null;
  return (t.sources||[]).filter(source=>source.kind===kind&&source.visible!==false&&
   (kind==='calendar'?ids.has(source.id):timetableGroup(t,{source_id:source.id})===s.semester));
 }
 function periodSettingsButton(t,kind,s){
  if(!periodSources(t,kind,s).length)return '';
  const label=kind==='calendar'?'学年设置':'学期设置';
  return `<button type="button" class="icon-button academic-period-settings" data-calendar-action="period-settings" aria-label="${label}" title="${label}">${icon('settings-2')}</button>`;
 }
 function referenceDocuments(t,kind){
  if(kind!=='exam')return '';
  const sources=(t.sources||[]).filter(source=>source.kind===kind&&source.visible!==false);
  if(!sources.length)return '';
  return `<div class="academic-documents" aria-label="已添加资料">${sources.map(source=>`<div class="academic-document">
   <button type="button" class="academic-document-name" data-calendar-action="source-settings" data-is-source="true" data-source-id="${esc(source.id)}" title="修改名称或查看原件">${esc(source.name)}${icon('ellipsis')}</button>
   ${root.AcademicReferences.originalLinks(t,source)}</div>`).join('')}</div>`;
 }
 function schoolYearPicker(years,year){
  const label=n=>`${n}–${n+1}`;
  if(!years.length)return '';
  if(years.length===1)return `<span class="school-year-label">${label(year)} 学年</span>`;
  return `<label class="school-year-control"><span>学年</span><select aria-label="选择学年" data-school-year>
   ${years.map(n=>`<option value="${n}" ${n===year?'selected':''}>${label(n)}</option>`).join('')}
  </select></label>`;
 }
 function markup(M,t,kind,{importPanel='',message='',navigation=''}={}){
  const s=view(M),school=kind==='calendar',timetable=kind==='timetable';
  if(s.scope!==kind){
   s.cursors[s.scope]=s.cursor;
   s.cursor=s.cursors[kind]||today();
   s.scope=kind;
  }
  const sections=school?schoolYearRows(t):null,years=sections?[...sections.keys()].sort((a,b)=>b-a):[];
  let year=school?schoolYearOf(s.cursor):null;
  if(years.length&&!years.includes(year)){year=years[0];s.cursor=year+'-09-01';}
  const picker=school?schoolYearPicker(years,year):timetable?semesterPicker(t,s):'';
  return `<section class="academic-calendar" aria-label="${school?'校历':timetable?'课表':'考试信息'}"><div class="calendar-body"><div class="calendar-main">
   <div class="calendar-navigation-row"><div class="calendar-view-actions academic-period-control">${picker}${school||timetable?periodSettingsButton(t,kind,s):''}</div><div class="calendar-view-actions">${root.AcademicReferences.addButton(kind)}</div></div>
   ${navigation}${referenceDocuments(t,kind,s)}${message}<div class="calendar-workspace ${s.editor?'has-editor':''}"><div class="calendar-canvas">${school?schoolMarkup(t,s,sections.get(year)):timetable?timetableMarkup(t,s):examMarkup(t)}</div>${editorMarkup(t,s)}</div></div></div>
   ${importPanel}${sourceSettingsMarkup(t,s)}</section>`;
 }
 function open(source,index,draft,original=null){const s=view();if(s.editor?.dirty){s.error='请先完成或取消当前编辑。';redraw();return;}s.error='';s.editor={source,index,draft:structuredClone(draft),dirty:false,original};redraw();document.querySelector('#calendar-event-form input')?.focus();}
 async function applyEditor(form){
  const M=manager(),t=term(),s=view(),e=s.editor;if(!e||M.saving)return;const before=structuredClone({calendar:t.calendar,timetable:t.timetable,events:t.events});const d=Object.fromEntries(new FormData(form));let row;
  if(e.source==='timetable'){
   if(!d.course.trim()||!d.time.trim())throw new Error('请填写课程和上课时间。');
   row={course:courseCode(d.course.trim()),class_type:d.class_type.trim(),weekday:Number(d.weekday),time:d.time.trim(),weeks:root.AcademicReferences.parseWeeks(d.weeks)};
   const semester=e.index>=0?e.draft.semester:s.semester;
   if(semester?.startsWith('import:'))row.source_id=semester.slice(7);
   else if(semester&&!e.draft.source_id)row.semester=semester;
  }else if(e.source==='calendar'){
   if(!d.start||!d.end||d.end<d.start)throw new Error('请填写有效的起止日期。');
   const week=d.week?Number(d.week):null;if(d.kind==='teaching'&&(!Number.isInteger(week)||week<1||week>60))throw new Error('请填写教学周（1–60）。');
   if(d.kind==='teaching'&&(dateOf(d.end)-dateOf(d.start))/86400000>6)throw new Error('请将每个教学周分别记录，最多 7 天。');
   if((t.calendar||[]).some((r,i)=>i!==e.index&&r.kind==='teaching'&&d.kind==='teaching'&&r.start<=d.end&&r.end>=d.start))throw new Error('日期与已有教学周重叠。');
   row={kind:d.kind,week,start:d.start,end:d.end,label:d.label.trim()};
  }else{
   if(!d.title.trim()||!d.date)throw new Error('请填写名称和日期。');
   if((d.start||d.end)&&(!d.start||!d.end||d.end<=d.start))throw new Error('请填写有效的起止时间；全天安排可同时留空。');
   row={id:e.draft.id||crypto.randomUUID(),title:d.title.trim(),kind:d.kind,date:d.date,start:d.start,end:d.end,...(d.location!==undefined?{location:d.location.trim()}:{})};
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
 function openManual(kind){
  const day=view().cursor;
  if(kind==='calendar')return open('calendar',-1,{kind:'teaching',week:weekAt(term(),day)??1,start:monday(day),end:addDays(monday(day),6),label:''});
  if(kind==='exam')return open('events',-1,{kind:'exam',title:'',date:today(),start:'',end:'',location:''});
  open('timetable',-1,{course:'',class_type:'',weekday:weekday(day)+1,time:'09:00–10:00',weeks:[]});
 }
 root.AcademicCalendar={openManual,learningWeek,learningWeekGrid,teachingWeekLabel,today,addDays,focusImported(M,kind,rows,source){
   const s=view(M);
   if(kind==='timetable'){
    if(source?.type==='import')s.semester=timetableGroup(M,{source_id:source.id});
    return;
   }
   if(kind==='calendar'&&source){
    const years=[...schoolYearRows(M)].filter(([,entries])=>entries.some(row=>row.source_id===source.id)).map(([year])=>year);
    if(years.length){s.cursor=Math.max(...years)+'-09-01';return;}
   }
   s.cursor=importedDate('calendar',rows,today());
  },markup,
  pending:M=>!!(M?.calendarView?.editor||M?.calendarView?.sourceEditor)
 };
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
   if(action==='period-settings'){
    if(s.editor){root.StudySchedule.reportError('请先完成或取消安排编辑。');return;}
    const sources=periodSources(t,s.scope,s);if(!sources.length)return;
    s.sourceEditor={draft:{kind:s.scope},periodSources:sources,busy:false};redraw();return;
   }
   if(action==='manage-timetable-import'){s.editor=null;openSourceSettings(node.dataset.sourceId,true);return;}
   if(action==='source-settings'){openSourceSettings(node.dataset.sourceId,node.dataset.isSource==='true');return;}
   if(action==='delete-source'){const e=s.sourceEditor;if(e&&!e.busy){removeCalendarSource(t,e.id,e.isSource);s.sourceEditor=null;t.importUI||={};t.importUI.notice='';redraw();toast('已删除，保存后生效');}return;}
   if(action==='close-source-settings'){if(!s.sourceEditor?.busy){s.sourceEditor=null;redraw();}return;}
   if(action==='refresh-source-settings'){await refreshSourceSettings();return;}
   if(action==='reread-timetable-source'){await rereadTimetableSource();return;}
   if(s.sourceEditor)return;
   if(action==='edit'){const [source,index]=node.dataset.entry.split(':');open(source,Number(index),t[source][Number(index)]);}
   else if(action==='close-editor'){s.editor=null;s.error='';redraw();}
   else if(action==='delete'){
    const e=s.editor,[removed]=t[e.source].splice(e.index,1);s.editor=null;
    if(s.scope==='calendar'){redraw();return;}
    if(!await root.StudySchedule.save({quiet:true})){
     t[e.source].splice(e.index,0,removed);s.editor=e;s.error=t.error||'删除失败，请重试。';t.error='';
    }else toast('已删除');
    redraw();
   }
   return;
  }
  const slot=event.target.closest('[data-calendar-slot]');
  if(slot){
   event.preventDefault();const s=view();if(s.editor)return;
   const offset=event.clientY-slot.getBoundingClientRect().top,start=event.detail===0?9*60:Math.max(0,Math.min(23*60,Math.floor((Number(slot.dataset.gridStart)*60+offset/HOUR*60)/30)*30));
   open('timetable',-1,{course:'',class_type:'',weekday:weekday(slot.dataset.calendarSlot)+1,time:`${clock(start)}–${clock(Math.min(1439,start+60))}`,weeks:[]});
  }
 },true);
 document.addEventListener('pointerdown',event=>{const slot=event.target.closest('[data-calendar-slot]');if(!slot||event.target.closest('button')||view().editor||root.AcademicReferences.busy(manager())||manager().saving)return;dragStart={slot,y:event.clientY};});
 document.addEventListener('pointerup',event=>{const start=dragStart;dragStart=null;if(!start||Math.abs(event.clientY-start.y)<6)return;const {slot}=start,top=slot.getBoundingClientRect().top,base=Number(slot.dataset.gridStart)*60;const minute=y=>Math.max(base,Math.min(1439,Math.floor((base+(y-top)/HOUR*60)/30)*30));const a=minute(Math.min(start.y,event.clientY)),b=Math.max(a+30,minute(Math.max(start.y,event.clientY)));suppressedSlotClick={until:event.timeStamp+300,day:slot.dataset.calendarSlot};open('timetable',-1,{course:'',class_type:'',weekday:weekday(slot.dataset.calendarSlot)+1,time:`${clock(a)}–${clock(Math.min(1439,b))}`,weeks:[]});});
 document.addEventListener('submit',async event=>{
  if(event.target.id==='calendar-period-settings-form'){event.preventDefault();event.stopImmediatePropagation();await applyPeriodSettings();return;}if(event.target.id==='calendar-source-settings-form'){event.preventDefault();event.stopImmediatePropagation();await applySourceSettings();return;}if(event.target.id!=='calendar-event-form')return;event.preventDefault();event.stopImmediatePropagation();try{await applyEditor(event.target);}catch(e){const s=view();s.error=e.message;const error=event.target.querySelector('[role="alert"]');error.hidden=false;error.textContent=e.message;}} ,true);
 document.addEventListener('input',event=>{if(event.target.closest('#calendar-period-settings-form')&&view().sourceEditor){view().sourceEditor.periodDraft[event.target.name]=event.target.value;return;}if(event.target.closest('#calendar-source-settings-form')&&event.target.name&&view().sourceEditor){view().sourceEditor.draft[event.target.name]=event.target.type==='checkbox'?event.target.checked:event.target.value;return;}if(event.target.closest('#calendar-event-form')&&event.target.name){const e=view().editor,{name,value}=event.target;e.dirty=true;if(event.target.hasAttribute('data-calendar-choice')&&value==='__new_calendar_value__')return;if(name==='weeks')e.draft._weeksText=value;else e.draft[name]=['weekday','week'].includes(name)?value?Number(value):null:value;root.StudySchedule.refreshActions();}});
 document.addEventListener('change',event=>{if(event.target.hasAttribute('data-calendar-choice')&&event.target.value==='__new_calendar_value__'&&view().editor){const name=event.target.name;view().editor.draft['_custom_'+name]=true;view().editor.draft[name]='';redraw();document.querySelector(`#calendar-event-form input[name="${name}"]`)?.focus();return;}if(event.target.name==='kind'&&event.target.closest('#calendar-event-form')&&view().editor?.source==='calendar'){view().editor.draft.kind=event.target.value;view().editor.draft.week=event.target.value==='teaching'?view().editor.draft.week||1:null;redraw();return;}if(event.target.hasAttribute('data-timetable-semester')){
   const t=manager(),s=view();
   if(root.AcademicReferences.pending(t)||t.saving){event.target.value=s.semester;root.StudySchedule.reportError('请先完成或取消当前操作。');return;}
   s.semester=event.target.value;redraw();
   document.querySelector('[data-timetable-semester]')?.focus();
  }
  if(event.target.hasAttribute('data-school-year')){
   const t=manager(),s=view();
   if(root.AcademicReferences.pending(t)||t.saving){
    event.target.value=schoolBounds(s.cursor,'year').start.slice(0,4);
    root.StudySchedule.reportError('请先完成或取消当前操作。');
    return;
   }
   s.cursor=event.target.value+'-09-01';redraw();
   document.querySelector('[data-school-year]')?.focus();
  }
 });

 document.addEventListener('pointerdown',event=>{for(const menu of document.querySelectorAll('.calendar-source-menu[open],.calendar-color-menu[open]'))if(!menu.contains(event.target))menu.removeAttribute('open');},true);
 document.addEventListener('keydown',event=>{if(!document.querySelector('.academic-calendar'))return;if(event.key==='Escape')document.querySelectorAll('.calendar-source-menu[open],.calendar-color-menu[open]').forEach(menu=>menu.removeAttribute('open'));if(event.key==='Escape'&&manager()&&view().sourceEditor){if(!view().sourceEditor.busy){view().sourceEditor=null;redraw();}return;}if(event.key==='Escape'&&manager()&&view().editor){event.preventDefault();view().editor=null;redraw();}else if(event.key==='Enter'&&event.target.hasAttribute('data-calendar-slot')){event.preventDefault();event.target.click();}});
})(typeof window==='undefined'?{}:window);
