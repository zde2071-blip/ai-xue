const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseWeeks,formatWeeks}=require('../web/academic-references.js');
test('teaching weeks preserve odd weeks and disjoint ranges',()=>{
 assert.deepEqual(parseWeeks('1–3, 5, 7-9'),[1,2,3,5,7,8,9]);
 assert.deepEqual(parseWeeks(''),[]);
 assert.equal(formatWeeks([1,2,3,5,7,8,9]),'1–3, 5, 7–9');
 for(const invalid of ['0','61','7-2','1,abc','1.5','1-100000'])assert.throws(()=>parseWeeks(invalid));
});

test('successful recognition creates an independent source without retaining uploaded originals',async()=>{
 const vm=require('node:vm'),fs=require('node:fs');
 const model={calendar:[],timetable:[],events:[],references:[],referenceFiles:[],importUI:{kind:'calendar',files:[{filename:'calendar.txt',file:'dGVzdA=='}],text:'',open:true,busy:false}};
 const listeners={};const root={StudySchedule:{manager:()=>model,paint(){}},AcademicCalendar:{pending:()=>false,reset(){}}};
 const row={kind:'teaching',week:1,start:'2026-09-07',end:'2026-09-13'},reference={id:'a'.repeat(64),kind:'calendar',filename:'calendar.txt'};
 vm.runInNewContext(fs.readFileSync(require.resolve('../web/academic-references.js'),'utf8'),{crypto:require('node:crypto').webcrypto,window:root,document:{addEventListener:(name,fn)=>(listeners[name]||=[]).push(fn)},S:{user:{id:'demo'}},api:async()=>({rows:[row],references:[reference],incomplete:true,reply:'十月尚未确认'})});
 const button={dataset:{referenceAction:'recognize'},closest:()=>null};
 await listeners.click[0]({target:{closest:()=>button},preventDefault(){},stopImmediatePropagation(){}});
 assert.match(model.importUI.notice,/十月尚未确认/);assert.equal(model.importUI.open,false);assert.equal(model.importUI.error,'');assert.deepEqual(JSON.parse(JSON.stringify(model.calendar[0])),{...row,source_id:model.sources[0].id});assert.equal(model.sources[0].name,'calendar');assert.equal(model.references.length,0);assert.equal(model.referenceFiles.length,0);
 const firstId=model.sources[0].id;model.importUI.files=[{filename:'calendar.txt',file:'dGVzdA=='}];await listeners.click[0]({target:{closest:()=>button},preventDefault(){},stopImmediatePropagation(){}});assert.equal(model.calendar.length,1);assert.equal(model.sources[0].id,firstId);
 model.importUI.files=[{filename:'second.txt',file:'dGVzdA=='}];await listeners.click[0]({target:{closest:()=>button},preventDefault(){},stopImmediatePropagation(){}});assert.equal(model.calendar.length,2);assert.notEqual(model.calendar[0].source_id,model.calendar[1].source_id);
});

test('handbook preview adds an undated course source only after confirmation',async()=>{
 const vm=require('node:vm'),fs=require('node:fs');
 const handbook={course:'ADS102',filename:'Handbook.pdf',entries:[{name:'Final exam',weight:'70%',timing:'Exam period',evidence:'Final exam 70% Exam period'}]};
 const model={course_choices:['ADS102'],calendar:[],timetable:[],events:[],sources:[],importUI:{mode:'handbook',handbookCourse:'ADS102',files:[{filename:'Handbook.pdf',file:'dGVzdA=='}],open:true}};
 const listeners={};const root={StudySchedule:{manager:()=>model,paint(){}},AcademicCalendar:{markup:(_m,_t,_kind,options)=>options.importPanel}};
 let request;
 vm.runInNewContext(fs.readFileSync(require.resolve('../web/academic-references.js'),'utf8'),{crypto:require('node:crypto').webcrypto,window:root,document:{addEventListener:(name,fn)=>listeners[name]=fn},S:{user:{id:'demo'}},icon:()=>'',toast(){},api:async(_path,data)=>{request=data;return {handbook,rows:[]};}});
 const click=action=>listeners.click({target:{closest:()=>({dataset:{referenceAction:action},closest:()=>null})},preventDefault(){},stopImmediatePropagation(){}});
 await click('recognize');
 assert.equal(request.handbook_course,'ADS102');assert.equal(model.sources.length,0);
 assert.match(root.AcademicReferences.markup(model),/核对手册原文/);
 await click('apply-handbook');
 assert.equal(model.sources[0].handbook,handbook);assert.equal(model.events.length,0);
 assert.equal(model.importUI.open,false);
});
