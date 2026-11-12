const {test}=require('node:test');const assert=require('node:assert/strict');
const C=require('../web/academic-calendar.js');
const term={calendar:[{kind:'teaching',week:1,start:'2026-09-07',end:'2026-09-13'},{kind:'break',week:null,start:'2026-09-14',end:'2026-09-20'},{kind:'teaching',week:2,start:'2026-09-21',end:'2026-09-27'}],timetable:[{course:'数学',class_type:'Lecture',weekday:1,time:'09:00–10:00',weeks:[1],location:'A101'},{course:'编程',class_type:'Lab',weekday:1,time:'第3–4节',weeks:[],location:''}],events:[{id:'exam',kind:'exam',date:'2026-09-07',title:'小测',start:'09:30',end:'10:30',location:'B101'}]};
test('month dates cross leap years and start on Monday without local timezone shifts',()=>{const days=C.monthDays('2028-02-08');assert.equal(days.length,35);assert.equal(C.weekday(days[0]),0);assert.ok(days.includes('2028-02-29'));assert.equal(C.addDays('2026-12-31',1),'2027-01-01');assert.equal(C.moveMonth('2026-12-31',1),'2027-01-01');});
test('school calendar skips holidays and never maps arbitrary dates to teaching weeks',()=>{assert.equal(C.weekAt(term,'2026-09-15'),null);assert.equal(C.weekAt(term,'2026-09-21'),2);assert.equal(C.weekAt(term,'2026-11-05'),null);assert.equal(C.firstDate(term,'2026-11-05'),'2026-09-07');});
test('weekly recurring lessons honor applicable weeks; exams can overlap lessons',()=>{assert.equal(C.entriesForDay(term,'2026-09-07').length,3);assert.equal(C.entriesForDay(term,'2026-09-21').length,1);assert.equal(C.entriesForDay(term,'2026-09-14').filter(e=>e.kind==='course').length,0);assert.equal(C.entriesForDay({...term,calendar:[]},'2026-09-07',1).filter(e=>e.kind==='course').length,2);});
test('period-only classes never acquire fabricated clock times',()=>{assert.equal(C.clockRange('第3–4节'),null);assert.deepEqual(C.clockRange('09:00–10:30'),{start:540,end:630});assert.equal(C.clockRange('25:00–26:00'),null);assert.equal(C.clockRange('12:00–11:00'),null);});
test('overlapping timed entries get separate columns and later clusters recover full width',()=>{const rows=C.timedLayout([{key:'a',range:{start:540,end:600}},{key:'b',range:{start:570,end:630}},{key:'c',range:{start:700,end:750}}]);assert.equal(rows[0].columns,2);assert.equal(rows[1].column,1);assert.equal(rows[2].columns,1);});

test('a minimum card height keeps short adjacent lessons clickable without overlap',()=>{
 const lessons=[{key:'short',range:{start:540,end:560}},{key:'next',range:{start:560,end:620}}];
 const ordinary=C.timedLayout(lessons);
 const compact=C.timedLayout(lessons,40);
 assert.deepEqual(ordinary.map(row=>row.columns),[1,1]);
 assert.deepEqual(compact.map(row=>[row.column,row.columns]),[[0,2],[1,2]]);
 assert.equal(compact[0].range.end,560);
});

test('a one-day holiday suppresses recurring classes while preserving its teaching week',()=>{const t={...term,calendar:[...term.calendar,{kind:'break',week:null,start:'2026-09-07',end:'2026-09-07',label:'假期'}]};assert.equal(C.weekAt(t,'2026-09-07'),1);assert.equal(C.entriesForDay(t,'2026-09-07').filter(e=>e.kind==='course').length,0);assert.equal(C.entriesForDay(t,'2026-09-07').filter(e=>e.kind==='exam').length,1);});

test('multiday periods span the correct weekdays and overlapping periods use separate lanes',()=>{const t={calendar:[{kind:'teaching',week:8,start:'2026-11-02',end:'2026-11-08'},{kind:'break',start:'2026-11-05',end:'2026-11-05'}]},days=Array.from({length:7},(_,i)=>C.addDays('2026-11-02',i));const rows=C.periodLanes(t,days);assert.deepEqual(rows.map(r=>[r.left,r.span,r.lane]),[[0,7,0],[3,1,1]]);assert.deepEqual(C.periodLanes({...t,visible:{calendar:false}},days),[]);});
test('hiding course content retains the calendar mapping used to resolve dated lessons',()=>{const before=JSON.stringify(term),hidden={...term,visible:{calendar:false,timetable:true,exam:false}};assert.equal(C.weekAt(hidden,'2026-09-07'),1);assert.equal(C.entriesForDay(hidden,'2026-09-07').length,2);assert.equal(C.entriesForDay({...term,visible:{timetable:false}},'2026-09-07').length,1);assert.equal(JSON.stringify(term),before);});
test('legacy course schedules use their own calendar instead of another years Week 1',()=>{const t={calendar:[{kind:'teaching',week:1,start:'2025-09-01',end:'2025-09-07',calendar_group:'old'},{kind:'teaching',week:1,start:'2026-09-07',end:'2026-09-13',calendar_group:'new'}],timetable:[{...term.timetable[0],calendar_group:'old'}]};assert.equal(C.entriesForDay(t,'2026-09-07').length,0);assert.equal(C.entriesForDay(t,'2025-09-01').length,1);});

test('calendar colors inherit category defaults and allow a per-entry override',()=>{
 const {colorFor,colorStyle}=require('../web/academic-calendar.js');
 const t={colors:{calendar:'#808080',timetable:'#527eac',exam:'#a07848'}};
 assert.equal(colorFor(t,'timetable',{}),'#527eac');
 assert.equal(colorFor(t,'timetable',{color:'#8070a0'}),'#8070a0');
 assert.equal(colorFor(t,'calendar',{kind:'exam'}),'#a07848');
 assert.equal(colorFor(t,'events',{}),'#a07848');
 assert.ok(!colorStyle('red;position:fixed').includes('position'));
});
test('day view clips multiday spans to its one visible day',()=>{
 const {periodLanes}=require('../web/academic-calendar.js');
 const rows=periodLanes({calendar:[{kind:'teaching',week:8,start:'2026-11-02',end:'2026-11-08'}]},['2026-11-06']);
 assert.equal(rows.length,1);assert.equal(rows[0].left,0);assert.equal(rows[0].span,1);
});
test('sources independently control visibility and color without losing week mappings',()=>{
 const t={...structuredClone(term),sources:[{id:'a',visible:false,color:'#527eac'},{id:'b',visible:true,color:'#548568'}]};
 t.timetable[0].source_id='a';t.timetable[1].source_id='b';
 assert.equal(C.entriesForDay(t,'2026-09-07').length,2);
 assert.equal(C.colorFor(t,'timetable',t.timetable[0]),'#527eac');
 t.sources[0].visible=true;assert.equal(C.entriesForDay(t,'2026-09-07').length,3);
 t.calendar.push({kind:'nonteaching',start:'2026-09-07',end:'2026-09-07',source_id:'holiday'});t.sources.push({id:'holiday',type:'subscription'});
 assert.equal(C.entriesForDay(t,'2026-09-07').filter(e=>e.kind==='course').length,2);
});
test('empty and inherited calendars do not create uploaded sources',()=>{
 assert.equal(C.localSource({calendar:[],timetable:[],events:[]},'calendar'),null);
 const t={calendar:[{kind:'teaching',calendar_group:'university|2|1'},{kind:'exam',calendar_group:'university|2|1'}]};
 assert.equal(C.localSource(t,'calendar'),null);
 assert.equal(C.localSource(t,'exam'),null);
 assert.equal(C.localSource({events:[{id:'manual'}]},'exam').name,'手动添加');
 assert.equal(C.localSource({calendar:[{kind:'teaching',source_id:'imported'}]},'calendar'),null);
});
test('deleting a source removes only its linked draft records and leaves cancellation possible',()=>{
 const baseline={sources:[{id:'a'},{id:'b'}],calendar:[{source_id:'a',kind:'teaching'},{kind:'break'}],timetable:[{source_id:'a'},{source_id:'b'}],events:[{source_id:'a'},{source_id:'b'},{id:'manual'}],references:[{id:'original'}]};
 const draft=structuredClone(baseline);C.removeCalendarSource(draft,'a');
 assert.deepEqual(draft.sources,[{id:'b'}]);assert.deepEqual(draft.calendar,[{kind:'break'}]);assert.deepEqual(draft.timetable,[{source_id:'b'}]);assert.deepEqual(draft.events,[{source_id:'b'},{id:'manual'}]);
 assert.equal(baseline.calendar.length,2);assert.equal(baseline.events.length,3);assert.deepEqual(draft.references,baseline.references);
 const after=JSON.stringify(draft);C.removeCalendarSource(draft,'missing');assert.equal(JSON.stringify(draft),after);
});
test('removing legacy calendar records does not remove another source or the separate exam group',()=>{
 const t={calendar:[{kind:'teaching',calendar_group:'old'},{kind:'exam',calendar_group:'old'},{kind:'teaching',source_id:'imported'}],timetable:[{course:'Math'}],events:[{id:'test'}],sources:[{id:'imported'}]};
 C.removeCalendarSource(t,'calendar',false);assert.equal(C.localSource(t,'calendar'),null);assert.equal(t.calendar.length,2);assert.equal(t.timetable.length,1);assert.equal(t.events.length,1);assert.equal(t.sources.length,1);
 C.removeCalendarSource(t,'exam',false);assert.equal(t.calendar.length,1);assert.equal(t.events.length,0);assert.equal(t.calendar[0].source_id,'imported');
});

test('import focuses dates that actually have imported content',()=>{
 const {importedDate}=require('../web/academic-calendar.js');
 const rows=[{start:'2026-09-07',end:'2026-09-13'},{start:'2026-12-07',end:'2026-12-13'}];
 assert.equal(importedDate('calendar',rows,'2026-11-07'),'2026-09-07');
 assert.equal(importedDate('calendar',rows,'2026-12-10'),'2026-12-10');
 assert.equal(importedDate('exam',[{date:'2027-01-05'}],'2026-11-07'),'2027-01-05');
 assert.equal(importedDate('timetable',[],'2026-11-07'),'2026-11-07');
});

test('dated subscription courses keep their source category instead of becoming exams',()=>{
 const t={sources:[{id:'school',kind:'timetable'},{id:'exam',kind:'exam'},{id:'calendar',kind:'calendar'}]};
 assert.equal(C.editorCategory(t,'events',{source_id:'school'}),'timetable');
 assert.equal(C.editorCategory(t,'events',{source_id:'exam'}),'events');
 assert.equal(C.editorCategory(t,'events',{source_id:'calendar'}),'calendar');
 assert.equal(C.editorCategory(t,'events',{}),'events');
});

test('the learning week combines dated subscriptions and recurring classes without pulling in exams or holiday recurrences',()=>{
 const {learningWeek}=require('../web/academic-calendar.js');
 const calendar=[
  {kind:'teaching',week:8,start:'2026-11-02',end:'2026-11-06',calendar_group:'current'},
  {kind:'teaching',week:8,start:'2025-11-03',end:'2025-11-07',calendar_group:'old'},
  {kind:'break',start:'2026-11-04',end:'2026-11-04'},
 ];
 const row={course:'ADS102',class_type:'Lecture',time:'09:00–11:00',weeks:[8],calendar_group:'current'};
 const week=learningWeek({calendar,timetable:[{...row,weekday:2},{...row,weekday:3},{...row,weekday:2,course:'OLD100',calendar_group:'old'}],
  sources:[{id:'school',kind:'timetable',type:'subscription'},{id:'exams',kind:'exam'},{id:'off',kind:'timetable',visible:false}],
  events:[{title:'CSI101',date:'2026-11-05',start:'14:00',end:'16:00',kind:'event',source_id:'school'},
  {title:'Hidden',date:'2026-11-05',kind:'event',source_id:'off'},
  {title:'Exam',date:'2026-11-05',kind:'exam',source_id:'exams'}]},'2026-11-07');
 assert.deepEqual([week.start,week.end,week.weeks],['2026-11-02','2026-11-08',[8]]);
 assert.deepEqual(week.days.flatMap(d=>d.classes.map(c=>[c.course,c.week,c.date])),[['ADS102',8,'2026-11-03'],['CSI101',8,'2026-11-05']]);
});
test('a dated lesson is still available without a teaching calendar and is not assigned a guessed week',()=>{
 const {learningWeek}=require('../web/academic-calendar.js');
 const week=learningWeek({sources:[{id:'school',kind:'timetable'}],events:[{title:'ADS102',source_id:'school',date:'2026-11-06',start:'09:00',end:'11:00'}]},'2026-11-07');
 assert.deepEqual(week.weeks,[]);
 assert.equal(week.days[4].classes[0].week,null);
});

test('learning cards show the course code and actual class type while time stays in the axis',()=>{
 const date='2026-11-03';
 const html=C.learningWeekGrid({days:[{date,classes:[
  {date,course:'ads 102 · 离散数学与统计',classType:'Lecture',time:'09:00–09:30',completed:true},
  {date,course:'SOE101',classType:'',time:'10:00–11:00'}
 ]}]},date);
 const cards=Array.from(html.matchAll(/<button [^>]+data-learning-action="lesson"[^>]*>(.*?)<\/button>/g),match=>match[1]);
 assert.equal(cards.length,2);
 assert.match(cards[0],/^<strong>ADS102<\/strong><small>Lecture<\/small>/);
 assert.match(cards[0],/learning-lesson-check/);
 assert.equal(cards[1],'<strong>SOE101</strong>');
 assert.match(html,/<div class="week-hours">[^<]*<span [^>]*>09:00<\/span>/);
});

test('school calendar uses September through August and keeps school examination periods only',()=>{
 const day='2027-02-15';
 assert.deepEqual(C.schoolBounds(day,'year'),{start:'2026-09-01',end:'2027-08-31'});
 assert.deepEqual(C.schoolBounds(day,'month'),{start:'2027-02-01',end:'2027-02-28'});
 assert.deepEqual(C.schoolBounds(day,'week'),{start:day,end:'2027-02-21'});
 const period={kind:'exam',start:day,end:'2027-02-19',label:'学校考试周'};
 const data={sources:[{id:'exams',kind:'exam'},{id:'school',kind:'calendar'}],
  calendar:[{...period,source_id:'school'},{...period,source_id:'exams',label:'独立考试信息'}],
  events:[{source_id:'exams',kind:'exam',date:day,title:'单场考试'}]};
 assert.deepEqual(C.schoolRows(data,day,'2027-02-21').map(row=>row.title),['学校考试周']);
});

test('timetable retains independent weeks and displays dated lessons from timetable sources',()=>{
 const day='2026-09-07';
 const data={...term,sources:[{id:'classes',kind:'timetable'},{id:'exams',kind:'exam'}],
  events:[...term.events,{source_id:'classes',title:'ENG102',date:day,start:'14:00',end:'15:00'},
   {source_id:'exams',title:'Standalone exam',date:day,start:'14:00',end:'15:00'}]};
 assert.deepEqual(C.timetableEntries(data,day).map(row=>row.title),['数学','编程','ENG102']);
 assert.deepEqual(C.timetableEntries(data,day,2).map(row=>row.title),['编程']);
 assert.deepEqual(C.timetableEntries(data,day,'all').map(row=>row.title),['数学','编程']);
});

test('semesters isolate the timetable and learning week while exams stay separate',()=>{
 const {timetableSemesters,timetableEntries,examEntries,learningWeek}=require('../web/academic-calendar.js');
 const lesson={weekday:2,time:'11:00–12:50',weeks:[1],class_type:'Lecture'};
 const doc={
  sources:[{id:'fall',kind:'timetable',type:'import',semester:'2026-1'}],
  calendar:[{kind:'teaching',week:1,start:'2026-09-07',end:'2026-09-13'},
   {kind:'exam',start:'2027-01-11',end:'2027-01-15'}],
  timetable:[{...lesson,course:'ADS102',source_id:'fall'},{...lesson,course:'ISA104',semester:'2026-2'}],
  events:[{id:'exam',kind:'exam',title:'ADS102 final',date:'2027-01-12'}]
 };
 assert.deepEqual(timetableSemesters(doc),['2026-2','2026-1']);
 assert.deepEqual(timetableEntries(doc,'2026-09-08','all','2026-2').map(row=>row.title),['ISA104']);
 assert.deepEqual(learningWeek(doc,'2026-09-08').days[1].classes.map(row=>row.course),['ADS102']);
 assert.deepEqual(examEntries(doc).map(row=>row.title),['ADS102 final']);
});

test('learning week follows the third teaching term when the school calendar marks its first week',()=>{
 const {semesterForDate,learningWeek,timetableSemesters}=require('../web/academic-calendar.js');
 const calendar=['2026-09-07','2027-01-11','2027-04-05'].map(start=>({
  kind:'teaching',week:1,start,end:C.addDays(start,6)
 }));
 const lesson={weekday:2,time:'11:00–12:50',weeks:[1],class_type:'Lecture'};
 const doc={calendar,timetable:[
  {...lesson,course:'FALL101',semester:'2026-1'},
  {...lesson,course:'WINTER101',semester:'2026-2'},
  {...lesson,course:'SPRING101',semester:'2026-3'},
  {...lesson,course:'TERM101',semester:'2026-10'},
 ]};
 assert.equal(semesterForDate('2027-01-12',doc),'2026-2');
 assert.deepEqual(learningWeek(doc,'2027-04-06').days[1].classes.map(row=>row.course),['SPRING101']);
 assert.deepEqual(timetableSemesters(doc),['2026-10','2026-3','2026-2','2026-1']);
});

test('year options come from added calendar entries, with orientation and summer spill assigned to their source year',()=>{
 const sources=[{id:'annual',kind:'calendar',type:'import'}];
 const calendar=[
  {source_id:'annual',kind:'nonteaching',start:'2026-08-31',end:'2026-09-06',label:'Orientation'},
  {source_id:'annual',kind:'teaching',week:1,start:'2026-09-07',end:'2026-09-13'},
  {source_id:'annual',kind:'nonteaching',start:'2027-08-09',end:'2027-09-05',label:'Summer School'}
 ];
 assert.deepEqual(C.schoolYears({}),[]);
 assert.deepEqual(C.schoolYears({sources,calendar},'2030-11-10'),[2026]);
 const [year,rows]=[...C.schoolYearRows({sources,calendar})][0];
 assert.equal(year,2026);
 assert.equal(rows[0].start,'2026-08-31');
 assert.equal(rows.at(-1).end,'2027-09-05');
 calendar.push({kind:'teaching',week:1,start:'2027-09-06',end:'2027-09-12'});
 assert.deepEqual(C.schoolYears({sources,calendar}),[2027,2026]);
});

test('undated imported timetables stay separate and cannot leak into the learning week',()=>{
 const day='2026-09-07',course={weekday:1,time:'11:00–12:50',weeks:[1],class_type:'Lecture'};
 const doc={sources:[
  {id:'a',kind:'timetable',type:'import'},
  {id:'b',kind:'timetable',type:'import'},
  {id:'fall',kind:'timetable',type:'import',semester:'2026-1'},
 ],calendar:[{kind:'teaching',week:1,start:day,end:'2026-09-13'}],timetable:[
  {...course,course:'AAA101',source_id:'a'},
  {...course,course:'BBB101',source_id:'b'},
  {...course,course:'CCC101',source_id:'fall'},
 ]};
 assert.equal(C.timetableSemesters(doc).length,3);
 assert.deepEqual(C.timetableEntries(doc,day,'all','import:b').map(row=>row.title),['BBB101']);
 assert.deepEqual(C.learningWeek(doc,day).days[0].classes.map(row=>row.course),['CCC101']);
});

test('explicit calendar school year changes its grouping without changing dated records',()=>{
 const doc={sources:[{id:'school',kind:'calendar',school_year:2027}],calendar:[{source_id:'school',kind:'teaching',week:1,start:'2026-09-07',end:'2026-09-13'}]};
 assert.deepEqual(C.schoolYears(doc),[2027]);assert.equal(C.schoolYearRows(doc).get(2027)[0].start,'2026-09-07');
});
