const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const {readFileSync}=require('node:fs');const {join}=require('node:path');const {records,markCompleted}=require('../web/learning-home.js');
const courses=[{id:'a',title:'集合与关系',status:'paused',notes:[{id:'partial-note'}],active:'b2',completed:['b1'],blocks:[{id:'b1',title:'集合'},{id:'b2',title:'关系'}],updated_at:'2026-10-25'}, {id:'b',title:'已学完的课程',status:'completed',blocks:[],completed:[],updated_at:'2026-10-26'}];
const entries=[{id:'source-a',unit_id:'a',title:'source.md',course:'ADS102',weeks:[2],available:true},{id:'duplicate',unit_id:'a',title:'same source',course:'ADS102',weeks:[2],available:true},{id:'source-b',unit_id:'b',title:'done',course:'B',weeks:[],available:true},{id:'unstarted',title:'待学习.pdf',course:'C',weeks:[3],available:true}];
test('continue list preserves resume location, deduplicates units and excludes completed sessions',()=>{const rows=records(courses,entries);assert.deepEqual(rows.map(r=>r.id),['source-a','unstarted']);assert.equal(rows[0].location,'关系');assert.equal(rows[1].location,'尚未开始');assert.ok(!records(courses,entries,{all:true}).some(row=>row.unit_id==='b'));});
test('history search includes course and weeks without mutating the source records',()=>{const before=JSON.stringify(entries);assert.deepEqual(records(courses,entries,{query:'ADS102 Week 2'}).map(r=>r.id),['source-a']);assert.equal(JSON.stringify(entries),before);});
test('learning opens on import and conversation records, while review uses a nested reading directory',()=>{
 const listeners=[];const context=vm.createContext({document:{querySelector:()=>({addEventListener(){}}),addEventListener:(name,fn)=>listeners.push([name,fn])},window:{addEventListener(){}},localStorage:{getItem:()=>null,setItem(){}},clearTimeout(){}});
 for(const name of ['unit-workspace.js','academic-workspace.js','learning-home.js','classified-navigation.js','app.js'])vm.runInContext(readFileSync(join(__dirname,'../web',name),'utf8').replace(/\ninit\(\);\s*$/,''),context);
 vm.runInContext(`S.user={id:'home-test'};S.profile={};S.view='library';S.courses=${JSON.stringify(courses)};S.resources=${JSON.stringify(entries.map(r=>({...r,kind:'originals'})))};`,context);
 const home=vm.runInContext('library()',context);assert.match(home,/学习首页/);assert.match(home,/选择课件/);assert.match(home,/继续学习/);assert.doesNotMatch(home,/全部记录|data-learning-action="filter"|learning-import-mark|learning-drop-hint/);assert.doesNotMatch(home,/classified-columns|快速分类|排序方式/);assert.doesNotMatch(home,/切换学期/);
 const review=vm.runInContext(`S.view='note';library()`,context);assert.match(review,/review-file-tree/);assert.doesNotMatch(review,/learning-import/);
});

test('confirmed blocks awaiting note finalization stay reachable with an accurate label',()=>{const row=records([{...courses[0],completed:['b1','b2']}],entries)[0];assert.equal(row.location,'待整理笔记');});

test('scheduled imports wait for confirmation, and ordinary imports suggest editable course tags',async()=>{
 const listeners={};let shown='',sent=null,form=null,templateHint=null;
 const picker={click(){}},region={querySelector:()=>null};
 const calendar={course_choices:['ADS102','CSI101'],timetable:[{course:'ADS102',weekday:2,time:'09:00–11:00',weeks:[8,9],class_type:'Lecture'}],calendar:[{kind:'teaching',week:8,start:'2026-11-02',end:'2026-11-08'},{kind:'teaching',week:9,start:'2026-11-09',end:'2026-11-15'}]};
 const helper=require('../web/academic-calendar.js');
 const modal={open:true,contains:target=>target===form};
 const window={
  AcademicCalendar:{...helper,today:()=> '2026-11-07',teachingWeekLabel:weeks=>weeks.join(',')},
  AcademicReferences:require('../web/academic-references.js'),
  StudyTemplates:{prepare:async()=>({}),templateName:type=>({Tutorial:'题目讲解',Lab:'实验记录'}[type]||'知识点总结')},
  StudyUnits:{importFile:async (file,context)=>{sent=context;}}
 };
 const document={querySelector:id=>id==='#learning-current-week'?region:id==='#learning-import-confirm'?form:picker,addEventListener:(name,fn)=>{listeners[name]=fn;}};
 let recognizedCourse='CSI101',recognitionCalls=0;
 const api=async path=>{if(path==='/api/calendar')return calendar;recognitionCalls++;return {course_title:recognizedCourse,course_choices:calendar.course_choices,fields:{weeks:[8],class_type:'Tutorial'}};};
 const modalContent=(title,body)=>{
  shown=title+body;
  if(!body.includes('id="learning-import-confirm"'))return;
  const status={},submit={disabled:body.includes('disabled')},error={};templateHint={};
  const elements=Object.fromEntries(['course','weeks','class_type_choice','class_type_custom'].map(name=>[name,{value:'',dataset:{}}]));
  elements.class_type_choice.options=['','Lecture','Tutorial','Lab','__custom__'].map(value=>({value}));
  form={id:'learning-import-confirm',elements,querySelector:s=>s==='[data-import-status]'?status:s==='[data-import-error]'?error:s==='[data-import-template]'?templateHint:submit};
  for(const [name,field] of Object.entries(elements))Object.assign(field,{name,form});
 };
 const context=vm.createContext({window,document,modal,S:{user:{id:'a'},courses:[{id:'existing',title:'集合与关系',tags:{course:'ADS102 · 离散数学与统计',weeks:[8],class_type:'Lecture'}}]},api,readUpload:async()=> 'content',icons(){},esc:String,icon:()=>'',modalContent,toast:assert.fail});
 vm.runInContext(readFileSync(join(__dirname,'../web/learning-home.js'),'utf8'),context);
 window.StudyLearningHome.install();await window.StudyLearningHome.mount();
 assert.match(region.innerHTML,/点课程卡片/);
 const event=target=>({target,preventDefault(){},stopImmediatePropagation(){}});
 const click=dataset=>listeners.click(event({closest:()=>({dataset})}));
 const change=id=>listeners.change({target:{id,files:[{name:'Week 8.md',size:300}],value:'chosen'}});
 const submit=()=>listeners.submit(event(form));

 await click({learningAction:'lesson',date:'2026-11-03',index:'0'});
 assert.match(shown,/继续学习 · 集合与关系/);
 await change('learning-lesson-file');
 assert.match(shown,/确认课件归属/);assert.doesNotMatch(shown,/datalist|离散数学与统计/);
 assert.equal(form.elements.course.value,'ADS102');assert.equal(form.elements.class_type_choice.value,'Lecture');
 assert.equal(templateHint.textContent,'学习模板 · 知识点总结');
 assert.equal(recognitionCalls,1);assert.equal(sent,null);
 form.elements.class_type_choice.value='Lab';
 await listeners.change(event(form.elements.class_type_choice));
 assert.equal(templateHint.textContent,'学习模板 · 实验记录');
 await submit();
 assert.equal(sent.scheduled_lesson.date,'2026-11-03');assert.equal(sent.tags.weeks[0],8);assert.equal(sent.tags.class_type,'Lab');

 await click({learningAction:'next-week'});
 assert.match(region.innerHTML,/2026年11月9日–15日/);
 assert.doesNotMatch(region.innerHTML,/2026-11-03/);
 await click({learningAction:'lesson',date:'2026-11-10',index:'0'});
 await change('learning-lesson-file');
 await submit();
 assert.equal(sent.tags.weeks[0],9);assert.equal(sent.scheduled_lesson.date,'2026-11-10');
 await click({learningAction:'current-week'});
 assert.match(region.innerHTML,/2026年11月2日–8日/);

 sent=null;
 await change('learning-home-file');
 assert.equal(form.elements.course.value,'CSI101');assert.equal(form.elements.weeks.value,'8');assert.equal(sent,null);
 assert.equal(templateHint.textContent,'学习模板 · 题目讲解');
 form.elements.course.value='ADS102';
 await submit();
 assert.equal(sent.tags.course,'ADS102');assert.equal(sent.recognition.course_title,'CSI101');
 assert.equal(sent.scheduled_lesson,undefined);

 recognizedCourse='NOT-IN-TIMETABLE';
 sent=null;
 await change('learning-home-file');
 assert.equal(form.elements.course.value,'');
 await submit();
 assert.equal(sent,null);
});

test('one completed course only checks the exact lesson when the same class meets twice',()=>{
 const one={course:'ADS102',classType:'Lecture',week:8,date:'2026-11-03',time:'09:00–11:00'};
 const two={...one,time:'14:00–16:00'};
 const week={start:'2026-11-02',end:'2026-11-08',days:[{classes:[one,two]}]};
 const tags={course:'ADS102',weeks:[8],class_type:'Lecture'};
 const course={status:'completed',tags};
 const checks=courses=>markCompleted(week,courses).days[0].classes.map(row=>row.completed);
 assert.deepEqual(checks([course]),[false,false]);
 const linked={...course,scheduled_lesson:{date:two.date,course:two.course,time:two.time,class_type:two.classType}};
 assert.deepEqual(checks([linked]),[false,true]);
 assert.deepEqual(checks([{...linked,status:'learning',blocks:[{id:'a'},{id:'b'}],completed:['a']}]),[false,false]);
 assert.deepEqual(checks([{...linked,status:'learning',blocks:[{id:'a'}],completed:['a']}]),[false,true]);
});
