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

test('source settings Done persists once and a version conflict preserves the editor without applying changes',async()=>{
 let stored={calendar:[],timetable:[],events:[],references:[],colors:{},sources:[{id:'image',kind:'calendar',type:'import',name:'原名称',visible:true}],etag:'v1'},writes=0,reject=false;
 const listeners={},root={AcademicReferences:{pending:()=>false,busy:()=>false,validate(){}}};
 const context={window:root,structuredClone,S:{user:{id:'owner'}},api:async(url,data)=>{if(data){writes++;assert.equal(data.etag,'v1');if(reject)throw new Error('日历已在其他位置修改');stored={...structuredClone(data),etag:'v2'};}return structuredClone(stored);},render(){},toast(){},document:{querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(type,fn)=>(listeners[type]||=[]).push(fn)}};
 for(const name of ['study-schedule.js','academic-calendar.js'])vm.runInNewContext(fs.readFileSync(require.resolve('../web/'+name),'utf8'),context);
 await root.StudySchedule.prepare();const m=root.StudySchedule.manager();
 function edit(name){m.calendarView={sourceEditor:{id:'image',isSource:true,busy:false,draft:{...m.sources[0],name},initialColor:'#808080'}};}
 async function done(){await listeners.submit[0]({target:{id:'calendar-source-settings-form'},preventDefault(){},stopImmediatePropagation(){}});}
 edit('新名称');await done();assert.equal(writes,1);assert.equal(stored.sources[0].name,'新名称');assert.equal(root.StudySchedule.dirty(),false);assert.equal(m.calendarView.sourceEditor,null);
 stored.etag='v1';await root.StudySchedule.prepare();const current=root.StudySchedule.manager();current.calendarView={sourceEditor:{id:'image',isSource:true,busy:false,draft:{...current.sources[0],name:'冲突编辑'},initialColor:'#808080'}};reject=true;await done();assert.equal(current.sources[0].name,'新名称');assert.equal(current.calendarView.sourceEditor.draft.name,'冲突编辑');assert.match(current.calendarView.sourceEditor.error,/其他位置/);assert.equal(stored.sources[0].name,'新名称');
});

test('period settings save once, update selected period, and preserve edits on conflict',async()=>{
 let stored={calendar:[{source_id:'school',kind:'teaching',week:1,start:'2026-09-07',end:'2026-09-13'},{source_id:'school',kind:'teaching',week:1,start:'2027-01-11',end:'2027-01-17'},{source_id:'school',kind:'teaching',week:1,start:'2027-05-03',end:'2027-05-09'}],timetable:[],events:[],references:[],colors:{},sources:[{id:'school',kind:'calendar',type:'import',name:'school'},{id:'classes',kind:'timetable',type:'import',name:'classes',semester:'2026-1'}],etag:'v1'},writes=0,reject=false;
 const listeners={},root={ExamCalendar:require('../web/exam-calendar.js'),AcademicReferences:{pending:()=>false,busy:()=>false,validate(){}}};
 const context={window:root,structuredClone,S:{user:{id:'owner'}},api:async(url,data)=>{if(data){writes++;if(reject)throw new Error('日历已在其他位置修改');stored={...structuredClone(data),etag:'v'+(writes+1)};}return structuredClone(stored);},render(){},toast(){},document:{querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(type,fn)=>(listeners[type]||=[]).push(fn)}};
 for(const name of ['study-schedule.js','academic-calendar.js'])vm.runInNewContext(fs.readFileSync(require.resolve('../web/'+name),'utf8'),context);
 await root.StudySchedule.prepare();const m=root.StudySchedule.manager();
 const done=()=>listeners.submit[0]({target:{id:'calendar-period-settings-form'},preventDefault(){},stopImmediatePropagation(){}});
 function edit(id,values){const source=m.sources.find(s=>s.id===id);m.calendarView={scope:source.kind,cursor:'2026-09-01',semester:'2026-1',sourceEditor:{draft:{kind:source.kind},periodSources:[source],periodDraft:values}};}
 edit('school',{start:2027,end:2028,term:1});await done();
 assert.equal(writes,1);assert.equal(stored.sources[0].school_year,2027);assert.equal(stored.calendar[0].start,'2026-09-07');assert.equal(m.calendarView.cursor,'2027-09-01');assert.equal(root.StudySchedule.dirty(),false);
 edit('classes',{semester:'2027-3'});await done();assert.equal(writes,2);assert.equal(stored.sources[1].semester,'2027-3');assert.equal(m.calendarView.semester,'2027-3');
 edit('classes',{semester:'2028-99'});await done();assert.equal(writes,2);assert.ok(m.calendarView.sourceEditor.error);
 edit('classes',{semester:'2027-2'});reject=true;await done();assert.equal(m.sources[1].semester,'2027-3');assert.equal(m.calendarView.sourceEditor.periodDraft.semester,'2027-2');assert.match(m.calendarView.sourceEditor.error,/其他位置/);
});
