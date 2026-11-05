/* Calendar dates and weekly arrangements belong to a semester, never to progress. */
(function(root){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const names={calendar:'校历',timetable:'课表'},days=['周一','周二','周三','周四','周五','周六','周日'];
 function parseWeeks(value){
  if(!String(value).trim())return [];
  const values=[];
  for(const part of String(value).trim().split(/[,，、\s]+/)){
   const match=part.match(/^(\d+)(?:[-–—~至](\d+))?$/),start=Number(match?.[1]),end=Number(match?.[2]||match?.[1]);
   if(!match||start<1||end>60||start>end)throw new Error('上课周次请填写 1–60，如 1–6, 8–16；留空表示每个教学周。');
   for(let week=start;week<=end;week++)values.push(week);
  }
  return [...new Set(values)].sort((a,b)=>a-b);
 }
 function formatWeeks(values){
  const weeks=[...new Set(values||[])].sort((a,b)=>a-b),parts=[];
  for(let i=0;i<weeks.length;i++){const start=weeks[i];let end=start;while(weeks[i+1]===end+1)end=weeks[++i];parts.push(start===end?String(start):`${start}–${end}`);}
  return parts.join(', ');
 }
 function tabsMarkup(selected='information'){
  return `<nav class="academic-reference-tabs" aria-label="学期资料">${[['information','学期信息'],['calendar','校历'],['timetable','课表']].map(([key,name])=>`<button type="button" data-reference-action="tab" data-kind="${key}" class="${selected===key?'selected':''}" aria-pressed="${selected===key}">${name}</button>`).join('')}</nav>`;
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={parseWeeks,formatWeeks,tabsMarkup};return;}
 const model=()=>root.StudyAcademic?.manager();
 const term=()=>root.StudyAcademic?.currentTerm();
 const redraw=()=>root.StudyAcademic?.paint();
 function state(M=model(),kind=M?.referenceTab){
  M.referenceUI||={};const key=M.selected+':'+kind;
  return M.referenceUI[key]||=( {text:'',files:[],open:false,busy:false,error:'',notice:''} );
 }
 function pending(M){return Object.values(M?.referenceUI||{}).some(s=>s.text.trim()||s.files.length);}
 function busy(M){return Object.values(M?.referenceUI||{}).some(s=>s.busy);}
 function validate(M){
  if(pending(M))throw new Error('请先识别或取消当前导入，再保存。');
  for(const t of M.terms)for(const row of t.timetable||[]){if(row._weeksText!==undefined){row.weeks=parseWeeks(row._weeksText);delete row._weeksText;}if(row.course.trim()&&!Object.hasOwn(M.assignments,row.course.trim()))M.assignments[row.course.trim()]=t.key;}
 }
 function input(kind,index,field,value,extra=''){
  return `<input data-reference-kind="${kind}" data-reference-index="${index}" data-reference-field="${field}" aria-label="${({week:'教学周',start:'开始日期',end:'结束日期',label:'备注',course:'课程归属',class_type:'课程类型',time:'上课时间',weeks:'上课周次',location:'地点'})[field]} ${index+1}" value="${esc(value)}" ${extra}>`;
 }
 function remove(kind,index){return `<button type="button" class="icon-button" data-reference-action="remove-row" data-kind="${kind}" data-index="${index}" aria-label="移除${names[kind]}第 ${index+1} 行" title="移除">${icon('x')}</button>`;}
 function table(kind,rows){
  if(!rows.length)return `<div class="academic-reference-empty">${kind==='calendar'?'导入校历，确定日期与教学周的对应关系。':'导入课表，整理每周的课程安排。'}</div>`;
  const headings=kind==='calendar'?['类型','教学周','开始日期','结束日期','备注','']:['课程归属','课程类型','星期','时间 / 节次','教学周','地点',''];
  return `<div class="academic-reference-table-wrap"><table class="academic-reference-table ${kind}"><thead><tr>${headings.map(name=>`<th scope="col">${name}</th>`).join('')}</tr></thead><tbody>${rows.map((r,i)=>`<tr>${kind==='calendar'?`<td><select data-reference-kind="${kind}" data-reference-index="${i}" data-reference-field="kind" aria-label="日期类型 ${i+1}">${[['teaching','教学'],['break','假期'],['exam','考试']].map(([k,n])=>`<option value="${k}" ${r.kind===k?'selected':''}>${n}</option>`).join('')}</select></td><td>${input(kind,i,'week',r.week,'type="number" min="1" max="60" placeholder="—"')}</td><td>${input(kind,i,'start',r.start,'type="date"')}</td><td>${input(kind,i,'end',r.end,'type="date"')}</td><td>${input(kind,i,'label',r.label,'maxlength="80"')}</td>`:`<td>${input(kind,i,'course',r.course,'list="schedule-course-options" maxlength="150"')}</td><td>${input(kind,i,'class_type',r.class_type,'list="schedule-type-options" maxlength="60"')}</td><td><select data-reference-kind="${kind}" data-reference-index="${i}" data-reference-field="weekday" aria-label="星期 ${i+1}">${days.map((name,n)=>`<option value="${n+1}" ${r.weekday===n+1?'selected':''}>${name}</option>`).join('')}</select></td><td>${input(kind,i,'time',r.time,'placeholder="09:00–10:00" maxlength="80"')}</td><td>${input(kind,i,'weeks',r._weeksText??formatWeeks(r.weeks),'placeholder="每周"')}</td><td>${input(kind,i,'location',r.location,'maxlength="120"')}</td>`}<td>${remove(kind,i)}</td></tr>`).join('')}</tbody></table></div>`;
 }
 function markup(M){
  const kind=M.referenceTab,t=term();if(!t||!names[kind])return '';
  const s=state(M,kind),refs=(t.references||[]).filter(r=>r.kind===kind),courses=Object.keys(M.assignments).filter(name=>!M.assignments[name]||M.assignments[name]===M.selected),types=S.tag_catalog?.groups?.class_type||[];
  return `<section class="academic-references" aria-label="${names[kind]}设置"><header><div class="academic-reference-sources">${refs.map(ref=>`<a ${S.academic_settings?.terms?.some(t=>t.references?.some(r=>r.id===ref.id))?'href=':'data-pending-source='}"/api/academic-references/${esc(ref.id)}" target="_blank" rel="noopener" title="查看原始材料" class="academic-reference-source">${icon('file-text')}<span>${esc(ref.filename)}</span>${icon('arrow-up-right')}</a>`).join('')}</div><button type="button" class="outline-button" data-reference-action="import" ${s.busy?'disabled':''}>${icon('upload')}导入${names[kind]}</button></header>${s.open?`<div class="academic-reference-import"><label class="academic-reference-drop" data-reference-drop><input type="file" id="academic-reference-file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.pptx,.md,.txt" hidden ${s.busy?'disabled':''}>${icon('paperclip')}<span>${s.files.length?esc(s.files[0].filename):'选择文件或拖到这里'}</span><span class="reference-file-hint">PDF、图片、文档 · 5 MB 内</span></label><textarea data-reference-text aria-label="粘贴${names[kind]}内容" rows="3" maxlength="30000" placeholder="或粘贴${names[kind]}内容；可以补充识别说明" ${s.busy?'disabled':''}>${esc(s.text)}</textarea><footer><button type="button" class="outline-button" data-reference-action="cancel-import" ${s.busy?'disabled':''}>取消</button><button type="button" class="outline-button" data-reference-action="recognize" ${s.busy?'disabled':''}>${icon('sparkles')}${s.busy?'正在识别…':'识别'}</button></footer></div>`:''}<p class="academic-reference-message error-message" role="alert" ${s.error?'':'hidden'}>${esc(s.error)}</p><p class="academic-reference-message" role="status" ${s.notice?'':'hidden'}>${esc(s.notice)}</p>${table(kind,t[kind]||[])}<button type="button" class="outline-button academic-reference-add" data-reference-action="add-row" ${s.busy?'disabled':''}>${icon('plus')}添加</button>${kind==='timetable'?`<p class="academic-reference-hint">教学周留空表示每周；支持 1–6, 8–16。</p>`:''}<datalist id="schedule-course-options">${courses.map(v=>`<option value="${esc(v)}">`).join('')}</datalist><datalist id="schedule-type-options">${types.map(v=>`<option value="${esc(v)}">`).join('')}</datalist></section>`;
 }
 const toBase64=raw=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('文件读取失败。'));reader.readAsDataURL(raw);});
 async function choose(files){
  const M=model(),s=state();if(!files.length||s.busy)return;
  try{if(files.length>1)throw new Error('请一次导入一份文件。');const file=files[0];if(!file.size||file.size>5*1024*1024)throw new Error('请选择 5 MB 内的非空文件。');if(!/\.(pdf|png|jpg|jpeg|webp|docx|pptx|md|txt)$/i.test(file.name))throw new Error('请选择 PDF、图片或文档。');const payload=await toBase64(file);if(model()!==M)return;s.files=[{filename:file.name,file:payload}];s.error='';redraw();}catch(e){s.error=e.message;redraw();}
 }
 async function recognize(){
  const M=model(),t=term(),kind=M.referenceTab,s=state(M,kind),owner=S.user?.id;
  if(s.busy)return;
  try{
   if(S.demonstration)throw new Error('请在正式学期中导入资料。');
   const saved=S.academic_settings?.terms?.some(r=>r.key===M.selected);
   if(!saved)throw new Error('请先保存这个学期，再导入资料。');
   const attachments=[...s.files];
   if(s.text.trim())attachments.push({filename:names[kind]+'-粘贴内容.txt',file:await toBase64(new Blob([s.text],{type:'text/plain'}))});
   if(!attachments.length)throw new Error('请选择文件或粘贴内容。');
   if((M.referenceFiles?.length||0)+attachments.length>3)throw new Error('请先保存已识别的资料，再继续导入。');
   s.busy=true;s.error='';s.notice='';redraw();
   const result=await api('/api/academic-settings/import',{term_key:M.selected,kind,text:s.text,attachments});
   if(model()!==M||owner!==S.user?.id)return;
   if(!result.rows.length){s.notice=result.reply||'没有识别到完整安排，请补充内容后重试。';return;}
   t[kind]=result.rows;t.references||=[];M.referenceFiles||=[];
   result.references.forEach((ref,i)=>{if(!t.references.some(r=>r.id===ref.id&&r.kind===ref.kind))t.references.push(ref);M.referenceFiles.push({...attachments[i],kind});});
   if(kind==='timetable')for(const row of result.rows)if(!M.assignments[row.course])M.assignments[row.course]=M.selected;
   s.text='';s.files=[];s.open=false;s.notice='识别完成，请核对后保存。';
  }catch(e){s.error=e.message;}finally{s.busy=false;if(model()===M&&owner===S.user?.id)redraw();}
 }
 root.AcademicReferences={tabsMarkup,markup,pending,busy,validate};
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-reference-action]');if(!button||!model())return;
  event.preventDefault();event.stopImmediatePropagation();const M=model(),action=button.dataset.referenceAction;
  if(busy(M)||M.saving)return;
  try{
   if(action==='tab'){if(pending(M)&&button.dataset.kind!==M.referenceTab)throw new Error('请先识别或取消当前导入，再切换。');root.StudyAcademic.commit();M.referenceTab=button.dataset.kind;redraw();return;}
   const kind=M.referenceTab,s=state(M,kind),t=term();if(!t||!names[kind])return;
   if(action==='import'){s.open=true;s.error='';redraw();}
   if(action==='cancel-import'){s.open=false;s.files=[];s.text='';s.error='';redraw();}
   if(action==='recognize')await recognize();
   if(action==='add-row'){t[kind]||=[];t[kind].push(kind==='calendar'?{kind:'teaching',week:null,start:'',end:'',label:''}:{course:'',class_type:'',weekday:1,time:'',weeks:[],location:''});redraw();}
   if(action==='remove-row'){t[kind].splice(Number(button.dataset.index),1);redraw();}
  }catch(e){root.StudyAcademic.reportError(e.message);}
 },true);
 document.addEventListener('input',event=>{
  if(!model())return;const el=event.target;
  if(el.hasAttribute('data-reference-text')){state().text=el.value;root.StudyAcademic.refreshActions();return;}
  if(!el.dataset.referenceField)return;
  const {referenceKind:kind,referenceIndex:index,referenceField:field}=el.dataset,row=term()?.[kind]?.[Number(index)];if(!row)return;
  if(field==='weeks')row._weeksText=el.value;
  else row[field]=field==='week'||field==='weekday'?(el.value===''?null:Number(el.value)):el.value;
  root.StudyAcademic.refreshActions();
 });
 document.addEventListener('change',event=>{if(event.target.id==='academic-reference-file')choose([...event.target.files]);});
 document.addEventListener('dragover',event=>{if(event.target.closest('[data-reference-drop]')){event.preventDefault();event.dataTransfer.dropEffect='copy';}});
 document.addEventListener('drop',event=>{if(event.target.closest('[data-reference-drop]')){event.preventDefault();choose([...event.dataTransfer.files]);}});
})(typeof window==='undefined'?{}:window);
