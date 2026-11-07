/* Import originals into one calendar draft; save only after review. */
(function(root){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const names={calendar:'校历',timetable:'课表',exam:'考试信息'};
 function parseWeeks(value){
  if(!String(value).trim())return [];
  const values=[];
  for(const part of String(value).trim().replace(/\s*([-–—~至])\s*/g,'$1').split(/[,，、\s]+/)){
   const m=part.match(/^(\d+)(?:[-–—~至](\d+))?$/),start=Number(m?.[1]),end=Number(m?.[2]||m?.[1]);
   if(!m||start<1||end>60||start>end)throw new Error('教学周请填写 1–60，如 1–6, 8–16。');
   for(let i=start;i<=end;i++)values.push(i);
  }
  return [...new Set(values)].sort((a,b)=>a-b);
 }
 function formatWeeks(values){const weeks=[...new Set(values||[])].sort((a,b)=>a-b),parts=[];for(let i=0;i<weeks.length;i++){const start=weeks[i];let end=start;while(weeks[i+1]===end+1)end=weeks[++i];parts.push(start===end?String(start):`${start}–${end}`);}return parts.join(', ');}
 if(typeof module!=='undefined'&&module.exports){module.exports={parseWeeks,formatWeeks};return;}
 const model=()=>root.StudySchedule?.manager(),redraw=()=>root.StudySchedule?.paint();
 function state(M=model()){return M.importUI||={kind:'calendar',text:'',files:[],open:false,busy:false,error:'',notice:''};}
 const pending=M=>!!M&&(!!state(M).open||!!root.AcademicCalendar?.pending(M));
 const busy=M=>!!M&&state(M).busy;
 function validate(M){if(root.AcademicCalendar?.pending(M))throw new Error('请先完成或取消安排编辑。');if(state(M).open)throw new Error('请先完成或取消导入。');}
 function addMenu(){return `<details class="settings-action-menu calendar-add-menu"><summary class="outline-button" aria-label="添加日历内容" title="添加">${icon('plus')}<span>添加</span></summary><div class="settings-action-options"><button data-calendar-action="new">${icon('plus')}<span>手动添加</span></button><button data-reference-action="import">${icon('sparkles')}<span>用 AI 导入</span></button><button data-reference-action="subscribe">${icon('link')}<span>订阅日历链接</span></button></div></details>`;}
 function handbookDetails(handbook,showFilename=true){
  return `<section class="handbook-details" aria-label="手册考试信息">${showFilename?`<div class="handbook-file">${icon('file-text')}<span>${esc(handbook.filename)}</span></div>`:''}
   <ul>${handbook.entries.map(entry=>`<li><strong>${esc(entry.name)}</strong>${entry.weight?'<span>'+esc(entry.weight)+'</span>':''}${entry.timing?'<p>'+esc(entry.timing)+'</p>':''}
    <details><summary>核对手册原文</summary><blockquote>${esc(entry.evidence)}</blockquote></details></li>`).join('')}</ul></section>`;
 }
 function originalLinks(M,source){
  if(source?.type!=='import')return '';
  let label='原始文件';
  const refs=M.references||[];
  let originals=refs.filter(ref=>source.reference_ids?.includes(ref.id));
  if(!originals.length){
   const linked=new Set((M.sources||[]).flatMap(row=>row.reference_ids||[]));
   const archived=refs.filter(ref=>ref.kind===source.kind&&!linked.has(ref.id));
   originals=archived.filter(ref=>ref.filename.replace(/\.[^.]+$/,'')===source.name||ref.filename===source.handbook?.filename);
   const peers=(M.sources||[]).filter(row=>row.kind===source.kind&&row.type==='import'&&!row.reference_ids?.length);
   if(!originals.length&&archived.length===1&&peers.length===1&&!source.handbook){
    originals=archived;label='同分类归档原件';
   }
  }
  if(!originals.length)return '';
  const pending=M.referenceFiles||[];
  return `<div class="calendar-originals"><span>${label}</span><ul>${originals.map(ref=>{
   const filename=esc(ref.filename);
   if(pending.some(file=>file.referenceId===ref.id&&file.filename===ref.filename))return `<li><span>${filename}</span><small>保存后可打开</small></li>`;
   return `<li><a href="/api/academic-references/${esc(ref.id)}" target="_blank" rel="noopener" title="${filename}">${icon('file-text')}<span>${filename}</span>${icon('external-link')}</a></li>`;
  }).join('')}</ul></div>`;
 }
 function stageOriginals(M,files,references,source){
  if(!Array.isArray(references)||references.length!==files.length)throw new Error('原件信息不完整，请重新识别。');
  const refs=[...(M.references||[])],uploads=[...(M.referenceFiles||[])];
  const ids=new Set(source.reference_ids||[]);
  references.forEach((ref,index)=>{
   ids.add(ref.id);
   const same=row=>(row.referenceId||row.id)===ref.id&&row.filename===ref.filename&&row.kind===ref.kind;
   if(!refs.some(same))refs.push(ref);
   if(!uploads.some(same))uploads.push({referenceId:ref.id,filename:ref.filename,kind:ref.kind,file:files[index].file});
  });
  if(uploads.length>15||uploads.reduce((size,file)=>size+file.file.length,0)>20*1024*1024)throw new Error('请取消本次导入，保存当前日历后再继续。');
  if(ids.size)source.reference_ids=[...ids];
  M.references=refs;M.referenceFiles=uploads;
 }
 function handbookImport(M,s){
  const courses=M.course_choices||[],review=s.handbookResult;
  const replacing=review&&(M.sources||[]).some(source=>source.handbook?.course===review.handbook.course);
  const fields=review?handbookDetails(review.handbook)+`<p class="handbook-hint">${review.rows.length?'有明确日期的考试会显示在日历上。':'手册没有可确认的具体日期，考试信息会保留在课程下。'}${review.incomplete?' 仅列出通过原文核对的项目。':''}</p>`:
   `<label class="field handbook-course"><span>所属课程</span><select class="learning-import-select" data-handbook-course ${s.busy||!courses.length?'disabled':''}><option value="">${courses.length?'选择课表课程':'请先导入并保存课表'}</option>${courses.map(course=>`<option value="${esc(course)}" ${course===s.handbookCourse?'selected':''}>${esc(course)}</option>`).join('')}</select></label>
    <label class="academic-reference-drop"><input id="academic-reference-file" type="file" accept=".pdf,.docx,.md,.txt" hidden ${s.busy||!courses.length?'disabled':''}>${icon('upload')}<span>${s.files[0]?esc(s.files[0].filename):'选择 Module Handbook'}</span></label>`;
  return `<div class="calendar-editor-shade"><section class="academic-reference-import" role="dialog" aria-modal="true" aria-label="从 Module Handbook 导入考试">
   <header><span>${review?esc(review.handbook.course)+' · 核对考试信息':'从 Module Handbook 导入考试'}</span><button type="button" class="icon-button" data-reference-action="cancel-import" aria-label="关闭导入" ${s.busy?'disabled':''}>${icon('x')}</button></header>
   ${fields}${replacing?'<p class="handbook-hint">保存后会替换该课程之前导入的手册和关联考试安排。</p>':''}<p class="error-message" role="alert" ${s.error?'':'hidden'}>${esc(s.error)}</p><footer>
   <button type="button" class="outline-button" data-reference-action="cancel-import" ${s.busy?'disabled':''}>取消</button>
   ${review?'<button type="button" class="primary" data-reference-action="apply-handbook">加入考试信息</button>':
   `<button type="button" class="primary" data-reference-action="recognize" ${s.busy||!courses.length?'disabled':''}>${s.busy?'正在提取…':'提取考试信息'}</button>`}</footer></section></div>`;
 }
 function markup(M){
  const s=state(M),kind=s.kind,file=s.files[0],image=file?.mime?.startsWith('image/');

  const panel=s.open&&s.mode==='subscription'?`<div class="calendar-editor-shade"><section class="academic-reference-import" role="dialog" aria-modal="true" aria-label="订阅日历链接"><header><span>订阅日历链接</span><button class="icon-button" data-reference-action="cancel-import" aria-label="关闭导入">${icon('x')}</button></header><label class="subscription-field">名称<input data-subscription-name value="${esc(s.name||'')}" placeholder="例如：西浦课表" maxlength="150"></label><label class="subscription-field">日历地址<input data-subscription-url value="${esc(s.url||'')}" placeholder="https:// 或 webcal://" type="text" autocomplete="off"></label><p class="subscription-hint">使用学校提供的 ICS / iCalendar 订阅地址。</p><p class="error-message" role="alert" ${s.error?'':'hidden'}>${esc(s.error)}</p><footer><button class="outline-button" data-reference-action="cancel-import">取消</button><button class="primary" data-reference-action="load-subscription">${s.busy?'正在读取…':'读取日历'}</button></footer></section></div>`:s.open?`<div class="calendar-editor-shade"><section class="academic-reference-import" role="dialog" aria-modal="true" aria-label="用 AI 导入"><header><span>用 AI 导入</span><button type="button" class="icon-button" data-reference-action="cancel-import" aria-label="关闭导入" ${s.busy?'disabled':''}>${icon('x')}</button></header><label class="academic-import-target"><span>内容</span><select data-reference-target aria-label="导入内容" ${s.busy?'disabled':''}>${Object.entries(names).map(([key,name])=>`<option value="${key}" ${key===kind?'selected':''}>${name}</option>`).join('')}</select></label><label class="academic-reference-drop"><input id="academic-reference-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.pptx,.md,.txt" hidden ${s.busy?'disabled':''}>${image?`<img src="data:${esc(file.mime)};base64,${file.file}" alt="待识别图片">`:icon('upload')}<span>${file?esc(file.filename):'选择文件，或粘贴图片'}</span></label><textarea data-reference-text aria-label="补充导入说明" rows="3" maxlength="30000" placeholder="补充说明，或粘贴文字…" ${s.busy?'disabled':''}>${esc(s.text)}</textarea><p class="error-message" role="alert" ${s.error?'':'hidden'}>${esc(s.error)}</p><footer><button type="button" class="outline-button" data-reference-action="cancel-import" ${s.busy?'disabled':''}>取消</button><button type="button" class="primary" data-reference-action="recognize" ${s.busy?'disabled':''}>${s.busy?'正在识别…':'识别'}</button></footer></section></div>`:'';
  const message=`<p class="academic-reference-message" role="status" ${s.notice?'':'hidden'}>${esc(s.notice)}</p>`;
  return `<section class="academic-references" data-reference-drop aria-label="日历">${root.AcademicCalendar.markup(M,M,'unified',{importPanel:s.open&&s.mode==='handbook'?handbookImport(M,s):panel,message})}</section>`;
 }
 const toBase64=raw=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('文件读取失败。'));reader.readAsDataURL(raw);});
 async function choose(files){
  const M=model(),s=state();if(!files.length||busy(M)||M.saving)return;
  const mode=s.open?s.mode:'ai';
  if(mode==='subscription'||s.handbookResult)return;
  try{
   if(files.length>1)throw new Error('请一次导入一份文件。');
   const f=files[0];if(!f.size||f.size>5*1024*1024)throw new Error('请选择 5 MB 内的非空文件。');
   let name=f.name;
   if(mode==='handbook'&&!/\.(pdf|docx|md|txt)$/i.test(name))throw new Error('请选择 PDF、DOCX 或文字版 Module Handbook。');
   if(!/\.(pdf|png|jpg|jpeg|webp|gif|docx|pptx|md|txt)$/i.test(name)){
    if(!f.type.startsWith('image/'))throw new Error('请选择图片、PDF 或文档。');
    name='微信图片.'+({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'}[f.type]||'png');
   }
   const payload=await toBase64(f);
   if(model()!==M||mode==='handbook'&&(!s.open||s.mode!==mode))return;
   Object.assign(s,{files:[{filename:name,file:payload,mime:f.type}],open:true,mode,error:''});
   redraw();
  }catch(e){s.open=true;s.mode=mode;s.error=e.message;redraw();}
 }
 function applyHandbook(M,s){
  const result=s.handbookResult;if(!result)return;
  const handbook=result.handbook;
  const existing=(M.sources||[]).find(source=>source.handbook?.course===handbook.course);
  const id=existing?.id||crypto.randomUUID();
  const source={id,name:handbook.course,kind:'exam',type:'import',visible:true,...existing,handbook};
  try{stageOriginals(M,s.files,result.references,source);}
  catch(error){s.error=error.message;redraw();return;}
  M.sources=[...(M.sources||[]).filter(row=>row.id!==id),source];
  M.events=M.events.filter(row=>row.source_id!==id).concat(result.rows.map(row=>({...row,source_id:id})));
  Object.assign(s,{open:false,files:[],handbookResult:null,error:'',notice:''});
  if(result.rows.length)root.AcademicCalendar.focusImported?.(M,'exam',result.rows);
  redraw();toast('已加入考试信息，请保存日历');
 }
 async function recognize(){
  const M=model(),s=state(M),kind=s.kind,owner=S.user?.id;if(s.busy)return;
  try{
   if(S.demonstration)throw new Error('请在正式学期中导入资料。');
   if(s.mode==='handbook'){
    if(!M.course_choices?.includes(s.handbookCourse))throw new Error('请从课表选择课程。');
    if(!s.files.length)throw new Error('请选择 Module Handbook 文件。');
    s.busy=true;s.error='';redraw();
    const result=await api('/api/calendar/import',{kind:'exam',handbook_course:s.handbookCourse,attachments:s.files});
    if(model()===M&&owner===S.user?.id)s.handbookResult=result;
    return;
   }
   const files=[...s.files];if(s.text.trim())files.push({filename:names[kind]+'-粘贴内容.txt',file:await toBase64(new Blob([s.text],{type:'text/plain'}))});
   if(!files.length)throw new Error('请选择文件、粘贴图片或文字。');
   s.busy=true;s.error='';s.notice='';redraw();
   const result=await api('/api/calendar/import',{kind,text:s.text,attachments:files});
   if(model()!==M||owner!==S.user?.id)return;
   if(!result.rows.length){s.error=result.reply||'没有读到完整安排，请换清晰原图或补充说明。';return;}
   const name=s.files[0]?.filename?.replace(/\.[^.]+$/,'')||names[kind];
   const matches=s.files.length?(M.sources||[]).filter(row=>row.type==='import'&&!row.handbook&&row.kind===kind&&row.name===name):[];
   const existing=matches.length===1?matches[0]:null,id=existing?.id||crypto.randomUUID(),source={...existing,id,name,kind,type:'import',visible:true};
   stageOriginals(M,files,result.references,source);
   M.sources||=[];M.sources=M.sources.filter(row=>row.id!==id);M.sources.push(source);
   if(existing)for(const field of ['calendar','timetable','events'])M[field]=M[field].filter(row=>row.source_id!==id);
   const target=kind==='exam'?'events':kind;M[target].push(...result.rows.map(row=>({...row,source_id:id})));
   s.text='';s.files=[];s.open=false;s.notice=(result.incomplete?'仅填入已确认的部分，请核对后保存。':`已填入${names[kind]}，确认后保存。`)+(result.reply?' '+result.reply:'');root.AcademicCalendar.reset(M);root.AcademicCalendar.focusImported?.(M,kind,result.rows);
  }catch(e){s.error=e.message;}finally{s.busy=false;if(model()===M&&owner===S.user?.id)redraw();}
 }
 const readSubscription=source=>api('/api/calendar/subscribe',{source_id:source.id||'',url:source.url,name:source.name});
 async function subscription(id=''){
  const M=model(),s=state(M),owner=S.user?.id,existing=M.sources?.find(r=>r.id===id);
  try{s.busy=true;s.error='';s.notice='';redraw();const result=await readSubscription(existing||{url:s.url,name:s.name});if(model()!==M||owner!==S.user?.id)return;
   const source={...result.source,...(existing?{color:existing.color,visible:existing.visible,kind:existing.kind}:{})};M.sources||=[];M.sources=M.sources.filter(r=>r.id!==source.id);M.sources.push(source);
   for(const key of ['calendar','timetable','events'])M[key]=M[key].filter(r=>r.source_id!==source.id).concat(result[key]||[]);
   s.open=false;s.url='';s.name='';s.notice='已读取订阅，核对后保存。'+result.notice;root.AcademicCalendar.reset(M);
  }catch(e){if(existing){M.error=e.message;}else s.error=e.message;}finally{s.busy=false;if(model()===M&&owner===S.user?.id)redraw();}
 }
 function openImport(mode='ai'){const M=model();if(!M||busy(M)||M.saving)return;if(root.AcademicCalendar.pending(M)){root.StudySchedule.reportError('请先完成或取消安排编辑。');return;}Object.assign(state(M),{open:true,mode,error:'',notice:'',files:[],text:'',handbookCourse:'',handbookResult:null});redraw();}
 root.AcademicReferences={markup,addMenu,pending,busy,validate,parseWeeks,formatWeeks,openImport,readSubscription,handbookDetails,originalLinks};
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-reference-action]');if(!button||!model())return;event.preventDefault();event.stopImmediatePropagation();const M=model(),s=state(M);if(busy(M)||M.saving)return;
  button.closest('.settings-action-menu')?.removeAttribute('open');
  if(button.dataset.referenceAction==='import')openImport();
  if(button.dataset.referenceAction==='handbook')openImport('handbook');
  if(button.dataset.referenceAction==='apply-handbook')applyHandbook(M,s);
  if(button.dataset.referenceAction==='subscribe'){openImport();s.mode='subscription';s.url='';s.name='';redraw();}
  if(button.dataset.referenceAction==='load-subscription')await subscription();
  if(button.dataset.referenceAction==='refresh-subscription')await subscription(button.dataset.sourceId);
  if(button.dataset.referenceAction==='cancel-import'){Object.assign(s,{open:false,files:[],text:'',error:'',handbookResult:null});redraw();}
  if(button.dataset.referenceAction==='recognize')await recognize();
 },true);
 document.addEventListener('input',event=>{if(model()&&event.target.hasAttribute('data-subscription-url'))state().url=event.target.value;if(model()&&event.target.hasAttribute('data-subscription-name'))state().name=event.target.value;if(model()&&event.target.hasAttribute('data-reference-text')){state().text=event.target.value;root.StudySchedule.refreshActions();}});
 document.addEventListener('change',event=>{if(event.target.id==='academic-reference-file')choose([...event.target.files]);if(event.target.hasAttribute('data-reference-target')){state().kind=event.target.value;state().error='';redraw();}if(event.target.hasAttribute('data-handbook-course')){state().handbookCourse=event.target.value;state().error='';redraw();}});
 document.addEventListener('paste',event=>{if(!document.querySelector('.academic-references')||busy(model()))return;const images=[...(event.clipboardData?.items||[])].filter(i=>i.kind==='file'&&i.type.startsWith('image/')).map(i=>i.getAsFile()).filter(Boolean);if(images.length){event.preventDefault();choose(images);}});
 document.addEventListener('dragover',event=>{if(event.target.closest('[data-reference-drop]')){event.preventDefault();event.dataTransfer.dropEffect='copy';}});
 document.addEventListener('drop',event=>{if(event.target.closest('[data-reference-drop]')){event.preventDefault();choose([...event.dataTransfer.files]);}});
})(typeof window==='undefined'?{}:window);
