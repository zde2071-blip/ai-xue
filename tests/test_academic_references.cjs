const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseWeeks,formatWeeks}=require('../web/academic-references.js');
test('teaching weeks preserve odd weeks and disjoint ranges',()=>{
 assert.deepEqual(parseWeeks('1–3, 5, 7-9'),[1,2,3,5,7,8,9]);
 assert.deepEqual(parseWeeks(''),[]);
 assert.equal(formatWeeks([1,2,3,5,7,8,9]),'1–3, 5, 7–9');
 for(const invalid of ['0','61','7-2','1,abc','1.5','1-100000'])assert.throws(()=>parseWeeks(invalid));
});

test('successful file recognition attaches its original and leaves a savable draft',async()=>{
 const vm=require('node:vm'),fs=require('node:fs');
 const model={calendar:[],timetable:[],events:[],references:[],referenceFiles:[],importUI:{kind:'calendar',files:[{filename:'calendar.txt',file:'dGVzdA=='}],text:'',open:true,busy:false}};
 const listeners={};const root={StudySchedule:{manager:()=>model,paint(){}},AcademicCalendar:{pending:()=>false,reset(){}}};
 const row={kind:'teaching',week:1,start:'2026-09-07',end:'2026-09-13'},reference={id:'a'.repeat(64),kind:'calendar',filename:'calendar.txt'};
 vm.runInNewContext(fs.readFileSync(require.resolve('../web/academic-references.js'),'utf8'),{window:root,document:{addEventListener:(name,fn)=>(listeners[name]||=[]).push(fn)},S:{user:{id:'demo'}},api:async()=>({rows:[row],references:[reference]})});
 const button={dataset:{referenceAction:'recognize'},closest:()=>null};
 await listeners.click[0]({target:{closest:()=>button},preventDefault(){},stopImmediatePropagation(){}});
 assert.equal(model.importUI.open,false);assert.equal(model.importUI.error,'');assert.equal(model.calendar[0],row);assert.equal(model.references[0],reference);assert.equal(model.referenceFiles[0].filename,'calendar.txt');
});
