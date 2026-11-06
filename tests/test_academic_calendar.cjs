const {test}=require('node:test');const assert=require('node:assert/strict');
const C=require('../web/academic-calendar.js');
const term={calendar:[{kind:'teaching',week:1,start:'2026-09-07',end:'2026-09-13'},{kind:'break',week:null,start:'2026-09-14',end:'2026-09-20'},{kind:'teaching',week:2,start:'2026-09-21',end:'2026-09-27'}],timetable:[{course:'数学',class_type:'Lecture',weekday:1,time:'09:00–10:00',weeks:[1],location:'A101'},{course:'编程',class_type:'Lab',weekday:1,time:'第3–4节',weeks:[],location:''}],events:[{id:'exam',kind:'exam',date:'2026-09-07',title:'小测',start:'09:30',end:'10:30',location:'B101'}]};
test('month dates cross leap years and start on Monday without local timezone shifts',()=>{const days=C.monthDays('2028-02-08');assert.equal(days.length,35);assert.equal(C.weekday(days[0]),0);assert.ok(days.includes('2028-02-29'));assert.equal(C.addDays('2026-12-31',1),'2027-01-01');assert.equal(C.moveMonth('2026-12-31',1),'2027-01-01');});
test('school calendar skips holidays and never maps arbitrary dates to teaching weeks',()=>{assert.equal(C.weekAt(term,'2026-09-15'),null);assert.equal(C.weekAt(term,'2026-09-21'),2);assert.equal(C.weekAt(term,'2026-11-05'),null);assert.equal(C.firstDate(term,'2026-11-05'),'2026-09-07');});
test('weekly recurring lessons honor applicable weeks; exams can overlap lessons',()=>{assert.equal(C.entriesForDay(term,'2026-09-07').length,3);assert.equal(C.entriesForDay(term,'2026-09-21').length,1);assert.equal(C.entriesForDay(term,'2026-09-14').filter(e=>e.kind==='course').length,0);assert.equal(C.entriesForDay({...term,calendar:[]},'2026-09-07',1).filter(e=>e.kind==='course').length,2);});
test('period-only classes never acquire fabricated clock times',()=>{assert.equal(C.clockRange('第3–4节'),null);assert.deepEqual(C.clockRange('09:00–10:30'),{start:540,end:630});assert.equal(C.clockRange('25:00–26:00'),null);assert.equal(C.clockRange('12:00–11:00'),null);});
test('overlapping timed entries get separate columns and later clusters recover full width',()=>{const rows=C.timedLayout([{key:'a',range:{start:540,end:600}},{key:'b',range:{start:570,end:630}},{key:'c',range:{start:700,end:750}}]);assert.equal(rows[0].columns,2);assert.equal(rows[1].column,1);assert.equal(rows[2].columns,1);});

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
