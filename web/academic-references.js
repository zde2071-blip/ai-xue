/* Import originals into the current semester; calendar views own presentation. */
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
 function sourceMarkup(M){const refs=M.references||[];return refs.length?`<details class="calendar-source-menu"><summary class="icon-button" title="原始材料" aria-label="原始材料">${icon('paperclip')}</summary><div>${refs.map(ref=>M.referenceFiles.some(f=>f.filename===ref.filename)?`<span>${icon('file-text')}${esc(ref.filename)} · 待保存</span>`:`<a href="/api/academic-references/${esc(ref.id)}" target="_blank" rel="noopener">${icon('file-text')}<span>${esc(ref.filename)}</span>${icon('arrow-up-right')}</a>`).join('')}</div></details>`:'';}
 function markup(M){
  const s=state(M),kind=s.kind,file=s.files[0],image=file?.mime?.startsWith('image/');
  const tools=`${sourceMarkup(M)}${root.StudyTemplates.actionMenuMarkup('添加',{label:'手动添加',icon:'plus',attributes:'data-calendar-action="new"'},{label:'用 AI 导入',icon:'sparkles',attributes:'data-reference-action="import"'},{glyph:icon,ariaLabel:'添加日历内容'})}`;
  const panel=s.open?`<div class="calendar-editor-shade"><section class="academic-reference-import" role="dialog" aria-modal="true" aria-label="用 AI 导入"><header><span>用 AI 导入</span><button type="button" class="icon-button" data-reference-action="cancel-import" aria-label="关闭导入" ${s.busy?'disabled':''}>${icon('x')}</button></header><label class="academic-import-target"><span>内容</span><select data-reference-target aria-label="导入内容" ${s.busy?'disabled':''}>${Object.entries(names).map(([key,name])=>`<option value="${key}" ${key===kind?'selected':''}>${name}</option>`).join('')}</select></label><label class="academic-reference-drop"><input id="academic-reference-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.pptx,.md,.txt" hidden ${s.busy?'disabled':''}>${image?`<img src="data:${esc(file.mime)};base64,${file.file}" alt="待识别图片">`:icon('upload')}<span>${file?esc(file.filename):'选择文件，或粘贴图片'}</span></label><textarea data-reference-text aria-label="补充导入说明" rows="3" maxlength="30000" placeholder="补充说明，或粘贴文字…" ${s.busy?'disabled':''}>${esc(s.text)}</textarea><p class="error-message" role="alert" ${s.error?'':'hidden'}>${esc(s.error)}</p><footer><button type="button" class="outline-button" data-reference-action="cancel-import" ${s.busy?'disabled':''}>取消</button><button type="button" class="primary" data-reference-action="recognize" ${s.busy?'disabled':''}>${s.busy?'正在识别…':'识别'}</button></footer></section></div>`:'';
  const message=`<p class="academic-reference-message" role="status" ${s.notice?'':'hidden'}>${esc(s.notice)}</p>`;
  return `<section class="academic-references" data-reference-drop aria-label="日历">${root.AcademicCalendar.markup(M,M,'unified',{tools,importPanel:panel,message})}<datalist id="schedule-course-options">${[...new Set([...(S.tag_catalog?.groups?.course||[]),...M.timetable.map(r=>r.course)])].map(v=>`<option value="${esc(v)}">`).join('')}</datalist><datalist id="schedule-type-options">${(S.tag_catalog?.groups?.class_type||[]).map(v=>`<option value="${esc(v)}">`).join('')}</datalist></section>`;
 }
 const toBase64=raw=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('文件读取失败。'));reader.readAsDataURL(raw);});
 async function choose(files){
  const M=model(),s=state();if(!files.length||busy(M)||M.saving)return;
  try{if(files.length>1)throw new Error('请一次导入一份文件。');const f=files[0];if(!f.size||f.size>5*1024*1024)throw new Error('请选择 5 MB 内的非空文件。');let name=f.name;if(!/\.(pdf|png|jpg|jpeg|webp|gif|docx|pptx|md|txt)$/i.test(name)){if(!f.type.startsWith('image/'))throw new Error('请选择图片、PDF 或文档。');name='微信图片.'+({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'}[f.type]||'png');}const payload=await toBase64(f);if(model()!==M)return;s.files=[{filename:name,file:payload,mime:f.type}];s.open=true;s.error='';redraw();}catch(e){s.open=true;s.error=e.message;redraw();}
 }
 async function recognize(){
  const M=model(),s=state(M),kind=s.kind,owner=S.user?.id;if(s.busy)return;
  try{
   if(S.demonstration)throw new Error('请在正式学期中导入资料。');
   const files=[...s.files];if(s.text.trim())files.push({filename:names[kind]+'-粘贴内容.txt',file:await toBase64(new Blob([s.text],{type:'text/plain'}))});
   if(!files.length)throw new Error('请选择文件、粘贴图片或文字。');
   if((M.referenceFiles?.length||0)+files.length>3)throw new Error('请先保存已识别的资料，再继续导入。');
   s.busy=true;s.error='';s.notice='';redraw();
   const result=await api('/api/calendar/import',{kind,text:s.text,attachments:files});
   if(model()!==M||owner!==S.user?.id)return;
   if(!result.rows.length){s.error=result.reply||'没有读到完整安排，请换清晰原图或补充说明。';return;}
   if(kind==='exam')M.events=[...M.events.filter(r=>r.kind!=='exam'),...result.rows];else M[kind]=result.rows;
   M.references||=[];M.referenceFiles||=[];
   resulM.references.forEach((ref,i)=>{if(!M.references.some(r=>r.id===ref.id&&r.kind===ref.kind))M.references.push(ref);M.referenceFiles.push({...files[i],kind});});
   s.text='';s.files=[];s.open=false;s.notice=result.incomplete?'部分内容未能确认，请对照原件补充后保存。':`已填入${names[kind]}，确认后保存。`;root.AcademicCalendar.reset(M);
  }catch(e){s.error=e.message;}finally{s.busy=false;if(model()===M&&owner===S.user?.id)redraw();}
 }
 function openImport(){const M=model();if(!M||busy(M)||M.saving)return;if(root.AcademicCalendar.pending(M)){root.StudySchedule.reportError('请先完成或取消安排编辑。');return;}Object.assign(state(M),{open:true,error:'',notice:''});redraw();}
 root.AcademicReferences={markup,pending,busy,validate,parseWeeks,formatWeeks,openImport};
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-reference-action]');if(!button||!model())return;event.preventDefault();event.stopImmediatePropagation();const M=model(),s=state(M);if(busy(M)||M.saving)return;
  button.closest('.settings-action-menu')?.removeAttribute('open');
  if(button.dataset.referenceAction==='import')openImport();
  if(button.dataset.referenceAction==='cancel-import'){Object.assign(s,{open:false,files:[],text:'',error:''});redraw();}
  if(button.dataset.referenceAction==='recognize')await recognize();
 },true);
 document.addEventListener('input',event=>{if(model()&&event.target.hasAttribute('data-reference-text')){state().text=event.target.value;root.StudySchedule.refreshActions();}});
 document.addEventListener('change',event=>{if(event.target.id==='academic-reference-file')choose([...event.target.files]);if(event.target.hasAttribute('data-reference-target')){state().kind=event.target.value;state().error='';redraw();}});
 document.addEventListener('paste',event=>{if(!document.querySelector('.academic-references')||busy(model()))return;const images=[...(event.clipboardData?.items||[])].filter(i=>i.kind==='file'&&i.type.startsWith('image/')).map(i=>i.getAsFile()).filter(Boolean);if(images.length){event.preventDefault();choose(images);}});
 document.addEventListener('dragover',event=>{if(event.target.closest('[data-reference-drop]')){event.preventDefault();event.dataTransfer.dropEffect='copy';}});
 document.addEventListener('drop',event=>{if(event.target.closest('[data-reference-drop]')){event.preventDefault();choose([...event.dataTransfer.files]);}});
})(typeof window==='undefined'?{}:window);
