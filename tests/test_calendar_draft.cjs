const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('inherited records stay out of the active calendar and survive save and cancel without becoming imports',async()=>{
 const inherited={kind:'teaching',week:1,start:'2025-09-01',end:'2025-09-07',calendar_group:'old'};
 const imported={kind:'teaching',week:8,start:'2026-11-02',end:'2026-11-08',source_id:'image'};
 let saved={calendar:[inherited,imported],timetable:[],events:[],references:[],sources:[{id:'image'}],colors:{},etag:'v1'},write;
 const listeners={},root={AcademicReferences:{pending:()=>false,busy:()=>false,validate(){}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../web/study-schedule.js'),'utf8'),{window:root,structuredClone,S:{user:{id:'owner'}},api:async(url,data)=>{if(data){write=data;saved=structuredClone(data);}return structuredClone(saved);},render(){},toast(){},document:{querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(type,fn)=>(listeners[type]||=[]).push(fn)}});
 await root.StudySchedule.prepare();let draft=root.StudySchedule.manager();assert.equal(draft.calendar.length,1);assert.equal(draft.calendar[0].source_id,'image');assert.equal(root.StudySchedule.dirty(),false);
 draft.calendar[0].label='changed';
 const click=action=>listeners.click[0]({target:{closest:()=>({dataset:{scheduleAction:action}})},preventDefault(){},stopImmediatePropagation(){}});
 await click('save');assert.equal(write.calendar.length,2);assert.deepEqual(JSON.parse(JSON.stringify(write.calendar[1])),inherited);assert.equal(root.StudySchedule.manager().calendar.length,1);assert.equal(root.StudySchedule.dirty(),false);
 root.StudySchedule.manager().calendar=[];await click('cancel');assert.equal(root.StudySchedule.manager().calendar.length,1);assert.equal(root.StudySchedule.dirty(),false);
});
test('the first toolbar or close click after dragging an event is never swallowed',async()=>{
 const model={calendar:[],timetable:[],events:[],sources:[],visible:{},calendarView:{cursor:'2026-11-07',mode:'week',editor:null}},listeners={};
 const root={StudySchedule:{manager:()=>model,paint(){},refreshActions(){}},AcademicReferences:{busy:()=>false}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../web/academic-calendar.js'),'utf8'),{window:root,structuredClone,document:{querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(type,fn)=>(listeners[type]||=[]).push(fn)}});
 const slot={dataset:{calendarSlot:'2026-11-07',gridStart:'7'},getBoundingClientRect:()=>({top:0})};
 const target={closest:selector=>selector==='[data-calendar-slot]'?slot:null};
 for(const fn of listeners.pointerdown)fn({target,clientY:10});
 for(const fn of listeners.pointerup)fn({target,clientY:80,timeStamp:1000});
 assert.ok(model.calendarView.editor);
 const button={dataset:{calendarAction:'close-editor'}};
 for(const fn of listeners.click)await fn({target:{closest:selector=>selector==='[data-calendar-action]'||selector==='button'?button:null},timeStamp:1100,preventDefault(){},stopImmediatePropagation(){}});
 assert.equal(model.calendarView.editor,null);
});
