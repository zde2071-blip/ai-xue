const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const vm=require('node:vm');
const root=process.env.STUDY_PROJECT||join(__dirname,'..');
const source=readFileSync(join(root,'web/app.js'),'utf8').replace(/\ninit\(\);\s*$/,'');
const context=vm.createContext({document:{querySelector:()=>({addEventListener(){}}),addEventListener(){}},window:{addEventListener(){}}});
vm.runInContext(source,context);
function next(overrides={}){
  const c={status:'learning',blocks:[{id:'a'},{id:'b'},{id:'c'}],completed:[],active:'c',...overrides};
  return vm.runInContext(`nextLearningBlock(${JSON.stringify(c)}).id`,context);
}
test('resume retains the actual unfinished location after out-of-order study',()=>assert.equal(next(),'c'));
test('completed current block resumes at remaining material',()=>assert.equal(next({completed:['c']}),'a'));
test('a newly planned course starts from the first block',()=>assert.equal(next({status:'planning'}),'a'));
test('a finished course can be reviewed from the beginning',()=>assert.equal(next({completed:['a','b','c'],status:'completed'}),'a'));
test('missing active block falls back to available unfinished material',()=>assert.equal(next({active:'removed',completed:['a']}),'b'));
test('weeks sort numerically with unknown last',()=>assert.equal(vm.runInContext(`S.sort='week';[{title:'未知',week:null},{title:'十',week:10},{title:'二',week:2}].sort(libraryCompare).map(x=>x.title).join(',')`,context),'二,十,未知'));
test('classroom types group before unknown',()=>assert.equal(vm.runInContext(`S.sort='type';[{title:'空',class_type:''},{title:'二',class_type:'Tutorial'},{title:'一',class_type:'Lecture'}].sort(libraryCompare).map(x=>x.title).join(',')`,context),'一,二,空'));
test('grouping order is freely reversible without losing resources',()=>{
 const result=vm.runInContext(`(()=>{const rows=[{id:'a',title:'A',kind:'notes',week:2,class_type:'Lab'},{id:'b',title:'B',kind:'originals',week:10,class_type:'Lecture'},{id:'c',title:'C',kind:'originals',week:2,class_type:'Lab'}];const a=groupedResources(rows,['week','kind']),b=groupedResources(rows,['kind','week']);return JSON.stringify([a.groups.map(g=>g.title),a.groups[0].count,b.groups.map(g=>g.title),b.groups[0].count,groupedResources(rows,['none']).rows.length]);})()`,context);
 assert.deepEqual(JSON.parse(result),[['Week 2','Week 10'],2,['原始文件','笔记'],2,3]);
});
test('library home shows courses before material classification',()=>{
 const html=vm.runInContext(`S.libraryCourse='';S.courses=[{id:'math',title:'数学'}];S.resources=[];library()`,context);
 assert.match(html,/library-open-course/);assert.match(html,/数学/);assert.doesNotMatch(html,/一级分类/);
});
test('annotation anchoring distinguishes repeated text and relocates after insertion',()=>{
 assert.equal(vm.runInContext(`locateMark('甲 same 乙 same 丙',{quote:'same',start:9,before:'乙 ',after:' 丙'})`,context),9);
 assert.equal(vm.runInContext(`locateMark('新甲 same 乙 same 丙',{quote:'same',start:9,before:'乙 ',after:' 丙'})`,context),10);
 assert.equal(vm.runInContext(`locateMark('same same',{quote:'same'})`,context),-1);
});
context.marked=require(join(root,'web/vendor/marked.umd.js'));
test('live editor round trip preserves metadata comments tables and math',()=>{
 const source='---\ntitle: Test\n---\n# 标题\n\n<!-- block:abc -->\n\n正文 **粗体** $a+b$\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```js\nx()\n```\n';
 const result=vm.runInContext(`(()=>{const s=splitEditor(${JSON.stringify(source)});return s.prefix+s.parts.join('')})()`,context);assert.equal(result,source);
});
test('adding the first AI service works without a default model',()=>{
 const result=vm.runInContext(`(()=>{const old=renderAccount;renderAccount=()=>{};try{accountAI={services:[],defaults:{learning:null,translation:null},providers:{deepseek:{name:'DeepSeek',base:'https://api.deepseek.com'}}};openAIEditor();return {id:aiEdit.id,model:aiEdit.model,provider:aiEdit.provider};}finally{renderAccount=old;}})()`,context);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{id:'',model:'',provider:'deepseek'});
});
test('typed continuation remains a question about the current module',()=>{
 for(const q of ['继续','OK','下一块','好的','学会了','为什么'])assert.equal(vm.runInContext(`studyIntent(${JSON.stringify(q)})`,context),'question');
});
test('progress lives in the right status region, never navigation',()=>{
 const setup=`S.course={id:'c',title:'概率',source_name:'课件.md',overview:'介绍',status:'learning',active:'a',completed:[],session_blocks:['a'],notes:[],blocks:[{id:'a',title:'条件概率',description:'认识条件',points:[]}]};S.courses=[S.course];S.view='learn';`;
 const left=vm.runInContext(setup+'sidebar()',context),right=vm.runInContext('statusPanel()',context);
 assert.doesNotMatch(left,/学习进度|已学会|未确认学会|status-step/);assert.match(right,/学习进度/);assert.match(right,/正在学习/);
});

const browserStore=new Map();
context.localStorage={getItem:k=>browserStore.get(k)||null,setItem:(k,v)=>browserStore.set(k,v)};
function browserSetup(){browserStore.clear();vm.runInContext(`S.user={id:'academic-test'};S.demonstration=false;S.libraryCourse='math';S.search='';S.libraryFilter='';S.sort='name';B.files={};B.paths={math:['3']};B.groupOrder=['week'];B.terms={};B.statusVisible=true;B.stage='university';B.year=2;B.semester=1;B.week='3';B.fileGroup='none';B.searchScope='semester';B.academics={math:{stage:'university',year:2,semester:1},code:{stage:'university',year:2,semester:1},old:{stage:'university',year:1,semester:1},grad:{stage:'postgraduate',year:1,semester:1}};S.courses=[{id:'math',title:'数学'},{id:'code',title:'CPT111 编程'},{id:'old',title:'微积分'},{id:'grad',title:'研究方法'},{id:'unset',title:'尚未归档'}];S.resources=[{id:'m3',course_id:'math',course_title:'数学',title:'Lecture 3 函数',kind:'originals',week:3,class_type:'Lecture',available:true},{id:'m10',course_id:'math',course_title:'数学',title:'Lecture 10 积分',kind:'originals',week:10,class_type:'Lecture',available:true},{id:'code3',course_id:'code',course_title:'CPT111 编程',title:'Java 循环',kind:'notes',week:3,class_type:'Lecture',available:true},{id:'old3',course_id:'old',course_title:'微积分',title:'积分复习',kind:'notes',week:3,class_type:'Lecture',available:true},{id:'past',course_id:'math',course_title:'数学',title:'往年真题',kind:'exercises',week:null,class_type:'Exam',available:true},{id:'unset1',course_id:'unset',title:'待归档文件',kind:'originals',week:1,available:true}];`,context);}
test('course remains the fixed first level without duplicated tools or exposed metadata',()=>{browserSetup();const left=vm.runInContext('sidebar()',context),html=vm.runInContext('library()',context);assert.doesNotMatch(left,/data-action="settings"|browser-search|数学|编程/);assert.match(left,/account-menu/);assert.equal((html.match(/id="note-search"/g)||[]).length,1);assert.ok(html.indexOf('aria-label="课程列表"')<html.indexOf('aria-label="分类导航"'));assert.doesNotMatch(html,/aria-label="教学周"/);});
test('week selection filters the selected course only',()=>{browserSetup();assert.equal(vm.runInContext('browserCourses().length',context),2);assert.equal(vm.runInContext('browserData().rows.map(r=>r.id).join()',context),'m3');assert.equal(vm.runInContext(`B.paths.math=['10'];browserData().rows.map(r=>r.id).join()`,context),'m10');assert.equal(vm.runInContext('browserCourses().length',context),2);assert.equal(vm.runInContext('S.resources.length',context),6);});
test('academic scope never leaks courses from another year or stage',()=>{browserSetup();assert.equal(vm.runInContext(`B.year=1;browserCourses().map(c=>c.id).join()`,context),'old');assert.equal(vm.runInContext(`B.stage='postgraduate';B.week='all';browserCourses().map(c=>c.id).join()`,context),'grad');});
test('unknown academic metadata remains unassigned and is not guessed',()=>{browserSetup();assert.equal(vm.runInContext(`B.stage='unassigned';B.week='all';browserCourses().map(c=>c.id).join()`,context),'unset');});
test('weeks sort numerically and cross-week papers are kept visible',()=>{browserSetup();assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(academicWeeks().map(x=>x[0]))',context)),['3','10','none']);assert.equal(vm.runInContext(`B.paths.math=[''];browserData().rows[0].id`,context),'past');});
test('search ignores selected week and course but obeys semester scope',()=>{browserSetup();assert.equal(vm.runInContext(`S.search='积分';academicSearch().files.map(r=>r.id).join()`,context),'m10');assert.equal(vm.runInContext(`B.searchScope='all';academicSearch().files.length`,context),2);});
test('course search and multiple keywords work without duplicate result rows',()=>{browserSetup();assert.equal(vm.runInContext(`S.search='cpt111 java';academicSearch().files.map(r=>r.id).join()`,context),'code3');assert.equal(vm.runInContext(`S.search='CPT111';academicSearch().courses.length`,context),1);});
test('search results reveal true academic location and selected resource',()=>{browserSetup();vm.runInContext(`var savedRender=render;render=()=>{};S.search='积分';revealAcademicResource('old3');render=savedRender;`,context);assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify([B.stage,B.year,B.semester,B.week,S.libraryCourse,B.files.old,S.search])',context)),['university',1,1,'all','old','old3','']);});
test('academic selection and metadata restore without rewriting original resources',()=>{browserSetup();const before=vm.runInContext('JSON.stringify(S.resources)',context);vm.runInContext(`B.files.math='m3';saveBrowser();B.year=8;B.week='all';B.files={};restoreBrowser();`,context);assert.equal(vm.runInContext('B.year',context),2);assert.equal(vm.runInContext('B.week',context),'3');assert.equal(vm.runInContext('B.files.math',context),'m3');assert.equal(vm.runInContext('JSON.stringify(S.resources)',context),before);});
test('reading has no progress sidebar and learning keeps its right progress pane',()=>{browserSetup();assert.equal(vm.runInContext(`S.view='note';statusPanel()`,context),'');assert.match(vm.runInContext(`S.view='learn';B.statusVisible=false;statusPanel()`,context),/学习模块/);});
test('course archive validates ranges before any save',async()=>{browserSetup();await assert.rejects(vm.runInContext(`assignAcademic('unset',{academic_stage:'university',academic_year:0,academic_semester:1})`,context));vm.runInContext('S.demonstration=true',context);await vm.runInContext(`assignAcademic('unset',{academic_stage:'highschool',academic_year:2,academic_semester:1})`,context);assert.equal(vm.runInContext('courseAcademic("unset").stage',context),'highschool');});
test('demo covers student stages and never accepts writes',async()=>{const demoContext=vm.createContext({window:{location:{search:'?demo=academic'}},URLSearchParams});vm.runInContext(readFileSync(join(root,'web/academic-demo.js'),'utf8'),demoContext);const demo=demoContext.window.StudyDemo,state=demo.state();assert.equal(new Set(state.courses.map(c=>c.academic.stage)).size,3);assert.ok(state.resources.length>250);await assert.rejects(demo.request('/api/import',{text:'test'}),/示例模式/);await assert.rejects(demo.request('/api/auth/login',{email:'test'}),/示例模式/);assert.equal((await demo.request('/api/library')).items.length,state.resources.length);});

test('navigation selection appends dimensions and cancellation compacts order',()=>{browserSetup();vm.runInContext(`var oldRender=render;render=()=>{};toggleNavigation('type');toggleNavigation('chapter');toggleNavigation('week');render=oldRender;`,context);assert.equal(vm.runInContext(`navigationOrder().join(',')`,context),'type,chapter');const h=vm.runInContext('quickNavigation()',context);assert.match(h,/第 2 级：课堂类型/);assert.match(h,/第 3 级：章节/);assert.match(h,/第一级固定为课程/);});
test('turning off every dimension produces a flat course file list',()=>{browserSetup();vm.runInContext(`B.groupOrder=[]`,context);const h=vm.runInContext('library()',context);assert.doesNotMatch(h,/aria-label="分类导航"/);assert.equal(vm.runInContext('browserData().rows.length',context),3);});
test('reversing dimension order retains all original resource ids',()=>{browserSetup();const before=vm.runInContext('JSON.stringify(S.resources)',context);vm.runInContext(`B.groupOrder=['type','week'];B.paths.math=['Lecture','10']`,context);assert.equal(vm.runInContext('browserData().rows[0].id',context),'m10');assert.equal(vm.runInContext('JSON.stringify(S.resources)',context),before);});
test('cross-week materials appear in either week without physical duplicates',()=>{browserSetup();vm.runInContext(`S.resources[0].weeks=[3,4];B.paths.math=['4']`,context);assert.equal(vm.runInContext('browserData().rows[0].id',context),'m3');assert.equal(vm.runInContext(`groupedResources(S.resources.filter(r=>r.course_id==='math'),['week']).groups.find(g=>g.value===4).count`,context),1);});
test('classification preferences and path restore across reload',()=>{browserSetup();vm.runInContext(`B.groupOrder=['chapter','type'];B.paths.math=['第二章'];saveBrowser();B.groupOrder=[];B.paths={};restoreBrowser()`,context);assert.equal(vm.runInContext(`navigationOrder().join(',')`,context),'chapter,type');assert.equal(vm.runInContext('B.paths.math[0]',context),'第二章');});
test('selected file exposes only essential actions until details are opened',()=>{browserSetup();const h=vm.runInContext(`B.files.math='m3';browserResourceDetails(S.resources[0])`,context);assert.match(h,/详细信息/);assert.doesNotMatch(h,/browser-file-meta|metadata_sources|课堂类型|教学周|生成笔记/);});

test('legacy text-only highlights include formulas between their original endpoints',()=>{
 const result=vm.runInContext(`(()=>{
  const old=textMap,a={},formula={},b={};
  const legacy={text:'设 ，。',nodes:[{node:a,start:0,end:2},{node:b,start:2,end:4}]};
  const current={text:'设 A={1,2,3}，。',nodes:[{node:a,start:0,end:2},{node:formula,start:2,end:11},{node:b,start:11,end:13}]};
  textMap=()=>legacy;
  try{return [markBounds({}, {quote:'设 ，。',start:0},current),markBounds({}, {quote:'设',start:0},current),markBounds({}, {quote:'A={1,2,3}',start:2,anchor_version:2},current)];}finally{textMap=old;}
 })()`,context);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),[{start:0,end:13},{start:0,end:1},{start:2,end:11}]);
});
