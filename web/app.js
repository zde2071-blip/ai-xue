'use strict';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = name => `<i data-lucide="${name}"></i>`;
const S = {user:null,profile:{name:'',avatar:''},courses:[], settings:{}, view:'courses', course:null, lesson:'', note:null, editing:false, dirty:false,
  busy:false, busyText:'', thread:null, pendingQuote:'', threadBusy:false, search:'', sort:'name', libraryFilter:'', resources:[], libraryKind:'originals', libraryCourse:'', marks:[], conversation:[], studyDraft:'', studyQuote:'', studyQuoteBlock:'', studyPending:'', studyError:''};
let savedSelection = '', toastTimer, notePoll, currentFile, outlineDraft, threadQuestionDraft = '', pendingNavigation = null;
const modal = $('#modal');

function icons(){ if(window.lucide) lucide.createIcons({attrs:{'aria-hidden':'true'}}); }
function toast(text){ const el=$('#toast');el.textContent=text;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),4500); }
function md(text){
  const math=[];
  const source=String(text || '').replace(/\$\$([\s\S]*?)\$\$|(?<!\\)\$([^$\n]+?)\$/g,(whole,block,inline)=>{
    const index=math.length; math.push({body:block ?? inline,display:block!==undefined});return `STUDYMATHPLACEHOLDER${index}END`;
  });
  let html=DOMPurify.sanitize(marked.parse(source,{breaks:false}),{USE_PROFILES:{html:true},FORBID_TAGS:['style','iframe','form','input','button'],FORBID_ATTR:['style']});
  html=html.replace(/STUDYMATHPLACEHOLDER(\d+)END/g,(whole,i)=>{
    try{return katex.renderToString(math[i].body,{displayMode:math[i].display,throwOnError:false,trust:false,strict:'ignore'});}catch{return esc(math[i].body);}
  });
  return html;
}
async function api(path,data){
  if(S.demonstration)return window.StudyDemo.request(path,data);
  let res;
  try{const headers={'X-Study-App':'1'};res=await fetch(path,data===undefined?{headers}:{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(data)});}catch{throw new Error('本地服务没有响应。请重新打开“启动学记.command”。');}
  const value=await res.json();if(!res.ok){const e=new Error(value.error || '操作没有完成，请重试。');e.status=res.status;throw e;}return value;
}
function updateCourse(c){S.course=c;const i=S.courses.findIndex(x=>x.id===c.id);if(i<0)S.courses.unshift(c);else S.courses[i]=c;localStorage.setItem('study-course-'+S.user.id,c.id);}
function currentBlock(){return S.course?.blocks.find(b=>b.id===S.course.active);}
function nextLearningBlock(c){return (c.status!=='planning'&&c.blocks.find(b=>b.id===c.active&&!c.completed.includes(b.id)))||c.blocks.find(b=>!c.completed.includes(b.id))||c.blocks[0];}
function percent(c=S.course){return c?Math.round(c.completed.length/c.blocks.length*100):0;}
function courseUrl(action){return `/api/courses/${S.course.id}/${action}`;}
function dateText(value){return new Date(value).toLocaleDateString('zh-CN',{month:'long',day:'numeric'});}
function canLeave(){
  if(S.threadBusy){toast('请等待当前回答完成。');return false;}
  if(S.dirty){
    modalContent('还有未保存的编辑', '<p class="modal-description">你可以返回编辑器继续保存，或放弃这次尚未保存的改动。磁盘上的笔记不会被删除。</p><div class="modal-actions"><button class="outline-button" data-action="close-modal">返回编辑</button><button class="primary" data-action="discard-draft">放弃编辑并继续</button></div>');
    return false;
  }
  clearTimeout(saveTimer);S.editing=false;return true;
}
async function task(label,fn){if(S.busy)return;S.busy=true;S.busyText=label;render();try{await fn();}catch(e){toast(e.message);}finally{S.busy=false;S.busyText='';render();}}

function avatarMarkup(profile){return profile.avatar?`<img src="${esc(profile.avatar)}" alt="头像">`:icon('user-round');}
function sidebarFooter(){return `<footer class="sidebar-footer" aria-label="个人与设置"><button class="profile-button" data-action="account-menu" aria-label="个人设置" aria-haspopup="menu" aria-expanded="false"><span class="profile-avatar">${avatarMarkup(S.profile)}</span><span class="profile-copy"><strong>${esc(S.profile.name||'本机用户')}</strong><small>个人设置</small></span>${icon('chevrons-up-down')}</button></footer>`;}
async function saveProfile(form,data){
  const next={name:String(data.name||'').trim().slice(0,32),avatar:S.profile.avatar};
  const file=form.elements.avatar.files[0];
  if(file){
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024)throw new Error('请选择 2 MB 以内的 PNG、JPG 或 WebP 图片。');
    next.avatar=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('无法读取头像。'));r.readAsDataURL(file);});
    const probe=new Image();probe.src=next.avatar;
    try{await probe.decode();}catch{throw new Error('无法识别这张图片，请换一张。');}
  }
  const result=await api('/api/workspace/profile',next);S.user=result.user;
  S.profile={name:result.user.name,avatar:result.user.avatar};modal.close();render();toast('个人资料已保存');
}

function sidebar(){
 return `<aside class="sidebar tool-rail" aria-label="工具导航"><nav class="sidebar-nav" aria-label="主导航"><button data-action="workspace" class="active" aria-label="学习资料">${icon('library')}<span>资料</span></button></nav><div class="tool-rail-bottom">${sidebarFooter()}</div></aside>`;
}
function statusPanel(){
  const c=S.course;if(!c||!['overview','learn'].includes(S.view))return '';
  const pending=!!S.importPending||!!S.importError,waiting=S.busy||S.threadBusy||pending,planned=c.status==='planning';
  return `<aside class="status-panel" aria-label="学习进度"><div class="status-heading"><h2>学习模块</h2></div>${pending?(S.importError?'<p class="muted">未生成学习目录</p>':'<p class="muted">正在整理…</p>'):`<nav class="status-outline" aria-label="学习目录">${c.blocks.map((b,i)=>`<div class="status-step ${c.completed.includes(b.id)?'done':''} ${b.id===c.active?'current':''}" ${b.id===c.active?'aria-current="step"':''}><span class="status-step-number">${c.completed.includes(b.id)?icon('check'):i+1}</span><span><strong>${esc(b.title)}</strong><small>${c.completed.includes(b.id)?'已完成':b.id===c.active&&!planned?'正在学习':'待学习'}</small></span></div>`).join('')}</nav><div class="status-course-actions"><button class="primary" data-action="${planned?'start':['paused','completed'].includes(c.status)?'resume-study':'complete'}" ${waiting?'disabled':''}>${planned?'开始学习':'继续'} ${icon('arrow-right')}</button>${c.session_blocks.length?`<button class="outline-button" data-action="finish" ${waiting?'disabled':''}>结束并整理笔记</button>`:''}</div>`}</aside>`;
}

function header(){
  const c=S.course;
  if(['courses','library'].includes(S.view))return '';
  if(S.view==='note'&&S.demonstration)return `<header class="contextbar"><button class="text-button" data-action="browser-return">${icon('arrow-left')}返回资料</button><span class="small muted">示例笔记 · 阅读</span></header>`;
  if(S.view==='note')return `<header class="contextbar"><button class="text-button" data-action="browser-return">${icon('arrow-left')}<span>返回资料</span></button><div class="context-actions"><div class="toggle-group" aria-label="笔记模式"><button data-action="read-note" class="${!S.editing?'selected':''}" aria-pressed="${!S.editing}">阅读</button><button data-action="edit-note" class="${S.editing?'selected':''}" aria-pressed="${S.editing}">编辑</button></div>${S.editing?`<button class="icon-button" data-action="save-note" title="保存 · ⌘S" aria-label="保存笔记">${icon('save')}</button>`:`<button class="icon-button" title="导出 Markdown" aria-label="导出 Markdown" data-action="export">${icon('download')}</button>`}</div></header>`;
  return `<header class="contextbar study-header"><button class="text-button" data-action="browser-return" aria-label="返回课程资料">${icon('arrow-left')}资料</button><div class="study-header-title">${esc(c.title)}</div><div class="context-actions"><button class="text-button source-action" data-action="source">${icon('file-text')}课件</button>${!S.demonstration&&c.status==='learning'&&c.session_blocks.length?`<button class="outline-button" data-action="finish" ${S.busy||S.threadBusy?'disabled':''}>结束学习</button>`:''}<button class="icon-button status-toggle" data-action="toggle-status" aria-label="查看学习状态">${icon('panel-right')}</button></div></header>`;
}
function progressTrack(c,compact=false){
  return `<div class="segment-track ${compact?'compact':''}" aria-label="学习进度">${c.blocks.map(b=>`<span class="${c.completed.includes(b.id)?'done':''} ${c.active===b.id?'current':''}"></span>`).join('')}</div>`;
}
function coursesPage(){return library();}
function initialConversation(c){return [{id:'source',role:'user',kind:'source',content:c.source_name},{id:'overview',role:'assistant',kind:'overview',content:c.overview+'\n\n'+c.blocks.map((b,i)=>`${i+1}. **${b.title}** — ${b.description}`).join('\n')}];}
function studyMessages(){return S.conversation.length?S.conversation:initialConversation(S.course);}
function studyMessage(m){
  const block=S.course.blocks.find(b=>b.id===m.block_id),isLesson=m.kind==='lesson';
  if(m.role==='user')return `<div class="study-message study-user" data-message-id="${esc(m.id)}">${m.kind==='source'?`<div class="study-file">${icon('file-text')}<span>${esc(m.content)}</span></div><p>帮我梳理这份课件，再一块一块讲。</p>`:`${m.quote?`<blockquote>${esc(m.quote)}</blockquote>`:''}<p>${esc(m.content)}</p>`}</div>`;
  return `<section class="study-message study-assistant" data-message-id="${esc(m.id)}" ${isLesson?`id="turn-${esc(m.block_id)}"`:''} data-block="${esc(m.block_id||'')}"><div class="study-speaker">学记${isLesson&&block?`<span>第 ${S.course.blocks.indexOf(block)+1} 块 · ${esc(block.title)}</span>`:m.kind==='overview'?'<span>课程总览</span>':''}</div><div ${isLesson&&m.block_id===S.course.active?'id="lesson-body"':''} class="markdown" data-selectable="lesson">${md(m.content)}</div></section>`;
}
function overview(){return learn();}
function learn(){
  if(S.importPending)return `<article class="study-conversation import-waiting" aria-label="学习对话"><div role="status">${icon('loader-circle')}正在整理课件…</div></article>`;
  if(S.importError)return `<article class="study-conversation import-waiting"><p role="alert">${esc(S.importError)}</p><div class="context-actions"><button class="outline-button" data-action="settings">AI 服务</button><button class="outline-button" data-action="unit-retry-import">重试</button></div></article>`;
  return `<article class="study-conversation" aria-label="学习对话">${studyMessages().map(studyMessage).join('')}${S.studyPending?`<div class="study-message study-user"><p>${esc(S.studyPending)}</p></div>`:''}${S.threadBusy?`<div class="study-message study-assistant study-waiting" role="status">${icon('loader-circle')}正在回答…</div>`:''}<div id="study-bottom"></div></article>`;
}
function composer(){
  if(S.demonstration)return `<footer class="learning-footer"><p class="small muted">示例对话 · 真实学习请返回你的资料</p></footer>`;
  const c=S.course,waiting=S.busy||S.threadBusy||S.importPending||S.importError;
  return `<footer class="learning-footer"><div class="learning-footer-inner">${S.studyQuote?`<div class="study-quote"><span>${esc(S.studyQuote)}</span><button class="icon-button" data-action="clear-study-quote" aria-label="取消引用">${icon('x')}</button></div>`:''}${S.studyError?`<p class="study-error" role="alert">${esc(S.studyError)}</p>`:''}<form class="composer" id="main-question"><textarea name="question" aria-label="向 AI 提问" placeholder="针对当前模块继续提问…" rows="1" ${waiting?'disabled':''}>${esc(S.studyDraft)}</textarea><button class="send-button" type="submit" aria-label="发送问题" ${waiting?'disabled':''}>${icon('arrow-up')}</button></form></div></footer>`;
}

function studyIntent(){return 'question';}

function scrollStudyBottom(){requestAnimationFrame(()=>{const el=$('.content-scroll');if(el)el.scrollTop=el.scrollHeight;});}
async function continueStudy(){
  if(S.busy||S.threadBusy)return;
  const c=S.course,i=c.blocks.findIndex(b=>b.id===c.active);
  if(['paused','completed'].includes(c.status)){await openBlock(nextLearningBlock(c).id);return;}
  if(c.status==='planning'){await openBlock(c.blocks[0].id);return;}
  if(i<c.blocks.length-1)await openBlock(c.blocks[i+1].id);else showFinish();
}
async function sendStudyQuestion(question,mode){
  if(S.busy||S.threadBusy||!question.trim())return;
  const intent=mode||S.studyQuote?'question':studyIntent(question);
  if(intent!=='question'){
    S.studyDraft='';if($('#main-question textarea'))$('#main-question textarea').value='';
    if(intent==='complete'&&S.course.status!=='planning')await completeStudyBlock();else await continueStudy();
    return;
  }
  if(['paused','completed'].includes(S.course.status)){const quote=S.studyQuote,bid=S.studyQuoteBlock;await openBlock(bid||S.course.active);if(S.course.status!=='learning')return;S.studyQuote=quote;S.studyQuoteBlock=bid;}
  const request={question,channel:'learning',mode,block_id:S.studyQuoteBlock||S.course.active,quote:S.studyQuote};
  S.studyDraft=question;S.studyPending=question;S.studyError='';S.threadBusy=true;render();scrollStudyBottom();
  try{
    const result=await api(courseUrl(S.course.status==='planning'?'plan-chat':'chat'),request);
    S.conversation=result.conversation;S.studyDraft='';S.studyQuote='';S.studyQuoteBlock='';
  }catch(e){S.studyError=e.message;}
  finally{S.studyPending='';S.threadBusy=false;if($('#main-question textarea'))$('#main-question textarea').value=S.studyDraft;render();scrollStudyBottom();$('#main-question textarea')?.focus();}
}
async function completeStudyBlock(){
  if(S.threadBusy||S.busy)return;
  const c=S.course,b=currentBlock();
  if(!c.completed.includes(b.id)){await task('正在保存进度…',async()=>updateCourse(await api(courseUrl('complete'),{block_id:b.id})));if(!S.course.completed.includes(b.id))return;}
  await continueStudy();
}
const libraryKinds={originals:'原始文件',notes:'笔记',exercises:'练习题'};
function libraryCompare(a,b){
  const name=()=>a.title.localeCompare(b.title,'zh-CN',{numeric:true});
  if(S.sort==='week')return (a.week??Infinity)-(b.week??Infinity)||name();
  if(S.sort==='type')return (!a.class_type)-(!b.class_type)||(a.class_type||'').localeCompare(b.class_type||'','zh-CN')||name();
  return S.sort==='name'?name():(b.created_at||'').localeCompare(a.created_at||'')||name();
}
const groupLabels={kind:'资料类型',week:'周次',type:'课堂类型',chapter:'章节',none:'不分类'};
function libraryGrouping(){
  try{const saved=JSON.parse(localStorage.getItem('study-library-groups-'+(S.user?.id||'local'))||'{}')[S.libraryCourse];if(Array.isArray(saved)){const levels=[...new Set(saved.filter(k=>['kind','week','type'].includes(k)))];return saved[0]==='none'?[]:levels;}}catch{}
  return ['week'];
}
function saveLibraryGrouping(levels){
  try{const saved=JSON.parse(localStorage.getItem('study-library-groups-'+(S.user?.id||'local'))||'{}');saved[S.libraryCourse]=levels.length?levels:['none'];localStorage.setItem('study-library-groups-'+(S.user?.id||'local'),JSON.stringify(saved));}catch{toast('无法保存分类偏好。');}
  B.paths[S.libraryCourse]=[];saveBrowser();render();
}
function groupingControls(levels){return `<div class="library-view-options" aria-label="查看方式">${Object.entries({week:'按周次',type:'按课堂类型',kind:'按资料类型',none:'全部平铺'}).map(([key,label])=>`<button class="${(levels[0]||'none')===key?'active':''}" aria-pressed="${(levels[0]||'none')===key}" data-action="library-view" data-id="${key}">${label}</button>`).join('')}</div>${levels.length?`<div class="refinement-controls">${levels.slice(1).map((key,i)=>`<span class="refinement-chip">再按${groupLabels[key]}<button data-action="remove-refinement" data-index="${i+1}" aria-label="取消按${groupLabels[key]}细分">×</button></span>`).join('')}${levels.length<3?`<select id="add-refinement" aria-label="添加细分"><option value="">＋ 添加细分</option>${Object.entries(groupLabels).filter(([key])=>key!=='none'&&!levels.includes(key)).map(([key,label])=>`<option value="${key}">按${label}</option>`).join('')}</select>`:''}</div>`:''}`;}
function groupValue(r,key){return key==='kind'?r.kind:key==='week'?(r.week??''):key==='chapter'?r.chapter||'':r.class_type||'';}
function groupTitle(value,key){return key==='kind'?libraryKinds[value]:key==='week'?(value?`Week ${value}`:'未分周'):value||(key==='chapter'?'未设置章节':'未设置课堂类型');}
function groupedResources(rows,levels){
  const key=levels[0];if(!key||key==='none')return {rows:[...rows].sort(libraryCompare)};
  const groups=new Map();for(const r of rows){for(const value of materialGroupValues(r,key)){if(!groups.has(value))groups.set(value,[]);if(!groups.get(value).some(x=>x.id===r.id&&r.id))groups.get(value).push(r);}}
  const keys=[...groups.keys()].sort((a,b)=>a===''?1:b===''?-1:key==='week'?Number(a)-Number(b):key==='kind'?Object.keys(libraryKinds).indexOf(a)-Object.keys(libraryKinds).indexOf(b):String(a).localeCompare(String(b),'zh-CN'));
  return {groups:keys.map(value=>({value,title:groupTitle(value,key),count:groups.get(value).length,children:groupedResources(groups.get(value),levels.slice(1))}))};
}
function resourceRows(tree,depth=0){
  if(tree.groups)return tree.groups.map(g=>`<details open class="library-group depth-${depth}"><summary>${esc(g.title)} <span>${g.count}</span></summary>${resourceRows(g.children,depth+1)}</details>`).join('');
  return tree.rows.map(r=>`<div class="resource-row compact-resource"><button class="resource-open" data-action="resource-open" data-id="${esc(r.id)}">${icon(r.kind==='exercises'?'list-checks':'file-text')}<strong title="${esc(r.title)}">${esc(r.title)}${r.available?'':'（文件已移走）'}</strong></button><span class="resource-kind">${libraryKinds[r.kind]}</span><span class="resource-week">${r.week?'第 '+r.week+' 周':'—'}</span><span class="resource-type">${esc(r.class_type||'—')}</span><button class="text-button resource-classify" data-action="resource-classify" data-id="${esc(r.id)}" aria-label="整理 ${esc(r.title)}">整理</button></div>`).join('');
}
// Academic position is independent of the physical course/material folders.
const academicStages={highschool:'高中',university:'大学',postgraduate:'研究生',unassigned:'待归档'};
const B={paths:{},files:{},terms:{},statusVisible:true,scroll:{},academics:{},stage:'unassigned',year:1,semester:1,week:'all',searchScope:'semester',fileGroup:'none',groupOrder:['week']};
function browserKey(){return 'study-browser-'+(S.user?.id||'local');}
function saveBrowser(){try{localStorage.setItem(browserKey(),JSON.stringify({course:S.libraryCourse,paths:B.paths,files:B.files,terms:B.terms,academics:B.academics,stage:B.stage,year:B.year,semester:B.semester,week:B.week,fileGroup:B.fileGroup,sort:S.sort,groupOrder:navigationOrder()}));}catch{}}
function validAcademic(a){return !!a&&['highschool','university','postgraduate'].includes(a.stage)&&Number.isSafeInteger(a.year)&&a.year>=1&&Number.isSafeInteger(a.semester)&&a.semester>=1;}
function restoreBrowser(){try{const b=JSON.parse(localStorage.getItem(browserKey())||'{}');for(const key of ['paths','files','terms'])if(b[key]&&typeof b[key]==='object'&&!Array.isArray(b[key]))B[key]=b[key];if(b.academics&&typeof b.academics==='object')B.academics=Object.fromEntries(Object.entries(b.academics).filter(([,v])=>validAcademic(v)));if(Object.hasOwn(academicStages,b.stage))B.stage=b.stage;for(const k of ['year','semester'])if(Number.isSafeInteger(b[k])&&b[k]>=1)B[k]=b[k];if(b.week==='all'||b.week==='none'||/^(?:[1-9]|[1-5][0-9]|60)$/.test(b.week))B.week=String(b.week);if(['none','type','kind'].includes(b.fileGroup))B.fileGroup=b.fileGroup;if(Array.isArray(b.groupOrder))B.groupOrder=[...new Set(b.groupOrder.filter(k=>Object.hasOwn(navigationDimensions,k)))];if(['name','recent','week','type'].includes(b.sort))S.sort=b.sort;if(S.courses.some(c=>c.id===b.course)||b.course==='unfiled')S.libraryCourse=b.course;}catch{}}
function courseAcademic(id){const value=S.courses.find(c=>c.id===id)?.academic||B.academics[id];return validAcademic(value)?value:null;}
function academicMatches(id){const a=courseAcademic(id);return B.stage==='unassigned'?!a:a?.stage===B.stage&&a.year===B.year&&a.semester===B.semester;}
function academicLabel(id){const a=courseAcademic(id);return a?`${academicStages[a.stage]} / Year ${a.year} / Semester ${a.semester}`:'待归档';}
function weekLabel(value){return value==='all'?'全部周次':value==='none'||value==null?'未分周':`Week ${value}`;}
function weekMatches(r){return B.week==='all'||(B.week==='none'?r.week==null:String(r.week)===B.week);}
function semesterCourses(){const list=[...S.courses];if(S.resources.some(r=>!r.course_id))list.push({id:'unfiled',title:'未归档资料'});return list.filter(c=>academicMatches(c.id));}
function semesterResources(){const ids=new Set(semesterCourses().map(c=>c.id));return S.resources.filter(r=>ids.has(r.course_id||'unfiled'));}
function academicWeeks(){const counts=new Map();for(const r of semesterResources()){const k=r.week==null?'none':String(r.week);counts.set(k,(counts.get(k)||0)+1);}return [...counts].sort((a,b)=>a[0]==='none'?1:b[0]==='none'?-1:Number(a[0])-Number(b[0]));}
function academicSearch(){
 const tokens=S.search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);if(!tokens.length)return {courses:[],files:[]};
 const matches=text=>tokens.every(t=>text.toLocaleLowerCase().includes(t));
 const courses=S.courses.filter(c=>(B.searchScope==='all'||academicMatches(c.id))&&matches(`${c.title} ${academicLabel(c.id)}`));
 const files=S.resources.filter(r=>(B.searchScope==='all'||academicMatches(r.course_id||'unfiled'))&&matches(`${r.title} ${r.course_title||S.courses.find(c=>c.id===r.course_id)?.title||''} ${r.class_type||''} ${weekLabel(r.week)} ${academicLabel(r.course_id||'unfiled')}`)).sort(libraryCompare);
 return {courses,files};
}
function academicFields(a={}){return `<div class="academic-form-fields"><label class="field"><span class="field-label">阶段</span><select name="academic_stage" aria-label="归档阶段">${Object.entries(academicStages).map(([k,v])=>`<option value="${k}" ${(a.stage||'unassigned')===k?'selected':''}>${v}</option>`).join('')}</select></label><label class="field"><span class="field-label">Year</span><input name="academic_year" aria-label="归档 Year" type="number" min="1" step="1" inputmode="numeric" required value="${a.year||B.year}"></label><label class="field"><span class="field-label">Semester</span><input name="academic_semester" aria-label="归档 Semester" type="number" min="1" step="1" inputmode="numeric" required value="${a.semester||B.semester}"></label></div>`;}
function showBrowserTerm(){const c=S.courses.find(c=>c.id===S.libraryCourse);if(!c)return;modalContent('课程归档',`<form id="academic-course-form"><p class="resource-dialog-title">${esc(c.title)}</p>${academicFields(courseAcademic(c.id)||{})}<p class="small muted">归档信息随课程保存在本地。</p><div class="modal-actions"><button type="submit" class="primary">保存</button></div></form>`);}
async function assignAcademic(cid,data){const a={stage:data.academic_stage,year:Number(data.academic_year),semester:Number(data.academic_semester)};if(a.stage!=='unassigned'&&!validAcademic(a))throw new Error('请选择阶段，年级和学期请填写大于 0 的整数。');if(!S.demonstration){const saved=await api('/api/context/academic',{...data,course_id:cid});updateCourse(saved);}if(a.stage==='unassigned')delete B.academics[cid];else B.academics[cid]=a;B.stage=a.stage;if(validAcademic(a)){B.year=a.year;B.semester=a.semester;}B.week='all';saveBrowser();}

function academicFileRows(rows){if(B.fileGroup==='none')return rows.map(academicRow).join('');return (groupedResources(rows,[B.fileGroup]).groups||[]).map(g=>`<details class="academic-file-group" open><summary>${esc(g.title)} <span>${g.count}</span></summary>${g.children.rows.map(academicRow).join('')}</details>`).join('');}
function searchResults(){const result=academicSearch();return `<section class="academic-search-results" aria-label="搜索结果"><div class="academic-results-heading"><span>${result.files.length} 份资料 · ${result.courses.length} 门课程</span><select id="academic-search-scope" aria-label="搜索范围"><option value="semester" ${B.searchScope==='semester'?'selected':''}>当前学期</option><option value="all" ${B.searchScope==='all'?'selected':''}>全部资料</option></select></div>${result.courses.map(c=>`<button class="academic-search-result" data-action="academic-search-course" data-id="${esc(c.id)}">${icon('folder')}<span><strong>${esc(c.title)}</strong><small>${esc(academicLabel(c.id))}</small></span><span class="muted">课程</span>${icon('chevron-right')}</button>`).join('')}${result.files.map(r=>`<button class="academic-search-result" data-action="academic-search-file" data-id="${esc(r.id)}">${icon(r.kind==='notes'?'notebook-pen':'file-text')}<span><strong>${esc(r.title)}</strong><small>${esc(academicLabel(r.course_id||'unfiled'))} / ${weekLabel(r.week)} / ${esc(r.course_title||'未归档资料')}</small></span><span class="muted">${libraryKinds[r.kind]}</span>${icon('chevron-right')}</button>`).join('')}${!result.courses.length&&!result.files.length?`<div class="browser-empty">没有找到“${esc(S.search)}”${B.searchScope==='semester'?'<button class="text-button" data-action="academic-search-all">搜索全部资料</button>':''}</div>`:''}</section>`;}
function showBrowserOrganization(){return;}
async function returnToBrowser(){if(!canLeave()||S.busy)return;const result=await api('/api/library');S.resources=result.items;S.note=null;S.view='library';closeDrawer();render();}
function rememberBrowserScroll(){if(!['library','courses'].includes(S.view))return;$$('[data-browser-scroll]').forEach(el=>B.scroll[el.dataset.browserScroll]=el.scrollTop);}
const navigationDimensions={week:'周次',type:'课堂类型',chapter:'章节',kind:'资料类型'};
function navigationOrder(){return (B.groupOrder||['week']).filter(k=>Object.hasOwn(navigationDimensions,k));}
function toggleNavigation(key){if(!Object.hasOwn(navigationDimensions,key))return;const levels=navigationOrder(),i=levels.indexOf(key);if(i<0)levels.push(key);else levels.splice(i,1);B.groupOrder=levels;B.paths={};B.scroll.groups=0;saveBrowser();render();}
function quickNavigation(){const levels=navigationOrder();return `<nav class="quick-navigation" aria-label="快速分类"><span class="quick-fixed" aria-label="第一级固定为课程"><b>1</b>课程${icon('lock-keyhole')}</span><span class="quick-divider"></span>${Object.entries(navigationDimensions).map(([key,label])=>{const i=levels.indexOf(key);return `<button class="quick-classification ${i>=0?'selected':''}" data-action="navigation-toggle" data-id="${key}" aria-pressed="${i>=0}" aria-label="${i>=0?'第 '+(i+2)+' 级：'+label+'，再次点击取消':'按'+label+'分类'}">${i>=0?`<b>${i+2}</b>`:icon('plus')}<span>${label}</span></button>`;}).join('')}</nav>`;}
function materialGroupValues(r,key){if(key==='week')return r.weeks?.length?r.weeks:[r.week??''];return [groupValue(r,key)];}
function browserCourses(){return semesterCourses().sort((a,b)=>S.sort==='recent'?(b.updated_at||b.created_at||'').localeCompare(a.updated_at||a.created_at||'')||a.title.localeCompare(b.title,'zh-CN',{numeric:true}):a.title.localeCompare(b.title,'zh-CN',{numeric:true}));}
function browserData(){
 const levels=navigationOrder(),all=semesterResources().filter(r=>(r.course_id||'unfiled')===S.libraryCourse),path=[],wanted=B.paths[S.libraryCourse]||[];
 let rows=all;
 for(let i=0;i<Math.min(wanted.length,levels.length);i++){const v=wanted[i];if(!rows.some(r=>materialGroupValues(r,levels[i]).some(x=>String(x)===String(v))))break;path.push(v);rows=rows.filter(r=>materialGroupValues(r,levels[i]).some(x=>String(x)===String(v)));}
 const depth=path.length<levels.length?path.length:Math.max(0,levels.length-1);let parent=all;
 for(let i=0;i<depth;i++)parent=parent.filter(r=>materialGroupValues(r,levels[i]).some(x=>String(x)===String(path[i])));
 const groups=levels.length?(groupedResources(parent,[levels[depth]]).groups||[]):[];
 return {course:S.courses.find(c=>c.id===S.libraryCourse),rows:rows.sort(libraryCompare),levels,path,depth,groups};
}
function academicRow(r){return `<button class="browser-file ${B.files[S.libraryCourse]===r.id?'selected':''}" data-action="browser-select" data-id="${esc(r.id)}" aria-pressed="${B.files[S.libraryCourse]===r.id}">${icon(r.kind==='notes'?'notebook-pen':r.kind==='exercises'?'list-checks':'file-text')}<span>${esc(r.title)}${r.available?'':'（文件已移走）'}</span></button>`;}
function revealAcademicResource(id){const r=S.resources.find(x=>x.id===id);if(!r)return;const cid=r.course_id||'unfiled',a=courseAcademic(cid);B.stage=a?.stage||'unassigned';if(a){B.year=a.year;B.semester=a.semester;}B.week='all';S.libraryCourse=cid;B.files[cid]=id;B.paths[cid]=navigationOrder().map(key=>String(materialGroupValues(r,key)[0]??''));S.search='';S.libraryFilter='';B.scroll={};saveBrowser();render();}
function library(){
 const courses=browserCourses(),d=browserData(),selected=courses.some(c=>c.id===S.libraryCourse),active=selected?d.rows.find(r=>r.id===B.files[S.libraryCourse]):null;
 const context=`<select id="academic-stage" aria-label="学习阶段">${Object.entries(academicStages).map(([k,v])=>`<option value="${k}" ${B.stage===k?'selected':''}>${v}</option>`).join('')}</select>${B.stage!=='unassigned'?`<span>/</span><select id="academic-year" aria-label="Year">${Array.from({length:8},(_,i)=>i+1).map(n=>`<option value="${n}" ${B.year===n?'selected':''}>Year ${n}</option>`).join('')}</select><span>/</span><select id="academic-semester" aria-label="Semester">${[1,2,3].map(n=>`<option value="${n}" ${B.semester===n?'selected':''}>Semester ${n}</option>`).join('')}</select>`:''}`;
 return `<div class="course-browser navigation-browser"><header class="browser-toolbar"><div class="academic-location" aria-label="学业位置">${context}</div><div class="browser-top-controls"><label class="browser-search">${icon('search')}<input id="note-search" placeholder="${B.stage==='unassigned'?'搜索待归档资料':'搜索当前学期'}" aria-label="搜索课程和资料名称" value="${esc(S.search)}">${S.search?'<button class="icon-button" data-action="academic-clear-search" aria-label="清除搜索">'+icon('x')+'</button>':''}</label>${S.demonstration?'<span class="academic-demo-label">示例</span><a class="text-button" href="/">退出示例</a>':'<button class="outline-button" data-action="resource-import">'+icon('plus')+'导入</button>'}</div></header>${S.search?searchResults():`${quickNavigation()}<nav class="browser-breadcrumb" aria-label="当前位置"><span>课程</span>${selected?`${icon('chevron-right')}<button data-action="navigation-path" data-depth="0">${esc(d.course?.title||'未归档资料')}</button>${d.path.map((v,i)=>`${icon('chevron-right')}<button data-action="navigation-path" data-depth="${i+1}">${esc(groupTitle(v,d.levels[i]))}</button>`).join('')}`:''}</nav><div class="browser-columns ${selected&&d.levels.length?'':'browser-flat'}"><section class="browser-pane browser-courses" aria-label="课程列表"><div class="browser-pane-heading"><span>课程</span><span>${courses.length}</span></div><div class="browser-pane-scroll" data-browser-scroll="courses">${courses.map(c=>`<button class="browser-course ${S.libraryCourse===c.id?'selected':''}" data-action="library-open-course" data-id="${esc(c.id)}" aria-pressed="${S.libraryCourse===c.id}">${icon('book-open')}<span>${esc(c.title)}</span>${icon('chevron-right')}</button>`).join('')||'<div class="browser-empty">这里还没有课程</div>'}</div>${!S.demonstration?'<a class="text-button academic-example-link" href="/?demo=academic" target="_blank" rel="noopener">查看示例 '+icon('arrow-up-right')+'</a>':''}</section>${selected&&d.levels.length?`<section class="browser-pane browser-groups" aria-label="分类导航"><div class="browser-pane-heading"><span>${d.depth+2} · ${navigationDimensions[d.levels[d.depth]]}</span></div><div class="browser-pane-scroll" data-browser-scroll="groups"><button class="browser-group ${!d.path.length?'selected':''}" data-action="navigation-path" data-depth="0">全部资料</button>${d.depth?`<button class="browser-group browser-group-back" data-action="navigation-path" data-depth="${d.depth-1}">${icon('arrow-left')}上一层</button>`:''}${d.groups.map(g=>`<button class="browser-group ${String(d.path[d.depth])===String(g.value)?'selected':''}" data-action="navigation-group" data-depth="${d.depth}" data-value="${esc(g.value)}" aria-pressed="${String(d.path[d.depth])===String(g.value)}">${icon('folder')}<span>${esc(g.title)}</span><small>${g.count}</small>${d.depth<d.levels.length-1?icon('chevron-right'):''}</button>`).join('')}</div></section>`:''}<section class="browser-pane browser-files" aria-label="资料列表">${selected?`<div class="browser-files-toolbar"><span>${d.rows.length} 项</span><div><select id="note-sort" aria-label="排序方式">${Object.entries({name:'按名称',recent:'最近添加'}).map(([k,v])=>`<option value="${k}" ${S.sort===k?'selected':''}>${v}</option>`).join('')}</select>${d.course&&!S.demonstration?'<button class="icon-button" data-action="browser-set-term" aria-label="课程归档">'+icon('folder-cog')+'</button>':''}</div></div><div class="browser-pane-scroll" data-browser-scroll="files">${d.rows.map(academicRow).join('')||'<div class="browser-empty">这里还没有资料</div>'}</div>${browserResourceDetails(active)}`:`<div class="browser-welcome">${icon('folders')}<h2>选择一门课程</h2><p>选择分类按钮，按你习惯的顺序查看资料。</p></div>`}</section></div>`}</div>`;
}
function browserResourceDetails(r){
 if(!r)return '<div class="browser-preview-empty">选择文件</div>';
 const c=S.courses.find(c=>c.id===r.course_id),study=r.id==='source-'+r.course_id||r.study_source===true||r.note_id;
 return `<section class="browser-detail compact-file-actions" aria-label="选中文件"><h2>${esc(r.title)}</h2><div class="browser-file-actions"><button class="${study?'outline-button':'primary sm'}" data-action="resource-open" data-id="${esc(r.id)}" ${!r.available?'disabled':''}>打开${icon('arrow-up-right')}</button>${c&&study?`<button class="primary sm" data-action="course" data-id="${esc(c.id)}">${r.note_id?'学习对话':c.status==='planning'?'开始学习':'继续学习'} ${icon('arrow-right')}</button>`:''}<button class="text-button" data-action="resource-classify" data-id="${esc(r.id)}">${icon('info')}详细信息</button></div></section>`;
}
function showResourceClassification(id){
 const r=S.resources.find(x=>x.id===id);if(!r)return;const linked=!!r.note_id||r.id.startsWith('source-')||r.study_source===true,source=S.resources.find(x=>x.id===(r.source_id||'source-'+r.course_id));
 const peers=S.resources.filter(x=>x.course_id===r.course_id&&x.id!==r.id&&(x.source_id===r.id||x.note_id&&r.id==='source-'+r.course_id));
 modalContent('详细信息',`<form id="resource-metadata-form"><input type="hidden" name="id" value="${esc(id)}"><p class="resource-dialog-title">${esc(r.title)}</p><label class="field"><span class="field-label">所属课程</span>${linked?`<input value="${esc(r.course_title||S.courses.find(c=>c.id===r.course_id)?.title||'未归档')}" readonly>`:`<select name="course_id"><option value="">未归档</option>${S.courses.map(c=>`<option value="${esc(c.id)}" ${c.id===r.course_id?'selected':''}>${esc(c.title)}</option>`).join('')}</select>`}</label>${classificationFields(r)}<label class="field"><span class="field-label">主题</span><input name="topic" maxlength="150" value="${esc(r.topic||'')}"></label><label class="field"><span class="field-label">章节</span><input name="chapter" maxlength="100" placeholder="未设置" value="${esc(r.chapter||'')}"></label><label class="field"><span class="field-label">资料类型</span><select name="kind">${Object.entries(libraryKinds).map(([k,v])=>`<option value="${k}" ${r.kind===k?'selected':''}>${v}</option>`).join('')}</select></label>${r.note_id&&source?`<div class="metadata-links"><span>来源</span><button type="button" class="text-button" data-action="related-resource" data-id="${esc(source.id)}">${esc(source.title)}</button></div>`:''}${peers.length?`<details class="or-paste"><summary>关联笔记</summary>${peers.map(x=>`<button type="button" class="text-button" data-action="related-resource" data-id="${esc(x.id)}">${esc(x.title)}</button>`).join('')}</details>`:''}${Object.keys(r.metadata_sources||{}).length?`<details class="or-paste"><summary>识别依据</summary>${Object.entries(r.metadata_sources).filter(([k])=>k!=='week').map(([k,v])=>`<p class="metadata-evidence"><strong>${esc({weeks:'周次',class_type:'课堂类型',topic:'主题',chapter:'章节',kind:'资料类型',course_id:'课程'}[k]||k)}</strong> ${esc(v.source)}${v.evidence?' · '+esc(v.evidence):''}</p>`).join('')}</details>`:''}<div id="modal-error" class="error-message" role="alert"></div>${S.demonstration?'<p class="small muted">修改仅在本次示例中生效。</p>':''}<div class="modal-actions"><button type="submit" class="primary">保存</button></div></form>`);
}
function classificationFields(r={}){return `<div class="classification-fields"><label class="field"><span class="field-label">教学周</span><input name="week" aria-label="教学周" placeholder="如 3 或 3–5，可留空" value="${esc(r.weeks?.length?r.weeks.join(', '):r.week??'')}"></label><label class="field"><span class="field-label">课堂类型</span><input name="class_type" aria-label="课堂类型" list="class-types" maxlength="60" placeholder="未设置" value="${esc(r.class_type||'')}"><datalist id="class-types">${(S.tag_catalog?.groups?.class_type||['Lecture','Tutorial','Lab','Seminar','Exam']).map(value=>`<option value="${esc(value)}">`).join('')}</datalist></label></div>`;}

async function openLibrary(course='',kind=''){
  const result=await api('/api/library');S.resources=result.items;rememberBrowserScroll();S.libraryCourse=course;S.libraryFilter=kind;S.libraryKind=kind||'originals';S.note=null;S.view='library';closeDrawer();saveBrowser();render();requestAnimationFrame(()=>{$('.browser-course.selected')?.scrollIntoView({block:'nearest'});rememberBrowserScroll();});
}
let recognitionDraft=null,recognitionPending=false,recognitionToken=0;
function readUpload(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(new Error('读取文件失败。'));r.readAsDataURL(file);});}
function selectedAcademicData(){return {academic_stage:B.stage,academic_year:B.year,academic_semester:B.semester};}
async function recognizeUpload(file){
 const token=++recognitionToken;recognitionDraft=null;if(!file)return;if(file.size>15*1024*1024){$('#recognition-status').textContent='文件不能超过 15 MB。';return;}
 recognitionPending=true;const submit=$('#resource-upload-form button[type="submit"]');if(submit)submit.disabled=true;
 const status=$('#recognition-status');if(status)status.textContent='正在识别资料信息…';
 try{const data=await api('/api/library/recognize',{filename:file.name,file:await readUpload(file),...selectedAcademicData(),course_id:S.libraryCourse==='unfiled'?'':S.libraryCourse});if(token!==recognitionToken||!$('#resource-upload-form'))return;recognitionDraft=data;
  const form=$('#resource-upload-form');for(const [name,value] of Object.entries({week:data.fields.weeks?.join(', ')||data.fields.week||'',class_type:data.fields.class_type||'',topic:data.fields.topic||'',chapter:data.fields.chapter||'',kind:data.fields.kind||'originals',role:data.role||'material',course_id:data.role==='timetable'?'':data.course_id||S.libraryCourse||''})){const el=form.elements[name];if(el&&!el.dataset.userEdited)el.value=value;}
  $('#recognition-status').textContent=data.notice||((data.role==='timetable'?'识别为课表':data.role==='syllabus'?'识别为教学大纲':'信息已识别')+' · 可在详细信息中核对');
 }catch(error){if(token===recognitionToken&&$('#recognition-status'))$('#recognition-status').textContent=error.message+' 可以直接保存，稍后补充信息。';}
 finally{if(token===recognitionToken){recognitionPending=false;const button=$('#resource-upload-form button[type="submit"]');if(button)button.disabled=false;}}
}
function showResourceImport(){
 recognitionDraft=null;recognitionPending=false;recognitionToken++;
 modalContent('导入',`<form id="resource-upload-form"><label class="field upload-main-file"><span class="field-label">课件、课表或教学大纲</span><input type="file" name="attachment" aria-label="选择资料" accept=".pdf,.pptx,.docx,.md,.txt,.png,.jpg,.jpeg,.webp"><small class="muted">PDF、PPTX、文字或图片 · 最大 15 MB</small></label><p id="recognition-status" class="recognition-status" role="status">选好文件后自动识别。</p><details class="or-paste"><summary>粘贴文字</summary><label class="field"><textarea name="text" aria-label="资料正文" placeholder="也可以粘贴课表或学习资料"></textarea></label><button type="button" class="outline-button ai-action" data-action="recognize-pasted">用 AI 识别</button></details><details class="or-paste import-metadata"><summary>详细信息</summary><label class="field"><span class="field-label">所属课程</span><select name="course_id"><option value="">自动识别／新课程</option>${S.courses.map(c=>`<option value="${esc(c.id)}" ${S.libraryCourse===c.id?'selected':''}>${esc(c.title)}</option>`).join('')}</select></label><label class="field"><span class="field-label">名称（可选）</span><input name="title" maxlength="150"></label><label class="field"><span class="field-label">资料用途</span><select name="role"><option value="material">学习资料</option><option value="timetable">课表 · 学期参考</option><option value="syllabus">教学大纲 · 学期参考</option></select></label>${classificationFields()}<label class="field"><span class="field-label">主题</span><input name="topic" maxlength="150"></label><label class="field"><span class="field-label">章节</span><input name="chapter" maxlength="100"></label><label class="field"><span class="field-label">资料类型</span><select name="kind">${Object.entries(libraryKinds).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>${academicFields({stage:B.stage,year:B.year,semester:B.semester})}</details><div id="modal-error" class="error-message" role="alert"></div><div class="modal-actions"><button type="submit" class="primary">导入</button></div></form>`);
}
async function recognizePasted(){
 const form=$('#resource-upload-form'),text=form.elements.text.value.trim();if(!text){toast('请先粘贴文字。');return;}
 const token=++recognitionToken;recognitionPending=true;recognitionDraft=null;form.querySelector('button[type="submit"]').disabled=true;$('#recognition-status').textContent='正在识别文字…';
 try{const result=await api('/api/library/recognize',{text,filename:'粘贴资料.md',...selectedAcademicData(),course_id:S.libraryCourse==='unfiled'?'':S.libraryCourse});if(token!==recognitionToken||!$('#resource-upload-form'))return;recognitionDraft=result;
  for(const [key,value] of Object.entries({...result.fields,role:result.role,week:result.fields.weeks?.join(', ')||result.fields.week||'',course_id:result.role==='timetable'?'':result.course_id||S.libraryCourse||''})){const input=form.elements[key];if(input&&!input.dataset.userEdited)input.value=value??'';}
  $('#recognition-status').textContent=result.notice||((result.role==='timetable'?'识别为课表':result.role==='syllabus'?'识别为教学大纲':'信息已识别')+' · 可在详细信息中核对');
 }catch(error){if(token===recognitionToken&&$('#recognition-status'))$('#recognition-status').textContent=error.message;}
 finally{if(token===recognitionToken){recognitionPending=false;const button=$('#resource-upload-form button[type="submit"]');if(button)button.disabled=false;}}
}
async function submitResourceUpload(form,data){
 if(recognitionPending)throw new Error('请等待资料识别完成。');const file=data.attachment;delete data.attachment;
 if(file?.size){if(file.size>15*1024*1024)throw new Error('文件不能超过 15 MB。');data.filename=file.name;data.file=await readUpload(file);}else{if(!data.text?.trim())throw new Error('请选择文件或粘贴内容。');data.filename=(data.title||'学习资料')+'.md';}
 if(recognitionDraft)data.recognition=recognitionDraft;
 const sourceFields=recognitionDraft?.fields||{};
 for(const key of ['week','class_type','topic','chapter'])if(!form.elements[key].dataset.userEdited&&!String(data[key]||'').trim()&&!sourceFields[key])delete data[key];
 let result;
 if(data.role==='timetable'||data.role==='syllabus'){
   result=await api('/api/context/upload',data);S.resources=result.items;S.semester_context=result.context;modal.close();render();toast('已保存为学期参考，后续导入会使用这些信息。');
 }else if(!data.course_id&&S.settings.connected){
   data.title=data.title||recognitionDraft?.course_title||PathTitle(data.filename);
   const c=await api('/api/import',data);S.conversation=[];S.studyDraft='';updateCourse(c);S.libraryCourse=c.id;await assignAcademic(c.id,data);B.statusVisible=true;S.view='overview';S.note=null;modal.close();render();resetScroll();
 }else{
   result=await api('/api/library/upload',data);S.resources=result.items;modal.close();revealAcademicResource(result.item.id);toast('资料已导入');
 }
}
function PathTitle(filename){return String(filename).replace(/\.[^.]+$/,'');}

async function openResource(id){
  if(S.demonstration){const r=S.resources.find(x=>x.id===id);if(!r)return;if(r.note_id){await openNote(r.course_id,r.note_id);return;}modalContent(esc(r.title),`<div class="resource-preview markdown">${md(r.content||'# 示例资料')}</div>`);return;}
  const r=S.resources.find(r=>r.id===id);if(!r?.available){toast('文件已移走，请检查存放位置。');return;}
  if(r.note_id){await openNote(r.course_id,r.note_id);return;}
  const result=await api('/api/library/'+encodeURIComponent(id));
  modalContent(r.title,`<div class="resource-preview">${result.text!==null?`<div class="markdown">${md(result.text)}</div>`:''}<a class="outline-button" href="/api/library/${encodeURIComponent(id)}/file" target="_blank" rel="noopener">打开原文件 ${icon('arrow-up-right')}</a><details class="or-paste"><summary>存放位置</summary><p class="resource-path">${esc(r.path)}</p></details></div>`);
}
let editorSource=false,saveTimer,savePromise=null,saveBlocked=false,saveError='',noteEditor=null,editorSnapshot=null;
function splitEditor(content){const prefix=content.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0]||'';return {prefix,parts:[content.slice(prefix.length)]};}
function prepareEditor(){if(editorSnapshot?.state.doc.toString()!==(S.editDraft??S.note.content))editorSnapshot=null;}
function mountEditor(){
  if(!S.editing||S.view!=='note')return;
  noteEditor=StudyEditor.create({parent:$('#continuous-editor'),content:S.editDraft,source:editorSource,state:editorSnapshot?.id===S.note.id?editorSnapshot.state:null,render:md,onChange:recordEdit});noteEditor.noteId=S.note.id;
}
function recordEdit(content){
  S.editDraft=content;S.dirty=content!==S.note.content;editorStatus(S.dirty?'未保存':'已保存');
  clearTimeout(saveTimer);if(!saveBlocked)saveTimer=setTimeout(()=>saveEditingNote(),900);
}
function saveErrorNotice(){return saveError?`<div class="inline-notice">${esc(saveError)}<br><button class="text-button" data-action="copy-draft">复制我的编辑</button> · <button class="text-button" data-action="reload-note">读取最新文件</button> · <button class="text-button" data-action="retry-save">重试保存</button></div>`:'';}
function editorStatus(text){const status=$('#draft-status');if(status)status.textContent=text;}
async function saveEditingNote(){
  clearTimeout(saveTimer);
  if(savePromise){await savePromise;if(saveBlocked)return false;return S.dirty?saveEditingNote():true;}
  if(!S.editing||!S.dirty)return true;if(saveBlocked)return false;
  const content=S.editDraft,cid=S.course.id,nid=S.note.id,etag=S.note.etag;
  editorStatus('保存中…');
  savePromise=(async()=>{
    try{const note=await api(`/api/courses/${cid}/save-note`,{note_id:nid,content,etag});
      if(S.note?.id===nid){saveError='';S.note=note;S.dirty=S.editDraft!==content;const notice=$('#edit-notice');if(notice)notice.innerHTML='';editorStatus(S.dirty?'未保存':'已保存');}return true;
    }catch(error){saveBlocked=true;saveError=error.message;editorStatus('未保存');const notice=$('#edit-notice');if(notice)notice.innerHTML=`<div class="inline-notice">${esc(error.message)}<br><button class="text-button" data-action="copy-draft">复制我的编辑</button> · <button class="text-button" data-action="reload-note">读取最新文件</button> · <button class="text-button" data-action="retry-save">重试保存</button></div>`;return false;}
  })();
  const ok=await savePromise;savePromise=null;if(ok&&S.dirty) return saveEditingNote();return ok;
}
function beginEditing(){if(S.threadBusy||S.editing)return;closeDrawer();saveBlocked=false;saveError='';S.editing=true;S.editDraft=S.note.content;S.dirty=false;prepareEditor();render();noteEditor?.focus();}
async function finishEditing(){if(await saveEditingNote()){S.editing=false;render();}}

function showNoteThreads(){
      const list=S.note.discussions,comments=(S.course.highlights||[]).filter(m=>m.target===S.note.id&&m.style==='comment');modalContent('学习旁注',list.length+comments.length?comments.map(m=>`<button class="note-annotation-link" data-action="read-comment" data-id="${m.id}"><strong>${esc(m.quote)}</strong><br>${esc(m.comment)}</button>`).join('')+list.map(t=>`<button class="note-annotation-link" data-action="pick-thread" data-id="${t.id}">${esc(t.title)}</button>`).join(''):'<p class="modal-description">暂无旁注。选中正文可以写批注或追问。</p>');
}

function notePage(){
  const n=S.note;if(!n)return '';
  if(S.editing)return `<div class="page editor-page"><div id="continuous-editor"></div><div class="editor-status"><span id="draft-status">${S.dirty?'未保存':'已保存'}</span><button class="text-button" data-action="editor-mode">${editorSource?'源码':'实时预览'} ${icon('chevrons-up-down')}</button></div><div id="edit-notice">${saveErrorNotice()}</div></div>`;
  const clean=n.content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,''),pieces=clean.split(/<!-- block:([\w-]+) -->/);
  let html=`<div class="markdown">${md(pieces[0])}</div>`;
  for(let i=1;i<pieces.length;i+=2){const bid=pieces[i],threads=n.discussions.filter(t=>t.block_id===bid&&t.anchor_status!=='unlocated');html+=`<section class="note-section" data-block="${bid}"><div class="markdown" data-selectable="note">${md(pieces[i+1]||'')}</div>${threads.length?`<button class="annotation-badge" data-action="block-annotations" data-id="${bid}" title="${esc(threads.map(t=>t.title).join('；'))}" aria-label="查看学习旁注">${icon('message-square')}</button>`:''}</section>`;}
  return `<article class="page note-page"><div class="note-metadata"><span>${esc(n.course_title)}</span><span>${dateText(n.created_at)}</span><button class="text-button" data-action="note-threads">${icon('message-square')}旁注</button></div><div id="note-body" data-selectable="note">${html}</div></article>`;
}
function render(){
  const hadLearningHome=!!$('#learning-current-week');
  selectionAnchor=null;
  const scroll=$('.content-scroll')?.scrollTop||0,input=$('#main-question textarea')?.value;rememberBrowserScroll();
  const panel=statusPanel(),studying=['overview','learn'].includes(S.view);
  const oldSource=$('.learning-source');if(oldSource)oldSource.remove();
  if(noteEditor){editorSnapshot={id:noteEditor.noteId,state:noteEditor.view.state};noteEditor.destroy();noteEditor=null;}
  $('#app').innerHTML=`<div class="workspace view-${S.view} ${panel?'has-status':''}">${sidebar()}${studying?'<div id="learning-source-slot"></div>':''}<main class="main">${header()}${S.view==='note'&&!S.editing?readingToolbar():''}${S.busy?`<div class="busybar" role="status">${icon('loader-circle')}${esc(S.busyText)}</div>`:''}<div class="content-scroll">${S.view==='courses'?coursesPage():S.view==='overview'?overview():S.view==='learn'?learn():S.view==='library'?library():notePage()}</div>${['overview','learn'].includes(S.view)?composer():''}</main>${panel}</div>`;
  if(studying)window.StudyUnits.mountSource?.(oldSource);
  if(!hadLearningHome&&$('#learning-current-week'))window.StudyLearningHome?.mount();
  if(input&&$('#main-question textarea')&&!S.threadBusy)$('#main-question textarea').value=S.studyDraft||input;
  $('.content-scroll').scrollTop=scroll;$$('[data-browser-scroll]').forEach(el=>el.scrollTop=B.scroll[el.dataset.browserScroll]||0);icons();applyMarks();mountEditor();if($('#note-body'))$('#note-body').style.setProperty('--reading-size',readingSize+'px');syncReadingTools();
  $$('.markdown a').forEach(a=>{a.target='_blank';a.rel='noopener noreferrer';});
}

function resetScroll(){requestAnimationFrame(()=>{const el=$('.content-scroll');if(el)el.scrollTop=0;});}
async function loadCourse(cid){
  if(!canLeave()||S.busy)return;
  const c=S.courses.find(x=>x.id===cid);if(!c)return;
  S.importError='';S.importPending=false;rememberBrowserScroll();B.statusVisible=true;S.libraryCourse=cid;saveBrowser();closeDrawer();S.conversation=[];S.studyDraft='';S.studyQuote='';S.studyQuoteBlock='';S.studyError='';
  if($('#main-question textarea'))$('#main-question textarea').value='';
  updateCourse(c);S.view=c.status==='planning'?'overview':'learn';S.note=null;
  await task('正在读取对话…',async()=>{S.conversation=(await api(courseUrl('conversation'))).conversation;});
  S.lesson=studyMessages().find(m=>m.kind==='lesson'&&m.block_id===c.active)?.content||'';render();scrollStudyBottom();
}
async function openBlock(id){
  if(!canLeave()||S.busy)return;closeDrawer();S.selectedNoteBlock=null;S.studyQuote='';S.studyQuoteBlock='';
  await task('正在讲解这一块…',async()=>{const result=await api(courseUrl('lesson'),{block_id:id});updateCourse(result.course);S.lesson=result.content;S.conversation=result.conversation;S.view='learn';});
  requestAnimationFrame(()=>document.getElementById('turn-'+id)?.scrollIntoView({block:'start',behavior:'smooth'}));
}

async function openNote(cid,nid){
  if(!canLeave()||S.busy)return;rememberBrowserScroll();saveBrowser();closeDrawer();
  await task('正在打开笔记…',async()=>{S.note=await api(`/api/courses/${cid}/notes/${nid}`);updateCourse(S.courses.find(c=>c.id===cid));S.view='note';S.editing=false;});resetScroll();
}

function modalContent(title,body){modal.classList.remove('ai-service-dialog');modal.setAttribute('aria-label',title);modal.classList.toggle('account-dialog',body.includes('class="account-settings"'));modal.innerHTML=`<div class="modal-head"><h2>${title}</h2><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('x')}</button></div><div class="modal-body">${body}</div>`;if(!modal.open)modal.showModal();icons();}
function showImport(){
  if(S.busy)return;currentFile=null;
  modalContent('导入课件',`<p class="modal-description">导入后生成课程总览和学习分块。</p><form id="import-form"><label class="dropzone" id="dropzone">${icon('file-up')}<strong id="file-name">选择或拖入一份课件</strong><span>PDF / PPTX / Markdown / TXT · 最大 15 MB</span><input type="file" id="course-file" accept=".pdf,.pptx,.md,.txt" aria-label="选择课件"></label><details class="or-paste"><summary>粘贴文字</summary><label class="field"><textarea name="text" placeholder="粘贴学习资料…" aria-label="粘贴学习资料"></textarea></label></details><label class="field"><span class="field-label">资料标题 <span class="muted">（可选）</span></span><input name="title" placeholder="例如：离散数学 · 第三章"></label>${classificationFields()}<details class="or-paste" open><summary>课程位置</summary>${academicFields({stage:B.stage,year:B.year,semester:B.semester})}</details><details class="or-paste"><summary>学习方式</summary><label class="field"><textarea name="method" aria-label="学习方式">${esc(S.method)}</textarea></label></details>${!S.settings.connected?'<div class="inline-notice">请先连接 AI。<button class="text-button" type="button" data-action="settings">打开 AI 设置 →</button></div>':''}<p class="small muted">仅在使用 AI 时，将提取的文字发送至你配置的模型接口。暂不识别扫描件和图片内容。</p><div id="modal-error" class="error-message" role="alert"></div><div class="modal-actions"><button type="button" class="text-button" data-action="demo">示例课程</button><button type="submit" class="primary" ${!S.settings.connected?'disabled':''}>${icon('sparkles')}生成学习分块</button></div></form>`);
  const zone=$('#dropzone');zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('drag');});zone.addEventListener('dragleave',()=>zone.classList.remove('drag'));zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('drag');chooseFile(e.dataTransfer.files[0]);});
}
function chooseFile(file){if(!file)return;if(file.size>15*1024*1024){$('#modal-error').textContent='文件不能超过 15 MB。';return;}currentFile=file;$('#file-name').textContent=file.name;$('#modal-error').textContent='';}
let accountAI=null,aiEdit=null,aiBusy=false,accountTab='ai';
function closeAccountMenu(){const root=$('#account-menu-root');if(root)root.innerHTML='';$('.profile-button')?.setAttribute('aria-expanded','false');}
function showAccountMenu(){
 if(S.demonstration){modalContent('示例模式','<p class="modal-description">这里使用示例课程，不会修改你的资料。</p><a class="primary" href="/">返回我的学习资料</a>');return;}
 const root=$('#account-menu-root');if(root.innerHTML){closeAccountMenu();return;}
 root.innerHTML=`<div class="account-menu" role="menu" aria-label="个人设置"><div class="account-menu-user"><span class="profile-avatar">${avatarMarkup(S.profile)}</span><div><strong>${esc(S.profile.name||'本机用户')}</strong></div></div><button role="menuitem" data-action="settings">${icon('settings-2')}个人设置</button><button role="menuitem" data-action="onboarding">${icon('compass')}新手引导</button></div>`;
 $('.profile-button')?.setAttribute('aria-expanded','true');icons();
}
function accountProfileForm(){return `<div class="settings-page-title"><h2>个人资料</h2></div><form id="profile-form"><div class="profile-photo-field"><span class="profile-avatar large">${avatarMarkup(S.profile)}</span><div class="profile-photo-copy"><strong>${esc(S.profile.name||'本机用户')}</strong><label class="avatar-picker">更换头像<input type="file" name="avatar" accept="image/png,image/jpeg,image/webp" aria-label="更换头像"></label></div></div><label class="field"><span class="field-label">昵称</span><input name="name" value="${esc(S.profile.name)}" placeholder="你的名字" maxlength="32" autocomplete="nickname"></label><div id="modal-error" class="error-message" role="alert"></div><div class="modal-actions"><button type="submit" class="primary">保存修改</button></div></form>`;}
function serviceModelName(p,m){return p.model_names?.[m]||m;}
function defaultModelOptions(scope){const chosen=accountAI.defaults[scope];return `${scope==='translation'?`<option value="" ${!chosen?'selected':''}>跟随学习模型</option>`:''}${!accountAI.services.length&&scope==='learning'?'<option value="">尚未连接服务</option>':''}${accountAI.services.map(p=>`<optgroup label="${esc(p.name)}">${p.models.map(m=>`<option value="${esc(p.id+'|'+m)}" ${chosen?.id===p.id&&chosen?.model===m?'selected':''}>${esc(serviceModelName(p,m))}</option>`).join('')}</optgroup>`).join('')}`;}
function providerMark(provider){return {deepseek:'DS',openai:'GPT',qwen:'Q',zhipu:'GLM',doubao:'豆',kimi:'K',gemini:'G',claude:'C'}[provider]||'AI';}
function accountAIHome(){return `<div class="settings-section-head settings-page-title ai-reference-heading"><h2>AI 服务</h2><button class="outline-button settings-add-button" data-action="ai-add">${icon('plus')}添加服务</button></div><h3 class="ai-list-label">我的模型</h3><div class="ai-service-list">${accountAI.services.map(p=>`<button class="ai-service-row" data-action="ai-edit" data-id="${esc(p.id)}"><span class="ai-service-mark">${providerMark(p.provider)}</span><span class="ai-service-copy"><strong>${esc(p.name)}</strong><small>${p.models.length>2?'已启用 '+p.models.length+' 个模型':p.models.map(m=>esc(serviceModelName(p,m))).join(' · ')}</small></span><span class="service-status ${p.connected?'is-connected':''}">${p.connected?'✓ 已连接':'未连接'}</span>${icon('chevron-right')}</button>`).join('')||'<p class="ai-empty-copy">还没有添加服务</p>'}</div><div id="modal-error" class="error-message" role="status"></div>`;}
function aiDefaultsContent(){return `<details class="ai-default-settings"><summary>默认模型</summary><div class="settings-model-row"><label for="ai-learning-default">学习</label><select id="ai-learning-default" aria-label="学习默认模型">${defaultModelOptions('learning')}</select></div><div class="settings-model-row"><label for="ai-translation-default">翻译</label><select id="ai-translation-default" aria-label="翻译默认模型">${defaultModelOptions('translation')}</select></div></details>`;}
function renderAccount(){
 if(accountTab==='ai'&&aiEdit){modalContent(`<span class="ai-title-mark">${providerMark(aiEdit.provider)}</span><span>${aiEdit.id?esc(aiEdit.name):'添加服务'}</span>`,aiEditorContent());modal.classList.add('ai-service-dialog');modal.setAttribute('aria-label',aiEdit.id?'编辑 AI 服务':'添加服务');return;}
 modalContent('个人设置',`<div class="account-settings"><nav class="account-settings-nav" aria-label="个人设置栏目"><div class="account-nav-title">个人设置</div><button data-action="account-profile" class="${accountTab==='profile'?'active':''}" ${accountTab==='profile'?'aria-current="page"':''}>${icon('user-round')}个人资料</button><button data-action="account-ai" class="${accountTab==='ai'?'active':''}" ${accountTab==='ai'?'aria-current="page"':''}>${icon('sparkles')}AI 服务</button><div class="settings-account-identity"><span class="profile-avatar">${avatarMarkup(S.profile)}</span><span><strong>${esc(S.profile.name||'本机用户')}</strong><small>本机工作区</small></span></div></nav><section class="account-settings-content">${accountTab==='profile'?accountProfileForm():aiEdit?aiEditorContent():accountAIHome()}</section></div>`);
}
async function showSettings(tab='ai'){
 closeAccountMenu();if(aiBusy)return;accountTab=typeof tab==='string'?tab:'ai';aiEdit=null;
 accountAI=await api('/api/ai');renderAccount();
}
function openAIEditor(id){
 const p=accountAI.services.find(p=>p.id===id),provider=p?.provider||'deepseek';
 aiEdit={tab:p?.has_key?'models':'connection',id:p?.id||'',provider,name:p?.name||accountAI.providers[provider].name,base:p?.base||accountAI.providers[provider].base,key:'',has_key:!!p?.has_key,
 models:(p?.models||[]).map(m=>({id:m,name:serviceModelName(p,m),enabled:true})),model:id&&accountAI.defaults.learning?.id===id?accountAI.defaults.learning.model:p?.models[0]||''};renderAccount();
}
function aiModelsContent(){return aiEdit.models.length?`<div class="ai-models-scroll">${aiEdit.models.map((m,i)=>`<label class="ai-model-row"><input type="checkbox" data-model-index="${i}" ${m.enabled?'checked':''}><span>${esc(m.name)}${m.name!==m.id?`<small>${esc(m.id)}</small>`:''}</span></label>`).join('')}</div>`:'<p class="small muted">获取模型列表，或手动添加模型 ID。</p>';}
function aiEditorContent(){const models=aiEdit.tab==='models';return `<div class="ai-editor-tabs" role="tablist" aria-label="服务配置"><button role="tab" aria-selected="${models}" data-action="ai-editor-tab" data-tab="models">模型</button><button role="tab" aria-selected="${!models}" data-action="ai-editor-tab" data-tab="connection">连接</button></div><form id="ai-service-form"><section ${models?'hidden':''} class="ai-connection-panel" role="tabpanel" aria-label="连接"><label class="field"><span class="field-label">服务商</span><select name="provider" id="ai-provider" aria-label="服务商">${Object.entries(accountAI.providers).map(([id,p])=>`<option value="${id}" ${aiEdit.provider===id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><label class="field ai-key-field"><span class="field-label">API Key</span><input type="password" name="key" aria-label="API Key" autocomplete="off" value="${esc(aiEdit.key)}" placeholder="${aiEdit.has_key?'已连接，留空保留当前 Key':'输入 API Key'}"></label><details class="ai-advanced" ${aiEdit.provider==='custom'?'open':''}><summary>高级设置</summary><label class="field"><span class="field-label">接口地址</span><input type="url" name="base" aria-label="API 基础地址" required value="${esc(aiEdit.base)}" placeholder="https://example.com/v1"></label><label class="field"><span class="field-label">名称</span><input name="name" aria-label="连接名称" maxlength="60" required value="${esc(aiEdit.name)}"></label><p class="ai-key-note">Key 仅在本次服务运行期间保留。</p></details></section><section ${models?'':'hidden'} class="ai-model-panel" role="tabpanel" aria-label="模型"><div class="settings-section-head"><span class="ai-model-count">已启用 ${aiEdit.models.filter(m=>m.enabled).length} 个</span><button type="button" class="text-button" data-action="ai-fetch-models">查找模型</button></div><div id="ai-model-options">${aiModelsContent()}</div><details class="ai-manual-details"><summary>手动添加模型</summary><div class="ai-manual-model"><input id="ai-manual-model" aria-label="模型 ID" placeholder="输入模型 ID"><button type="button" class="text-button" data-action="ai-manual-add">添加</button></div></details><label class="field model-test-field"><span class="field-label">测试模型</span><select name="model" id="ai-test-model" aria-label="测试模型">${aiEdit.models.filter(m=>m.enabled).map(m=>`<option value="${esc(m.id)}" ${aiEdit.model===m.id?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label>${aiEdit.id?aiDefaultsContent():''}</section><div id="modal-error" class="error-message" role="status"></div><footer class="ai-save-actions">${aiEdit.id?'<div class="ai-service-actions"><button type="button" class="text-button" data-action="ai-remove">移除服务</button><button type="button" class="text-button" data-action="ai-disconnect">断开</button></div>':''}<div class="ai-confirm-actions">${models?'<button type="button" class="text-button" data-action="ai-test">测试连接</button>':''}<button type="button" class="outline-button" data-action="ai-back">取消</button><button type="submit" class="primary">${!models?'下一步':'保存'}</button></div></footer></form>`;}
async function advanceAI(){
 const payload=aiPayload();if(!payload.key&&!aiEdit.has_key){$('#modal-error').textContent='请先填写 API Key。';return;}
 await aiOperation('正在获取模型…',async()=>{try{const result=await api('/api/ai/models',payload),existing=new Map(aiEdit.models.map(m=>[m.id,m]));for(const id of result.models){if(!existing.has(id))existing.set(id,{id,name:result.model_names[id]||id,enabled:false});}aiEdit.models=[...existing.values()];aiEdit.tab='models';renderAccount();}catch(error){aiEdit.tab='models';renderAccount();$('#modal-error').textContent=error.message;}});
}
function captureAI(){
 const form=$('#ai-service-form');if(!form)return;const data=Object.fromEntries(new FormData(form));Object.assign(aiEdit,{provider:data.provider,name:data.name,base:data.base,key:data.key,model:data.model||aiEdit.models.find(m=>m.enabled)?.id||''});
}
function aiPayload(){captureAI();return {id:aiEdit.id,provider:aiEdit.provider,name:aiEdit.name,base:aiEdit.base,key:aiEdit.key,model:aiEdit.model,models:aiEdit.models.filter(m=>m.enabled).map(m=>m.id),model_names:Object.fromEntries(aiEdit.models.filter(m=>m.enabled).map(m=>[m.id,m.name]))};}
async function aiOperation(label,fn){
 if(aiBusy)return;aiBusy=true;modal.dataset.working='1';const controls=$$('input,select,button',modal),oldDisabled=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);const message=$('#modal-error');if(message)message.textContent=label;
 try{await fn();}catch(error){if($('#modal-error'))$('#modal-error').textContent=error.message;else toast(error.message);}
 finally{aiBusy=false;delete modal.dataset.working;controls.forEach((c,i)=>c.disabled=oldDisabled[i]);icons();}
}
async function updateAIState(result){accountAI=result;S.settings=(await api('/api/state')).settings;render();}

function showFinish(){
  const c=S.course,covered=c.session_blocks.length,unitLabel=c.learning_kind==='solutions'?'题':'个知识块';
  modalContent('结束本次学习',`<p class="modal-description">整理本次内容，保存为笔记。</p><div class="finish-blocks">${c.blocks.filter(b=>c.session_blocks.includes(b.id)).map(b=>`<div>${icon(c.completed.includes(b.id)?'circle-check':'circle')}<span>${esc(b.title)}</span><small>${c.completed.includes(b.id)?'已学完':'已阅读'}</small></div>`).join('')}</div><form id="finish-form"><label class="field"><span class="field-label">笔记名称</span><input name="title" value="${esc(c.title)} · 学习笔记" required maxlength="150"></label><p class="modal-description">追问保存为旁注，保留完整讨论。</p><div id="modal-error" class="error-message" role="alert"></div><div class="modal-actions"><button type="button" class="outline-button" data-action="close-modal">继续学</button><button type="submit" class="primary">${icon('notebook-pen')}结束并整理笔记</button></div></form>`);
}
function showOutline(){outlineDraft=structuredClone(S.course.blocks);renderOutline();}
function renderOutline(){
  modalContent('调整学习分块',`<p class="modal-description">调整名称和顺序；知识点每行一个。</p><form id="outline-form"><div class="outline-edit">${outlineDraft.map((b,i)=>`<div class="outline-edit-item" data-index="${i}"><div class="outline-edit-head"><span class="small muted">${i+1}</span><input name="title-${i}" value="${esc(b.title)}" required aria-label="第 ${i+1} 块标题"><button type="button" class="icon-button" data-action="move-up" data-index="${i}" aria-label="上移第 ${i+1} 块" ${i===0?'disabled':''}>${icon('arrow-up')}</button><button type="button" class="icon-button" data-action="move-down" data-index="${i}" aria-label="下移第 ${i+1} 块" ${i===outlineDraft.length-1?'disabled':''}>${icon('arrow-down')}</button></div><textarea name="points-${i}" aria-label="第 ${i+1} 块知识点">${esc(b.points.join('\n'))}</textarea></div>`).join('')}</div><div id="modal-error" class="error-message"></div><div class="modal-actions"><button type="submit" class="primary">保存分块</button></div></form>`);
}
function readOutline(){outlineDraft.forEach((b,i)=>{b.title=$(`[name="title-${i}"]`).value;b.points=$(`[name="points-${i}"]`).value.split('\n').map(x=>x.trim()).filter(Boolean);});}
function showMethod(){
  const editable=S.course.status==='planning';
  modalContent('学习方式',`<form id="method-form"><label class="field"><span class="field-label">讲解偏好</span><textarea name="method" rows="6" ${!editable?'readonly':''}>${esc(S.course.method)}</textarea></label>${!editable?'<p class="small muted">学习方式仅可在课程开始前修改。</p>':''}<div id="modal-error" class="error-message"></div><div class="modal-actions">${editable?'<button type="submit" class="primary">保存学习方式</button>':'<button type="button" class="outline-button" data-action="close-modal">知道了</button>'}</div></form>`);
}
function showMobileProgress(){modalContent('学习进度',`<div class="roadmap">${S.course.blocks.map((b,i)=>`<div class="road-step ${S.course.completed.includes(b.id)?'done':''}"><span class="step-dot">${S.course.completed.includes(b.id)?icon('check'):i+1}</span><button class="step-title" data-action="block" data-id="${b.id}">${esc(b.title)}</button></div>`).join('')}</div>`);}

function closeDrawer(){if(S.threadBusy)return;document.body.classList.remove('discussion-open');$('#drawer-root').innerHTML='';S.thread=null;S.pendingQuote='';threadQuestionDraft='';if(S.view==='note'&&!S.editing)render();}
function openDiscussion(quote='',thread=null){
  if(S.threadBusy)return;document.body.classList.add('discussion-open');
  S.pendingQuote=quote;S.thread=thread;threadQuestionDraft='';$('#selection-tools').hidden=true;window.getSelection()?.removeAllRanges();renderDrawer();setTimeout(()=>$('#thread-question')?.focus(),50);
}
function renderDrawer(){
  const thread=S.thread,history=thread?.messages || [];
  const context=S.course.blocks.find(b=>b.id===(thread?.block_id||S.selectedNoteBlock||S.course.active));
  $('#drawer-root').innerHTML=`<div class="drawer-backdrop" data-action="close-drawer"></div><section class="discussion-drawer" aria-label="知识点旁注"><header class="drawer-heading"><span>${icon('message-square')}${S.view==='note'?'学习旁注':'追问'}</span><button class="icon-button" data-action="close-drawer" aria-label="关闭旁注" ${S.threadBusy?'disabled':''}>${icon('x')}</button></header><div class="drawer-context"><span>关联内容</span><strong>${esc(context?.title||S.course.title)}</strong></div><div class="drawer-content">${(thread?.quote||S.pendingQuote)?`<div class="quote-box">${esc(thread?.quote||S.pendingQuote)}</div>`:''}${thread?.summary?`<div class="annotation-summary">${md(thread.summary)}</div><details class="history-details"><summary>完整讨论</summary>`:''}${history.map(m=>m.role==='user'?`<div class="thread-message user">${esc(m.content)}</div>`:`<div class="thread-message assistant"><div class="thread-role">${icon('sparkles')}AI 讲解</div><div class="markdown">${md(m.content)}</div></div>`).join('')}${thread?.summary?'</details>':''}${!history.length&&!S.pendingQuote?'<div class="thread-empty">围绕这个学习块提问，讨论会保存在这里。</div>':''}${S.threadBusy?`<div class="loading-answer">${icon('loader-circle')}正在回答…</div>`:''}<div id="thread-error" class="error-message" role="alert"></div></div><div class="drawer-composer"><form class="composer" id="thread-form"><textarea id="thread-question" name="question" aria-label="继续追问" placeholder="${history.length?'继续提问…':'输入你的问题…'}" ${S.threadBusy?'disabled':''}>${esc(threadQuestionDraft)}</textarea><button class="send-button" aria-label="发送追问" ${S.threadBusy?'disabled':''}>${icon('arrow-up')}</button></form><div class="composer-caption"><span>${S.course.demo&&!S.settings.connected?'离线演示':''}</span></div></div></section>`;
  icons();$('.loading-answer svg')?.classList.add('spin');$('.drawer-content').scrollTop=100000;
}
async function sendQuestion(question,mode){
  if(S.threadBusy||!question.trim())return;
  const bid=S.thread?.block_id || S.selectedNoteBlock || S.course.active;
  const request={block_id:bid,question,mode,quote:S.pendingQuote,thread_id:S.thread?.id,note_id:S.view==='note'?S.note?.id:undefined};
  threadQuestionDraft=question;S.threadBusy=true;renderDrawer();
  try{S.thread=await api(courseUrl('chat'),request);threadQuestionDraft='';if(S.note){const n=await api(`/api/courses/${S.course.id}/notes/${S.note.id}`);S.note=n;}}
  catch(e){S.threadBusy=false;renderDrawer();$('#thread-error').textContent=e.message;$('#thread-question').focus();return;}
  S.threadBusy=false;renderDrawer();$('#thread-question')?.focus();
}
async function openThread(id){let threads=S.note?.discussions;if(!threads?.some(t=>t.id===id))threads=await api(courseUrl('discussions'));const t=threads.find(t=>t.id===id);if(t)openDiscussion(t.quote,t);}
const markColors={yellow:'黄色',green:'绿色',blue:'蓝色',pink:'粉色',purple:'紫色'};
let selectionAnchor=null;
function markRoot(){return S.view==='learn'?$('#lesson-body'):S.view==='note'?$('#note-body'):null;}
function textMap(root,legacy=false){
  const nodes=[];let text='';const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>!n.textContent||n.parentElement.closest(legacy?'.katex,.annotation-badge,button':'.katex-mathml,.annotation-badge,button,svg')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
  let n;while((n=walker.nextNode())){nodes.push({node:n,start:text.length,end:text.length+n.textContent.length});text+=n.textContent;}
  return {nodes,text};
}
function locateMark(text,mark){
  if(Number.isInteger(mark.start)&&text.slice(mark.start,mark.start+mark.quote.length)===mark.quote&&(!mark.before||text.slice(Math.max(0,mark.start-mark.before.length),mark.start)===mark.before)&&(!mark.after||text.slice(mark.start+mark.quote.length,mark.start+mark.quote.length+mark.after.length)===mark.after))return mark.start;
  const hits=[];let at=text.indexOf(mark.quote);while(at>=0){hits.push(at);at=text.indexOf(mark.quote,at+1);}
  const matched=hits.filter(i=>(!mark.before||text.slice(Math.max(0,i-mark.before.length),i)===mark.before)&&(!mark.after||text.slice(i+mark.quote.length,i+mark.quote.length+mark.after.length)===mark.after));
  return matched.length===1?matched[0]:hits.length===1?hits[0]:-1;
}
// Resolve older text-only anchors into today's visible text, including intervening math.
function markBounds(root,mark,map){
  const source=mark.anchor_version===2?map:textMap(root,true),start=locateMark(source.text,mark);
  if(start<0)return null;
  const end=start+mark.quote.length;
  if(mark.anchor_version===2)return {start,end};
  const first=source.nodes.find(n=>n.end>start),last=source.nodes.find(n=>n.end>=end);
  if(!first||!last)return null;
  const a=map.nodes.find(n=>n.node===first.node),b=map.nodes.find(n=>n.node===last.node);
  return a&&b?{start:a.start+start-first.start,end:b.start+end-last.start}:null;
}
function applyMarks(){
  const root=markRoot(),target=S.view==='learn'?S.course?.active:S.note?.id;if(!root||!target||S.editing)return;
  for(const mark of S.course.highlights||[]){
    if(mark.target!==target)continue;const map=textMap(root),bounds=markBounds(root,mark,map);if(!bounds)continue;const {start,end}=bounds;
    for(const item of map.nodes.filter(n=>n.end>start&&n.start<end).reverse()){
      const range=document.createRange();range.setStart(item.node,Math.max(0,start-item.start));range.setEnd(item.node,Math.min(item.node.length,end-item.start));
      const span=document.createElement('span');span.className=mark.style==='underline'?'study-underline underline-'+(mark.color||'black'):mark.style==='strike'?'study-strike':mark.style==='comment'?'study-comment':'study-mark color-'+(markColors[mark.color]?mark.color:'yellow');span.dataset.markId=mark.id;if(mark.style==='comment'){span.dataset.action='read-comment';span.dataset.id=mark.id;span.title=mark.comment;span.setAttribute('role','button');span.tabIndex=0;}range.surroundContents(span);
    }
  }
}
function captureAnchor(range,root){
  const map=textMap(root),selected=map.nodes.filter(n=>range.intersectsNode(n.node));if(!selected.length)return null;
  const first=selected[0],last=selected[selected.length-1];let start=first.start+(range.startContainer===first.node?range.startOffset:0),end=last.start+(range.endContainer===last.node?range.endOffset:last.node.length);
  const raw=map.text.slice(start,end),left=raw.length-raw.trimStart().length;start+=left;end=start+raw.trim().length;
  if(end<=start)return null;
  return {anchor_version:2,start,quote:map.text.slice(start,end),before:map.text.slice(Math.max(0,start-32),start),after:map.text.slice(end,end+32)};
}
async function addMark(style,color='yellow'){
  if(!selectionAnchor){toast('请先选中文字。');return;}
  const target=S.view==='learn'?S.course.active:S.note.id;
  const root=markRoot(),map=textMap(root);
  const remove_ids=(S.course.highlights||[]).filter(m=>{
    if(m.target!==target)return false;
    const bounds=markBounds(root,m,map);
    return bounds&&bounds.start<selectionAnchor.start+selectionAnchor.quote.length&&selectionAnchor.start<bounds.end;
  }).map(m=>m.id);
  const c=await api(courseUrl('highlight'),{target,...selectionAnchor,style,color,remove_ids});
  updateCourse(c);selectionAnchor=null;$('#selection-tools').hidden=true;window.getSelection()?.removeAllRanges();render();
}
let underlineColor='black',readingColor='yellow',readingSize=16,readingFindIndex=-1,readingComment=null;
function readingToolbar(){return `<div class="reading-toolbar" role="toolbar" aria-label="阅读工具"><div class="reading-tool-group"><button data-action="highlight" data-requires-selection title="高亮" aria-label="高亮" disabled>${icon('highlighter')}<span class="tool-color color-${readingColor}"></span></button><div class="reading-palette">${Object.entries(markColors).map(([key,label])=>`<button class="color-swatch color-${key} ${readingColor===key?'chosen':''}" data-action="choose-highlight" data-color="${key}" title="${label}高亮" aria-label="${label}高亮"></button>`).join('')}</div></div><div class="reading-tool-group"><button data-action="underline" data-requires-selection title="下划线" aria-label="下划线" disabled>${icon('underline')}</button>${Object.entries({black:'黑色',blue:'蓝色',red:'红色'}).map(([key,label])=>`<button class="ink-swatch ink-${key} ${underlineColor===key?'chosen':''}" data-action="choose-underline" data-color="${key}" title="${label}下划线" aria-label="${label}下划线"></button>`).join('')}<button data-action="strike" data-requires-selection title="删除线" aria-label="删除线" disabled>${icon('strikethrough')}</button><button data-action="clear-mark" data-requires-selection title="清除标记" aria-label="清除标记" disabled>${icon('eraser')}</button></div><div class="reading-tool-group"><button data-action="reading-comment" data-requires-selection disabled>${icon('message-square')}批注</button><button data-action="pronounce" data-requires-selection disabled>${icon('volume-2')}发音</button><button data-action="translate" data-requires-selection disabled>${icon('languages')}翻译</button><button data-action="ask-selection" data-requires-selection disabled>${icon('message-circle')}追问</button></div><div class="reading-tool-group reading-display"><button data-action="reading-find" title="查找正文 · ⌘F" aria-label="查找正文">${icon('search')}</button><button data-action="reading-smaller" title="缩小字号" aria-label="缩小字号">A−</button><button data-action="reading-larger" title="放大字号" aria-label="放大字号">A＋</button></div><div class="reading-find" hidden><input id="reading-find-input" aria-label="查找正文内容" placeholder="查找正文"><span id="reading-find-count"></span><button data-action="reading-find-prev" aria-label="上一个结果">${icon('chevron-up')}</button><button data-action="reading-find-next" aria-label="下一个结果">${icon('chevron-down')}</button><button data-action="reading-find-close" aria-label="关闭查找">${icon('x')}</button></div></div>`;}
function syncReadingTools(){ $$('.reading-toolbar [data-requires-selection]').forEach(b=>b.disabled=!selectionAnchor&&!(b.dataset.action==='pronounce'&&window.speechSynthesis?.speaking)); }
function showReadingComment(mark){
  readingComment=mark?{...mark}:{...selectionAnchor,target:S.view==='learn'?S.course.active:S.note.id};if(!readingComment.quote)return;
  modalContent('批注',`<form id="reading-comment-form"><blockquote class="comment-quote">${esc(readingComment.quote)}</blockquote><label class="field"><textarea name="comment" aria-label="批注内容" maxlength="2000" required placeholder="写下你的理解或疑问…">${esc(mark?.comment||'')}</textarea></label><div id="modal-error" class="error-message"></div><div class="modal-actions">${mark?'<button class="text-button" type="button" data-action="remove-reading-comment">删除批注</button>':''}<button class="primary" type="submit">保存</button></div></form>`);
}
function findReading(direction=1){
 const input=$('#reading-find-input'),root=markRoot();if(!input||!root)return;const query=input.value.trim(),map=textMap(root),hits=[];
 if(query){let at=map.text.toLowerCase().indexOf(query.toLowerCase());while(at>=0){hits.push(at);at=map.text.toLowerCase().indexOf(query.toLowerCase(),at+Math.max(1,query.length));}}
 readingFindIndex=hits.length?(readingFindIndex+direction+hits.length)%hits.length:-1;$('#reading-find-count').textContent=hits.length?`${readingFindIndex+1} / ${hits.length}`:'无结果';if(!hits.length)return;
 const start=hits[readingFindIndex],end=start+query.length,first=map.nodes.find(n=>n.end>start),last=map.nodes.find(n=>n.end>=end);const range=document.createRange();range.setStart(first.node,start-first.start);range.setEnd(last.node,end-last.start);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);first.node.parentElement.scrollIntoView({block:'center',behavior:'smooth'});
}
function pronounceSelection(){
 const text=savedSelection?.trim();if(!text){toast('请先选中英文单词或短句。');return;}if(text.length>200){toast('发音请选取 200 字以内的单词或短句。');return;}
 if(!('speechSynthesis' in window)){toast('当前浏览器不支持系统朗读。');return;}
 if(window.speechSynthesis.speaking){window.speechSynthesis.cancel();return;}
 window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang='en-US';utterance.rate=.85;
 const voices=window.speechSynthesis.getVoices().filter(v=>/^en[-_]/i.test(v.lang));utterance.voice=voices.find(v=>v.localService)||voices[0]||null;
 const speechButtons=()=>$$('[data-action="pronounce"]');const reset=()=>speechButtons().forEach(b=>{b.innerHTML=icon('volume-2')+'发音';icons();});
 utterance.onstart=()=>{speechButtons().forEach(b=>b.innerHTML=icon('square')+'停止发音');icons();};utterance.onend=reset;
 utterance.onerror=event=>{reset();if(!['interrupted','canceled'].includes(event.error))toast('语音暂不可用，请检查系统英文语音。');};window.speechSynthesis.speak(utterance);
}

function selectionToolbar(){return `<div class="mark-palette" aria-label="高亮颜色">${Object.entries(markColors).map(([key,label])=>`<button class="color-swatch color-${key}" data-action="highlight" data-color="${key}" title="${label}高亮" aria-label="${label}高亮"></button>`).join('')}</div><button data-action="underline" title="下划线">${icon('underline')}</button><button data-action="clear-mark" title="清除所选文字的标记" aria-label="清除标记">${icon('eraser')}</button><button data-action="ask-selection">${icon('message-circle')}追问</button><button data-action="translate">${icon('languages')}翻译</button><button data-action="pronounce">${icon('volume-2')}发音</button>`;}

document.addEventListener('mousedown',e=>{if(e.target.closest('#selection-tools,.reading-toolbar button'))e.preventDefault();});
document.addEventListener('click',async e=>{
  if(!e.target.closest('.account-menu,.profile-button'))closeAccountMenu();
  const button=e.target.closest('[data-action]');if(!button||button.disabled)return;
  const action=button.dataset.action;
  if(['browser-return','browser-search','import','workspace','library','course-notes','overview','course','start','block','note','read-note','reload-note'].includes(action))pendingNavigation=()=>button.click();
  if(S.editing&&S.dirty&&['browser-return','browser-search','import','workspace','library','course-notes','overview','course','start','block','note'].includes(action)&&!(await saveEditingNote()))return;
  try{
    if(action==='import'){if(canLeave())showImport();}
    else if(action==='settings')await showSettings();
    else if(action==='onboarding'){closeAccountMenu();await window.StudyOnboarding?.open();}
    else if(action==='account-menu')showAccountMenu();
    else if(action==='account-profile'){accountTab='profile';renderAccount();}
    else if(action==='account-ai'){accountTab='ai';aiEdit=null;renderAccount();}
    else if(action==='ai-add')openAIEditor();
    else if(action==='ai-edit')openAIEditor(button.dataset.id);
    else if(action==='ai-editor-tab'){captureAI();aiEdit.tab=button.dataset.tab;renderAccount();}
    else if(action==='ai-back'){aiEdit=null;renderAccount();}
    else if(action==='ai-toggle-key'){const input=$('[name=key]');input.type=input.type==='password'?'text':'password';}
    else if(action==='ai-fetch-models'){
      const payload=aiPayload();await aiOperation('正在获取模型…',async()=>{const result=await api('/api/ai/models',payload);const existing=new Map(aiEdit.models.map(m=>[m.id,m]));for(const id of result.models){if(!existing.has(id))existing.set(id,{id,name:result.model_names[id]||id,enabled:false});}aiEdit.models=[...existing.values()];renderAccount();$('#modal-error').textContent='已获取模型，请勾选需要使用的模型。';});
    }
    else if(action==='ai-manual-add'){
      captureAI();const id=$('#ai-manual-model').value.trim();if(!id||id.length>200)throw new Error('请输入有效的模型 ID。');const old=aiEdit.models.find(m=>m.id===id);if(old)old.enabled=true;else aiEdit.models.push({id,name:id,enabled:true});if(!aiEdit.model)aiEdit.model=id;renderAccount();
    }
    else if(action==='ai-test'){const payload=aiPayload();await aiOperation('正在测试连接…',async()=>{await api('/api/ai/test',payload);$('#modal-error').textContent='连接成功。保存后即可使用。';});}
    else if(action==='ai-disconnect'||action==='ai-remove'){
      const id=aiEdit.id;await aiOperation('正在更新…',async()=>{const result=await api(action==='ai-remove'?'/api/ai/remove':'/api/ai/disconnect',{id});aiEdit=null;await updateAIState(result);renderAccount();});
    }
    else if(action==='profile')await showSettings('profile');
    else if(action==='close-modal'){if(!modal.dataset.working){if(modal.classList.contains('ai-service-dialog')){aiEdit=null;renderAccount();}else modal.close();}}
    else if(action==='discard-draft'){clearTimeout(saveTimer);S.dirty=false;S.editing=false;modal.close();const next=pendingNavigation;pendingNavigation=null;next?.();}
    else if(action==='workspace'||action==='browser-return'){await returnToBrowser();}
    else if(action==='browser-search'){await returnToBrowser();$('#note-search')?.focus();}
    else if(action==='navigation-toggle'){toggleNavigation(button.dataset.id);}
    else if(action==='navigation-path'){B.paths[S.libraryCourse]=(B.paths[S.libraryCourse]||[]).slice(0,Number(button.dataset.depth));saveBrowser();render();}
    else if(action==='navigation-group'){const d=Number(button.dataset.depth);B.paths[S.libraryCourse]=[...(B.paths[S.libraryCourse]||[]).slice(0,d),button.dataset.value];saveBrowser();render();}
    else if(action==='academic-week'){B.week=button.dataset.value;B.scroll={};saveBrowser();render();}
    else if(action==='academic-clear-search'){S.search='';B.searchScope='semester';render();$('#note-search')?.focus();}
    else if(action==='academic-search-all'){B.searchScope='all';render();}
    else if(action==='academic-search-file'){revealAcademicResource(button.dataset.id);}
    else if(action==='academic-search-course'){const id=button.dataset.id,a=courseAcademic(id);B.stage=a?.stage||'unassigned';if(a){B.year=a.year;B.semester=a.semester;}B.week='all';S.search='';S.libraryCourse=id;saveBrowser();render();}
    else if(action==='browser-select'){B.files[S.libraryCourse]=button.dataset.id;saveBrowser();render();}
    else if(action==='browser-set-term'){showBrowserTerm();}
    else if(action==='library'){if(canLeave()&&!S.busy){await openLibrary();}}
    else if(action==='course-notes'){if(canLeave()&&!S.busy){await openLibrary(S.course.id);}}
    else if(action==='library-view'){saveLibraryGrouping(button.dataset.id==='none'?[]:[button.dataset.id]);if(modal.open)showBrowserOrganization();}
    else if(action==='remove-refinement'){const levels=libraryGrouping();levels.splice(Number(button.dataset.index),1);saveLibraryGrouping(levels);if(modal.open)showBrowserOrganization();}
    else if(action==='library-open-course'){if(canLeave()&&!S.busy)await openLibrary(button.dataset.id);}
    else if(action==='library-kind'){S.libraryKind=button.dataset.id;render();}
    else if(action==='resource-import'){showResourceImport();}
    else if(action==='recognize-pasted'){await recognizePasted();}
    else if(action==='resource-classify'){showResourceClassification(button.dataset.id);}
    else if(action==='related-resource'){if($('#resource-metadata-form')?.dataset.changed){toast('请先保存修改，再打开关联资料。');return;}modal.close();await openResource(button.dataset.id);}
    else if(action==='resource-open'){await openResource(button.dataset.id);}
    else if(action==='filter-course'){S.libraryCourse=button.dataset.id;render();}
    else if(action==='course')await loadCourse(button.dataset.id);
    else if(action==='overview'){if(canLeave()&&!S.busy){closeDrawer();S.view='overview';S.note=null;render();resetScroll();}}
    else if(action==='start'){const c=S.course;const b=nextLearningBlock(c);await openBlock(b.id);}
    else if(action==='block'){if(modal.open)modal.close();await openBlock(button.dataset.id);}
    else if(action==='edit-outline')showOutline();
    else if(action==='method')showMethod();
    else if(action==='mobile-progress')showMobileProgress();
    else if(action==='move-up'||action==='move-down'){readOutline();const i=+button.dataset.index,j=i+(action==='move-up'?-1:1);[outlineDraft[i],outlineDraft[j]]=[outlineDraft[j],outlineDraft[i]];renderOutline();}
    else if(action==='source'){if(S.demonstration){const r=S.resources.find(r=>r.course_id===S.course.id&&r.kind==='originals'&&r.week===3);if(r)await openResource(r.id);}else window.open(courseUrl('source'),'_blank','noopener');}
    else if(action==='complete'){await completeStudyBlock();}
    else if(action==='resume-study'){await openBlock(nextLearningBlock(S.course).id);}
    else if(action==='continue-study'){await continueStudy();}
    else if(action==='clear-study-quote'){S.studyQuote='';S.studyQuoteBlock='';render();}
    else if(action==='toggle-status'){B.statusVisible=!B.statusVisible;render();}
    else if(action==='finish'){if(!S.threadBusy){closeDrawer();showFinish();}}
    else if(action==='note')await openNote(button.dataset.course,button.dataset.id);
    else if(action==='edit-note'){beginEditing();}
    else if(action==='read-note'){await finishEditing();}
    else if(action==='save-note'){await saveEditingNote();}
    else if(action==='retry-save'){saveBlocked=false;await saveEditingNote();}
    else if(action==='editor-mode'){editorSource=!editorSource;noteEditor?.setSource(editorSource);button.innerHTML=(editorSource?'源码':'实时预览')+' '+icon('chevrons-up-down');icons();}
    else if(action==='copy-draft'){await navigator.clipboard.writeText(S.editDraft);toast('已复制你的编辑。');}
    else if(action==='reload-note'){if(canLeave()){S.note=await api(`/api/courses/${S.course.id}/notes/${S.note.id}`);render();}}
    else if(action==='export'){
      const blob=new Blob([S.note.content],{type:'text/markdown;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=S.note.title.replace(/[\\/:*?"<>|]/g,'-')+'.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    else if(action==='ask-selection'){if(S.view==='learn'){S.studyQuote=savedSelection;S.studyQuoteBlock=S.selectedNoteBlock||S.course.active;$('#selection-tools').hidden=true;window.getSelection()?.removeAllRanges();render();$('#main-question textarea')?.focus();}else openDiscussion(savedSelection);}
    else if(action==='translate'){if(!(S.settings.translation_connected??S.settings.connected)){toast('连接 AI 后即可翻译选中的单词或句子。');await showSettings();return;}if(S.view==='learn'){S.studyQuote=savedSelection;S.studyQuoteBlock=S.selectedNoteBlock||S.course.active;$('#selection-tools').hidden=true;window.getSelection()?.removeAllRanges();await sendStudyQuestion('请结合上下文翻译选中的单词或句子；如果是英文单词，请给出词性、中文释义和本句中的含义。','translation');}else{openDiscussion(savedSelection);await sendQuestion('请结合上下文翻译选中的单词或句子；如果是英文单词，请给出词性、中文释义和本句中的含义。','translation');}}
    else if(action==='highlight'||action==='underline'||action==='strike')await addMark(action,button.dataset.color||(action==='highlight'?readingColor:underlineColor));
    else if(action==='choose-highlight'||action==='choose-underline'){
      const isHighlight=action==='choose-highlight';if(isHighlight)readingColor=button.dataset.color;else underlineColor=button.dataset.color;
      if(selectionAnchor)await addMark(isHighlight?'highlight':'underline',button.dataset.color);
      else {if(isHighlight&&$('.tool-color'))$('.tool-color').className='tool-color color-'+readingColor;$$('.'+(isHighlight?'color-swatch':'ink-swatch'),$('.reading-toolbar')).forEach(b=>b.classList.toggle('chosen',b.dataset.color===button.dataset.color));}
    }
    else if(action==='reading-comment'){showReadingComment();}
    else if(action==='read-comment'){if(window.getSelection()?.toString())return;showReadingComment(S.course.highlights.find(m=>m.id===button.dataset.id));}
    else if(action==='remove-reading-comment'){updateCourse(await api(courseUrl('highlight'),{...readingComment,style:'remove',remove_ids:[readingComment.id]}));modal.close();render();}
    else if(action==='pronounce'){pronounceSelection();}
    else if(action==='reading-find'){$('.reading-find').hidden=false;$('#reading-find-input').focus();}
    else if(action==='reading-find-close'){$('.reading-find').hidden=true;}
    else if(action==='reading-find-next'||action==='reading-find-prev'){findReading(action==='reading-find-next'?1:-1);}
    else if(action==='reading-smaller'||action==='reading-larger'){readingSize=Math.min(24,Math.max(14,readingSize+(action==='reading-larger'?1:-1)));$('#note-body').style.setProperty('--reading-size',readingSize+'px');}

    else if(action==='clear-mark')await addMark('clear');
    else if(action==='close-drawer')closeDrawer();
    else if(action==='open-thread')await openThread(button.dataset.id);
    else if(action==='note-threads')showNoteThreads();
    else if(action==='lesson-threads'){
      const list=(await api(courseUrl('discussions'))).filter(t=>t.block_id===S.course.active);
      modalContent('本块讨论',list.length?list.map(t=>`<button class="note-annotation-link" data-action="pick-thread" data-id="${t.id}">${esc(t.title)}</button>`).join(''):'<p class="modal-description">还没有讨论。选中正文，或在下方说出你的疑问。</p>');
    }
    else if(action==='block-annotations'){
      const list=S.note.discussions.filter(t=>t.block_id===button.dataset.id);
      if(list.length===1)openDiscussion(list[0].quote,list[0]);
      else modalContent('这个知识点的旁注',list.map(t=>`<button class="note-annotation-link" data-action="pick-thread" data-id="${t.id}">${esc(t.title)}</button>`).join(''));
    }
    else if(action==='pick-thread'){modal.close();await openThread(button.dataset.id);}
    else if(action==='demo'){modal.close();await task('正在准备示例…',async()=>{updateCourse(await api('/api/demo',{}));S.libraryCourse=S.course.id;B.statusVisible=true;saveBrowser();S.conversation=[];S.studyDraft='';S.view='overview';});resetScroll();}
    else if(action==='disconnect'){S.settings=await api('/api/settings',{...S.settings,clear_key:true});showSettings();render();toast('已清除内存中的 API Key。');}
  }catch(error){if(modal.open&&$('#modal-error'))$('#modal-error').textContent=error.message;else toast(error.message);}
});

document.addEventListener('submit',async e=>{if(e.target.id!=='academic-course-form')return;e.preventDefault();try{await assignAcademic(S.libraryCourse,Object.fromEntries(new FormData(e.target)));modal.close();render();}catch(error){toast(error.message);}});
document.addEventListener('dblclick',e=>{const b=e.target.closest('[data-action="browser-select"]');if(b)openResource(b.dataset.id).catch(error=>toast(error.message));});
document.addEventListener('submit',async e=>{
  const form=e.target;if(form.getAttribute('id')==='academic-course-form')return;e.preventDefault();const data=Object.fromEntries(new FormData(form));
  if(form.getAttribute('id')==='main-question'){await sendStudyQuestion(data.question);return;}
  if(form.getAttribute('id')==='thread-form'){await sendQuestion(data.question);return;}
  if(form.getAttribute('id')==='ai-service-form'){if(aiEdit.tab!=='models'){await advanceAI();return;}const payload=aiPayload();await aiOperation('正在连接…',async()=>{const result=await api('/api/ai/save',payload);aiEdit=null;await updateAIState(result);renderAccount();toast('AI 服务已连接');});return;}
  const submit=$('button[type="submit"]',form);if(!submit||submit.disabled)return;
  const original=submit.innerHTML;submit.disabled=true;modal.dataset.working='1';$$('button[data-action="close-modal"]',modal).forEach(b=>b.disabled=true);
  const errorBox=$('#modal-error');if(errorBox){errorBox.textContent='';errorBox.className='error-message';}
  try{
    if(form.getAttribute('id')==='reading-comment-form'){updateCourse(await api(courseUrl('highlight'),{...readingComment,style:'comment',comment:data.comment}));modal.close();selectionAnchor=null;render();}
    else if(form.getAttribute('id')==='profile-form'){
      await saveProfile(form,data);
    }else if(form.getAttribute('id')==='resource-upload-form'){
      await submitResourceUpload(form,data);
    }else if(form.getAttribute('id')==='resource-metadata-form'){
      const result=await api('/api/library/metadata',data);S.resources=result.items;modal.close();revealAcademicResource(data.id);toast('已保存');
    }else if(form.getAttribute('id')==='import-form'){
      if(!currentFile&&!data.text.trim())throw new Error('请选择课件或粘贴学习内容。');
      submit.textContent='正在分析课件…';
      if(currentFile){data.filename=currentFile.name;data.file=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=()=>reject(new Error('读取文件失败。'));r.readAsDataURL(currentFile);});}else data.filename='学习资料.md';
      const c=await api('/api/import',data);S.conversation=[];S.studyDraft='';S.studyQuote='';S.studyError='';if($('#main-question textarea'))$('#main-question textarea').value='';updateCourse(c);S.libraryCourse=c.id;await assignAcademic(c.id,data);B.statusVisible=true;saveBrowser();S.view='overview';S.note=null;modal.close();render();resetScroll();toast('学习分块已生成');
    }else if(form.getAttribute('id')==='settings-form'){
      submit.textContent='正在测试连接…';S.settings=await api('/api/settings',data);await api('/api/test',{});S.settings.connected=true;modal.close();render();toast('模型已连接');
    }else if(form.getAttribute('id')==='finish-form'){
      submit.textContent='正在整理笔记与旁注…';const result=await api(courseUrl('finish'),data);updateCourse(result.course);S.note=result.note;S.view='note';S.editing=false;modal.close();render();resetScroll();toast('笔记已保存');
    }else if(form.getAttribute('id')==='outline-form'){
      readOutline();updateCourse(await api(courseUrl('outline'),{blocks:outlineDraft}));modal.close();render();
    }else if(form.getAttribute('id')==='method-form'){
      updateCourse(await api(courseUrl('outline'),{blocks:S.course.blocks,method:data.method}));modal.close();render();toast('学习方式已更新。');
    }
  }catch(error){if(errorBox)errorBox.textContent=error.message;else toast(error.message);if(form.getAttribute('id')==='settings-form')render();}
  finally{delete modal.dataset.working;submit.disabled=false;submit.innerHTML=original;$$('button[data-action="close-modal"]',modal).forEach(b=>b.disabled=false);icons();}
});
document.addEventListener('change',async e=>{if(e.target.closest('#resource-metadata-form'))e.target.closest('form').dataset.changed='1';
  if(e.target.id==='ai-provider'){
    captureAI();const p=accountAI.providers[aiEdit.provider];Object.assign(aiEdit,{name:p.name,base:p.base,key:'',has_key:false,models:[],model:''});renderAccount();
  }
  if(e.target.matches('[data-model-index]')){
    captureAI();aiEdit.models[Number(e.target.dataset.modelIndex)].enabled=e.target.checked;if(!aiEdit.models.some(m=>m.enabled&&m.id===aiEdit.model))aiEdit.model=aiEdit.models.find(m=>m.enabled)?.id||'';renderAccount();
  }
  if(['ai-learning-default','ai-translation-default'].includes(e.target.id)){
    const scope=e.target.id==='ai-learning-default'?'learning':'translation',value=e.target.value,cut=value.indexOf('|');
    await aiOperation('正在验证默认模型…',async()=>{try{const result=await api('/api/ai/default',{scope,id:cut<0?'':value.slice(0,cut),model:cut<0?'':value.slice(cut+1)});await updateAIState(result);renderAccount();}catch(error){renderAccount();throw error;}});
  }
  if(e.target.id==='course-file')chooseFile(e.target.files[0]);
  if(e.target.matches('#resource-upload-form input[name=attachment]'))await recognizeUpload(e.target.files[0]);
  if(e.target.closest('#resource-upload-form .import-metadata')&&e.isTrusted)e.target.dataset.userEdited='1';
  if(e.target.id==='add-refinement'&&e.target.value){saveLibraryGrouping([...libraryGrouping(),e.target.value]);showBrowserOrganization();}
  if(['academic-stage','academic-year','academic-semester'].includes(e.target.id)){const key=e.target.id.slice(9);B[key]=key==='stage'?e.target.value:Number(e.target.value);if(key==='stage'){const available=S.courses.map(c=>courseAcademic(c.id)).filter(a=>a?.stage===B.stage).sort((a,b)=>b.year-a.year||a.semester-b.semester);if(available.length){B.year=available[0].year;B.semester=available[0].semester;}}B.week='all';S.libraryCourse='';S.search='';B.scroll={};saveBrowser();render();}
  if(e.target.id==='academic-file-group'){B.fileGroup=e.target.value;saveBrowser();render();}
  if(e.target.id==='academic-search-scope'){B.searchScope=e.target.value;render();}
  if(e.target.id==='library-filter'){S.libraryFilter=e.target.value;render();}
  if(e.target.id==='library-course'){S.libraryCourse=e.target.value;render();}
  if(e.target.id==='note-sort'){S.sort=e.target.value;saveBrowser();render();}
});
document.addEventListener('input',e=>{if(e.target.closest('#resource-metadata-form'))e.target.closest('form').dataset.changed='1';
  if(e.target.closest('#resource-upload-form .import-metadata')&&e.isTrusted)e.target.dataset.userEdited='1';
  if(e.target.id==='reading-find-input'){readingFindIndex=-1;findReading();}
  if(e.target.matches('#main-question textarea'))S.studyDraft=e.target.value;
  if(e.target.id==='thread-question')threadQuestionDraft=e.target.value;
  if(e.target.id==='note-search'){if(!S.search)B.searchScope='semester';S.search=e.target.value;const start=e.target.selectionStart;render();$('#note-search').focus();$('#note-search').setSelectionRange(start,start);}
});
document.addEventListener('keydown',e=>{
  if(window.StudyOnboarding?.isOpen())return;
  if(e.target.id==='note-search'&&e.key==='Escape'){e.preventDefault();S.search='';B.searchScope='semester';render();return;}
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();(async()=>{if(S.editing&&S.dirty&&!(await saveEditingNote()))return;await returnToBrowser();$('#note-search')?.focus();})().catch(error=>toast(error.message));return;}
  if(e.key==='Escape'&&modal.open&&modal.classList.contains('ai-service-dialog')){e.preventDefault();if(!modal.dataset.working){aiEdit=null;renderAccount();}return;}
  if((e.metaKey||e.ctrlKey)&&S.view==='note'&&e.key.toLowerCase()==='s'){e.preventDefault();saveEditingNote();}
  if((e.metaKey||e.ctrlKey)&&S.view==='note'&&e.key.toLowerCase()==='e'){e.preventDefault();S.editing?finishEditing():beginEditing();}
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='f'&&S.view==='note'&&!S.editing){e.preventDefault();$('.reading-find').hidden=false;$('#reading-find-input').focus();}
  if(e.target.id==='reading-find-input'&&e.key==='Enter'){e.preventDefault();findReading(e.shiftKey?-1:1);}
  if(e.target.matches('.study-comment')&&['Enter',' '].includes(e.key)){e.preventDefault();window.getSelection()?.removeAllRanges();e.target.click();}
  if(e.key==='Escape'){closeAccountMenu();closeDrawer();$('#selection-tools').hidden=true;window.speechSynthesis?.cancel();if($('.reading-find'))$('.reading-find').hidden=true;}
  if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.target.matches('#main-question textarea,#thread-question')){e.preventDefault();e.target.closest('form').requestSubmit();}
});
modal.addEventListener('cancel',e=>{if(modal.dataset.working)e.preventDefault();else if(modal.classList.contains('ai-service-dialog')){e.preventDefault();aiEdit=null;renderAccount();}});
function updateSelectionTools(e){
  if(e?.target?.closest?.('#selection-tools,.reading-toolbar'))return;
  setTimeout(()=>{
    const sel=window.getSelection(),text=sel?.toString().trim(),range=sel?.rangeCount?sel.getRangeAt(0):null;
    const parent=range?.commonAncestorContainer.nodeType===Node.TEXT_NODE?range.commonAncestorContainer.parentElement:range?.commonAncestorContainer;
    if(!text||!markRoot()?.contains(parent)||!parent?.closest('[data-selectable]')||S.editing||text.length>4000){$('#selection-tools').hidden=true;selectionAnchor=null;syncReadingTools();return;}
    selectionAnchor=captureAnchor(range,markRoot());if(!selectionAnchor)return;savedSelection=selectionAnchor.quote;S.selectedNoteBlock=parent.closest('[data-block]')?.dataset.block || null;
    syncReadingTools();if(S.view==='note'&&window.StudyReview?.toolsVisible()){ $('#selection-tools').hidden=true;return;}
    const rect=range.getBoundingClientRect(),toolbar=$('#selection-tools');toolbar.innerHTML=selectionToolbar();
    toolbar.hidden=false;toolbar.classList.toggle('review-selection-tools',S.view==='note');const width=toolbar.offsetWidth,height=toolbar.offsetHeight;toolbar.style.top=Math.max(8,rect.top-height-10)+'px';toolbar.style.left=Math.max(8,Math.min(window.innerWidth-width-8,rect.left+rect.width/2-width/2))+'px';icons();syncReadingTools();
  },30);
}
document.addEventListener('mouseup',updateSelectionTools);
document.addEventListener('selectionchange',updateSelectionTools);
document.addEventListener('scroll',()=>{$('#selection-tools').hidden=true;},true);
window.addEventListener('beforeunload',e=>{if(S.dirty||S.threadBusy){e.preventDefault();e.returnValue='';}});

async function refreshExternal(){
  if(!S.user||document.hidden||S.busy||S.threadBusy||modal.open||window.StudyOnboarding?.isOpen())return;
  try{
    if(S.view==='library'&&!['INPUT','SELECT'].includes(document.activeElement?.tagName)&&!document.querySelector('.academic-switcher[open],.classified-extra[open],.classified-display[open]')){const result=await api('/api/library');if(JSON.stringify(result.items)!==JSON.stringify(S.resources)){S.resources=result.items;render();}}
    if(S.view==='note'&&S.note){const latest=await api(`/api/courses/${S.course.id}/notes/${S.note.id}`);if(latest.etag!==S.note.etag){
      if(S.editing&&S.dirty){$('#edit-notice').innerHTML='<div class="inline-notice">文件已被外部工具更新。你的编辑仍保留，保存时会检查冲突。<br><button class="text-button" data-action="copy-draft">复制我的编辑</button> · <button class="text-button" data-action="reload-note">读取最新文件</button></div>';}
      else{S.note=latest;S.editDraft=latest.content;if(S.editing)prepareEditor();render();toast('已同步外部文件的更新。');}
    }}
    if(S.view==='learn'&&S.course){const latest=await api(`/api/courses/${S.course.id}/lessons/${S.course.active}`);if(latest.content!==S.lesson){S.lesson=latest.content;render();toast('已同步讲解文件的更新。');}}
  }catch{/* Keep the current document visible if the local service is temporarily unavailable. */}
}
async function init(){
  if(window.StudyDemo?.active){const data=window.StudyDemo.state();Object.assign(S,data);Object.assign(B,data.browser);restoreBrowser();S.view='library';if(B.week!=='all'&&!B.paths[S.libraryCourse])B.paths[S.libraryCourse]=[String(B.week)];S.course=S.courses.find(c=>c.id===S.libraryCourse)||S.courses[0];render();return;}
  window.speechSynthesis?.getVoices();
  try{
    const data=await api('/api/state');Object.assign(S,data);S.profile={name:S.user.name,avatar:S.user.avatar};await window.StudyTemplates?.prepare();S.course=S.courses.find(c=>c.id===localStorage.getItem('study-course-'+S.user.id))||S.courses[0];restoreBrowser();S.view='library';render();notePoll=setInterval(refreshExternal,4000);await window.StudyOnboarding?.open({automatic:true});
  }catch(e){$('#app').innerHTML=`<div class="boot"><h2>学习空间暂时没能打开</h2><p>${esc(e.message)}</p><a href="/">重新打开</a></div>`;}
}
window.StudyUnits?.install();
window.StudyNavigation?.install();
window.StudyReview?.install();
window.StudyDetails?.install();
window.StudyTemplates?.install();
window.StudyOnboarding?.install();
init();
