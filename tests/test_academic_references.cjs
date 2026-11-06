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
