/* Read-only fixture mode. It never authenticates, sends network writes, or touches a vault. */
(function(){
 if(new URLSearchParams(window.location.search).get('demo')!=='academic')return;
 const courses=[],resources=[],notes={},conversations={},academics={};
 const specs=[['ads','ADS102 · 离散数学与统计','university',2,1,'关系与函数'],['cpt','CPT111 · 程序设计','university',2,1,'循环与条件'],['isa','ISA104 · 信息系统','university',2,1,'数据库设计'],['soe','SOE104 · 微观经济学','university',2,1,'供给与需求'],['eap','EAP101 · 学术英语','university',2,1,'论证与引用'],['math','MTH101 · 微积分','university',1,1,'函数与极限'],['stats','STA201 · 概率统计','university',2,2,'随机变量'],['highmath','数学','highschool',2,1,'数列'],['highphysics','物理','highschool',2,1,'动量守恒'],['highenglish','英语','highschool',2,1,'阅读理解'],['gradml','机器学习','postgraduate',1,1,'线性回归'],['gradresearch','研究方法','postgraduate',1,1,'文献阅读']];
 function body(topic,kind,week){return kind==='notes'?`# ${topic} · 学习笔记\n\n> 示例内容，用于体验资料排布。\n\n## 核心概念\n\n先理解定义，再用一个例子检验自己的理解。\n\n## 我的理解\n\n将本周的讲解、例题与已有知识联系起来。\n\n## 需要复习\n\n回到原课件，检查定义中的条件。`:kind==='exercises'?`# ${topic} · Tutorial ${week}\n\n> 示例题目，用于体验资料排布。\n\n1. 用自己的话解释本周的核心概念。\n2. 给出一个符合定义的例子和一个反例。\n3. 说明本周内容和上周内容的联系。`:`# ${topic}\n\n> 示例课件，用于体验资料排布。\n\n## 本周内容\n\n- 核心概念与适用条件\n- 一个具体例子\n- 常见误区\n\n## 学习目标\n\n理解概念，并能独立解释一个例子。`;}
 for(const [id,title,stage,year,semester,topic] of specs){
  const academic={stage,year,semester};academics[id]=academic;
  const blocks=[{id:id+'-one',title:'概念与定义',description:'先从例子理解概念。',points:['定义','适用条件']},{id:id+'-two',title:'例题与应用',description:'练习使用本周概念。',points:['例题']}];
  const course={id,title,academic,source_name:`Lecture 03 · ${topic}.md`,source_file:'source.md',created_at:'2026-10-24T12:00:00+08:00',updated_at:'2026-10-24T12:00:00+08:00',demo:true,status:'learning',active:blocks[0].id,blocks,completed:[],session_blocks:[blocks[0].id],notes:[],overview:`本周通过具体例子理解${topic}，再做练习。`,highlights:[],method:'先总览，再分块讲解。'};
  courses.push(course);
  const weeks=stage==='university'&&year===2&&semester===1?12:6;
  for(let week=1;week<=weeks;week++)for(const kind of ['originals','notes','exercises']){
   if(id==='eap'&&week===3&&kind==='exercises')continue;
   const base=id+'-w'+week,sourceId=base+'-originals',prefix=kind==='originals'?'Lecture':kind==='notes'?'笔记':'Tutorial',filename=`${prefix} ${String(week).padStart(2,'0')} · ${topic}.md`;
   const r={id:base+'-'+kind,course_id:id,course_title:title,kind,week,class_type:kind==='exercises'?'Tutorial':'Lecture',title:filename,filename,topic,chapter:'第 '+Math.ceil(week/3)+' 章',available:true,created_at:course.created_at,content:body(topic,kind,week),study_source:kind==='originals',source_id:sourceId};
   if(kind==='notes'){r.note_id=base+'-note';const n={id:r.note_id,title:filename.slice(0,-3),content:r.content,course_id:id,course_title:title,created_at:course.created_at,discussions:[],etag:'demo-readonly'};notes[id+'/'+r.note_id]=n;course.notes.push({id:n.id,title:n.title,created_at:n.created_at,thread_ids:[]});}
   resources.push(r);
  }
  resources.push({id:id+'-exam',course_id:id,course_title:title,kind:'exercises',week:null,class_type:'Exam',title:'往年真题 · 复习提纲.md',available:true,created_at:course.created_at,content:'# 往年真题 · 示例\n\n跨周资料放在“未设置 Week”中，不强行归入某一周。'});
  conversations[id]=[{id:id+'-source',role:'user',kind:'source',content:course.source_name},{id:id+'-overview',role:'assistant',kind:'overview',content:course.overview},{id:id+'-lesson',role:'assistant',kind:'lesson',block_id:blocks[0].id,content:`## ${topic}\n\n这是一段示例讲解，用于查看从资料进入学习时的布局。\n\n先理解概念，再用例子检验理解。真正学习时，AI 会根据导入的课件逐块讲解。`}];
 }
 window.StudyDemo={active:true,state:()=>({demonstration:true,user:{id:'academic-demo',name:'示例学生',email:''},profile:{name:'示例学生',avatar:''},courses,resources,settings:{connected:false},libraryCourse:'ads',method:'先总览，再分块讲解。',browser:{stage:'university',year:2,semester:1,week:'3',academics,files:{ads:'ads-w3-originals'}}}),request:async(path,data)=>{
  if(path==='/api/library/metadata'&&data!==undefined){const r=resources.find(x=>x.id===data.id);if(!r)throw new Error('未找到示例资料。');const weeks=String(data.week||'').split(/[,，、\s]+/).filter(Boolean).flatMap(x=>{const m=x.match(/^(\d+)[–-](\d+)$/);return m?Array.from({length:Number(m[2])-Number(m[1])+1},(_,i)=>Number(m[1])+i):[Number(x)];});if(weeks.some(n=>!Number.isInteger(n)||n<1||n>60))throw new Error('教学周应为 1–60。');for(const k of ['kind','class_type','topic','chapter'])if(k in data)r[k]=String(data[k]);r.weeks=[...new Set(weeks)].sort((a,b)=>a-b);r.week=r.weeks[0]??null;return {items:resources};}
  if(data!==undefined)throw new Error('示例模式只展示界面。请退出示例后使用真实学习功能。');
  if(path==='/api/library')return {items:resources};
  let m=path.match(/^\/api\/courses\/([^/]+)\/notes\/([^/]+)$/);if(m&&notes[m[1]+'/'+m[2]])return notes[m[1]+'/'+m[2]];
  m=path.match(/^\/api\/courses\/([^/]+)\/conversation$/);if(m)return {conversation:conversations[m[1]]||[]};
  throw new Error('此功能请在你的真实课程中使用。');
 }};
})();
