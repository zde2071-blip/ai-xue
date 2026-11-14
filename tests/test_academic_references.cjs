const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseWeeks,formatWeeks}=require('../web/academic-references.js');
test('teaching weeks preserve odd weeks and disjoint ranges',()=>{
 assert.deepEqual(parseWeeks('1–3, 5, 7-9'),[1,2,3,5,7,8,9]);
 assert.deepEqual(parseWeeks(''),[]);
 assert.equal(formatWeeks([1,2,3,5,7,8,9]),'1–3, 5, 7–9');
 for(const invalid of ['0','61','7-2','1,abc','1.5','1-100000'])assert.throws(()=>parseWeeks(invalid));
});

test('successful recognition stages each original with its calendar source',async()=>{
 const vm=require('node:vm'),fs=require('node:fs');
 const model={calendar:[],timetable:[],events:[],references:[],referenceFiles:[],importUI:{kind:'calendar',files:[{filename:'calendar.txt',file:'dGVzdA=='}],text:'',open:true,busy:false}};
 const listeners={};const root={StudySchedule:{manager:()=>model,paint(){}},AcademicCalendar:{pending:()=>false,reset(){}}};
 const row={kind:'teaching',week:1,start:'2026-09-07',end:'2026-09-13'},reference={id:'a'.repeat(64),kind:'calendar',filename:'calendar.txt'};
 vm.runInNewContext(fs.readFileSync(require.resolve('../web/academic-references.js'),'utf8'),{crypto:require('node:crypto').webcrypto,window:root,document:{addEventListener:(name,fn)=>(listeners[name]||=[]).push(fn)},S:{user:{id:'demo'}},icon:()=>'',api:async(_path,data)=>({rows:[row],references:[{...reference,id:data.attachments[0].filename==='second.txt'?'c'.repeat(64):reference.id,filename:data.attachments[0].filename}],incomplete:true,reply:'十月尚未确认'})});
 const button={dataset:{referenceAction:'recognize'},closest:()=>null};
 await listeners.click[0]({target:{closest:()=>button},preventDefault(){},stopImmediatePropagation(){}});
 assert.match(model.importUI.notice,/十月尚未确认/);assert.equal(model.importUI.open,false);assert.equal(model.importUI.error,'');assert.deepEqual(JSON.parse(JSON.stringify(model.calendar[0])),{...row,source_id:model.sources[0].id});assert.equal(model.sources[0].name,'calendar');
 assert.equal(model.sources[0].reference_ids[0],reference.id);assert.equal(model.references.length,1);assert.equal(model.referenceFiles[0].file,'dGVzdA==');
 assert.match(root.AcademicReferences.originalLinks(model,model.sources[0]),/保存后可打开/);
 const firstId=model.sources[0].id;model.importUI.files=[{filename:'calendar.txt',file:'dGVzdA=='}];await listeners.click[0]({target:{closest:()=>button},preventDefault(){},stopImmediatePropagation(){}});assert.equal(model.calendar.length,1);assert.equal(model.sources[0].id,firstId);
 model.importUI.files=[{filename:'second.txt',file:'dGVzdA=='}];await listeners.click[0]({target:{closest:()=>button},preventDefault(){},stopImmediatePropagation(){}});assert.equal(model.calendar.length,2);assert.notEqual(model.calendar[0].source_id,model.calendar[1].source_id);
 model.referenceFiles=[];
 assert.match(root.AcademicReferences.originalLinks(model,model.sources[0]),new RegExp('/api/academic-references/'+reference.id));
});

test('handbook preview adds an undated course source only after confirmation',async()=>{
 const vm=require('node:vm'),fs=require('node:fs');
 const handbook={course:'ADS102',filename:'Handbook.pdf',entries:[{name:'Final exam',weight:'70%',timing:'Exam period',evidence:'Final exam 70% Exam period'}]};
 const model={course_choices:['ADS102'],calendar:[],timetable:[],events:[],sources:[],importUI:{mode:'handbook',handbookCourse:'ADS102',files:[{filename:'Handbook.pdf',file:'dGVzdA=='}],open:true}};
 const listeners={};const root={StudySchedule:{manager:()=>model,paint(){}},AcademicCalendar:{markup:(_m,_t,_kind,options)=>options.importPanel}};
 let request;
 const reference={id:'b'.repeat(64),kind:'exam',filename:'Handbook.pdf'};
 vm.runInNewContext(fs.readFileSync(require.resolve('../web/academic-references.js'),'utf8'),{crypto:require('node:crypto').webcrypto,window:root,document:{addEventListener:(name,fn)=>listeners[name]=fn},S:{user:{id:'demo'}},icon:()=>'',toast(){},api:async(_path,data)=>{request=data;return {handbook,rows:[],references:[reference]};}});
 const click=action=>listeners.click({target:{closest:()=>({dataset:{referenceAction:action},closest:()=>null})},preventDefault(){},stopImmediatePropagation(){}});
 await click('recognize');
 assert.equal(request.handbook_course,'ADS102');assert.equal(model.sources.length,0);
 assert.match(root.AcademicReferences.markup(model),/核对手册原文/);
 await click('apply-handbook');
 assert.equal(model.sources[0].handbook,handbook);assert.equal(model.events.length,0);
 assert.equal(model.sources[0].reference_ids[0],reference.id);assert.equal(model.referenceFiles[0].filename,'Handbook.pdf');
 assert.equal(model.importUI.open,false);
});

test('the single add entry offers methods for the selected type and subscribes under that type',async()=>{
 const vm=require('node:vm'),fs=require('node:fs');
 const model={calendar:[],timetable:[],events:[],sources:[]};
 const listeners={};
 let manualKind,request;
 const root={
  StudySchedule:{manager:()=>model,paint(){}},
  AcademicCalendar:{markup:(_model,_term,_kind,options)=>options.importPanel,pending:()=>false,openManual:kind=>{manualKind=kind;},reset(){}}
 };
 vm.runInNewContext(fs.readFileSync(require.resolve('../web/academic-references.js'),'utf8'),{
  window:root,document:{addEventListener:(name,fn)=>listeners[name]=fn,querySelector:()=>null},S:{user:{id:'demo'}},icon:()=>'',api:async(path,data)=>{
   request={path,data};
   return {source:{id:'school',name:'School',kind:data.kind,type:'subscription',url:data.url},calendar:[],timetable:[],events:[],notice:''};
  }
 });
 const click=(action,attributes={})=>listeners.click({target:{closest:()=>({dataset:{referenceAction:action,...attributes}})},preventDefault(){},stopImmediatePropagation(){}});
 assert.match(root.AcademicReferences.addButton('timetable'),/aria-label="添加课表".*data-kind="timetable"/);
 await click('add',{kind:'timetable'});
 assert.match(root.AcademicReferences.markup(model,'timetable'),/aria-label="添加课表"/);
 assert.doesNotMatch(root.AcademicReferences.markup(model,'timetable'),/考试信息|Module Handbook/);
 await click('choose-method',{mode:'manual'});
 assert.equal(manualKind,'timetable');
 await click('add',{kind:'calendar'});
 assert.match(root.AcademicReferences.markup(model,'calendar'),/aria-label="添加校历"/);
 assert.doesNotMatch(root.AcademicReferences.markup(model,'calendar'),/订阅链接/);
 const choices=root.AcademicReferences.markup(model,'calendar');assert(choices.indexOf('手动添加')<choices.indexOf('AI 导入'));
 await click('choose-method',{mode:'subscription'});
 model.importUI.url='webcal://example.com/school';
 await click('load-subscription');
 assert.equal(request.path,'/api/calendar/subscribe');
 assert.equal(request.data.kind,'calendar');
 assert.equal(request.data.url,'https://example.com/school');
 assert.equal(model.sources[0].kind,'calendar');
});

test('imports create a semester from recognition and only update the same original',()=>{
 const vm=require('node:vm'),fs=require('node:fs');
 const model={calendar:[],timetable:[],events:[],sources:[],references:[],referenceFiles:[]};
 const root={};
 vm.runInNewContext(fs.readFileSync(require.resolve('../web/academic-references.js'),'utf8'),{
  window:root,document:{addEventListener(){}},crypto:require('node:crypto').webcrypto
 });
 const stage=(letter,semester,filename='课表.png')=>root.AcademicReferences.stageImport(model,'timetable',{
  semester,references:[{id:letter.repeat(64),kind:'timetable',filename}],rows:[{course:'ADS102'}]
 },[{file:'dGVzdA=='}],filename);
 const fall=stage('a','2026-1'),third=stage('b','2026-3'),unknown=stage('c','');
 assert.equal(fall.semester,'2026-1');
 assert.equal(third.semester,'2026-3');
 assert.equal(unknown.semester,undefined);
 assert.equal(model.timetable.length,3);
 const resolved=stage('c','2026-3','另存为课表.png');
 assert.equal(resolved.id,unknown.id);
 assert.equal(resolved.semester,'2026-3');
 assert.equal(model.sources.length,3);
 assert.equal(model.timetable.length,3);
 assert.equal(model.references.length,3);
});
