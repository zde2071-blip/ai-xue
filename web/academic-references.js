/* Import originals into the current semester; calendar views own presentation. */
(function(root){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const names={calendar:'校历',timetable:'课表'};
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
 function tabsMarkup(selected='information'){return `<nav class="academic-reference-tabs" aria-label="学期资料">${[['information','学期信息'],['calendar','校历'],['timetable','课表']].map(([k,n])=>`<button type="button" data-reference-action="tab" data-kind="${k}" class="${selected===k?'selected':''}" aria-pressed="${selected===k}">${n}</button>`).join('')}</nav>`;}
 if(typeof module!=='undefined'&&module.exports){module.exports={parseWeeks,formatWeeks,tabsMarkup};return;}
 const model=()=>root.StudyAcademic?.manager(),term=()=>root.StudyAcademic?.currentTerm(),redraw=()=>root.StudyAcademic?.paint();
 function state(M=model(),kind=M?.referenceTab){M.referenceUI||={};return M.referenceUI[M.selected+':'+kind]||={text:'',files:[],open:false,busy:false,error:'',notice:''};}
 const importing=M=>Object.values(M?.referenceUI||{}).some(s=>s.text.trim()||s.files.length);
 const pending=M=>importing(M)||!!root.AcademicCalendar?.pending(M);
 const busy=M=>Object.values(M?.referenceUI||{}).some(s=>s.busy);
 function validate(M){if(root.AcademicCalendar?.pending(M))throw new Error('请先完成或取消当前安排的编辑。');if(importing(M))throw new Error('请先识别或取消当前导入，再保存。');for(const t of M.terms)for(const r of t.timetable||[])if(r.course.trim()&&!Object.hasOwn(M.assignments,r.course.trim()))M.assignments[r.course.trim()]=t.key;}
 function sourceMarkup(M,t,kind){const refs=(t.references||[]).filter(r=>r.kind===kind);return refs.length?`<details class="calendar-source-menu"><summary class="icon-button" title="原始材料" aria-label="原始材料">${icon('paperclip')}</summary><div>${refs.map(ref=>{const saved=S.academic_settings?.terms?.some(t=>t.references?.some(r=>r.id===ref.id));return saved?`<a href="/api/academic-references/${esc(ref.id)}" target="_blank" rel="noopener">${icon('file-text')}<span>${esc(ref.filename)}</span>${icon('arrow-up-right')}</a>`:`<span>${icon('file-text')}${esc(ref.filename)} · 待保存</span>`;}).join('')}</div></details>`:'';}
 function markup(M){
  const kind=M.referenceTab,t=term();if(!t||!names[kind])return '';const s=state(M,kind);
  const tools=`${sourceMarkup(M,t,kind)}<button type="button" class="outline-button calendar-import-button" data-reference-action="import" ${s.busy?'disabled':''}>${icon('upload')}导入${names[kind]}</button>${kind==='timetable'?`<button type="button" class="icon-button calendar-add-button" data-reference-action="add-row" aria-label="添加课程" title="添加课程" ${s.busy?'disabled':''}>${icon('plus')}</button>`:`<details class="calendar-new-menu"><summary class="icon-button calendar-add-button" aria-label="添加安排" title="添加安排">${icon('plus')}</summary><div><button type="button" data-reference-action="add-row">考试或事项</button><button type="button" data-calendar-action="add-range">教学周或假期</button></div></details>`}`;
  const file=s.files[0],image=file?.mime?.startsWith('image/');
  const panel=s.open?`<div class="academic-reference-import">${s.chooseKind?`<label class="academic-import-target"><span>导入内容</span><select data-reference-target aria-label="导入内容" ${s.busy?'disabled':''}>${Object.entries(names).map(([key,name])=>`<option value="${key}" ${key===kind?'selected':''}>${name}</option>`).join('')}</select></label>`:''}<label class="academic-reference-drop"><input id="academic-reference-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.pptx,.md,.txt" hidden ${s.busy?'disabled':''}>${image?`<img src="data:${esc(file.mime)};base64,${file.file}" alt="待识别图片">`:icon('paperclip')}<span>${file?esc(file.filename):'选择文件，或直接粘贴微信图片'}</span><small>5 MB 内</small></label><textarea data-reference-text aria-label="粘贴${names[kind]}内容" rows="2" maxlength="30000" placeholder="补充说明，或粘贴文字…" ${s.busy?'disabled':''}>${esc(s.text)}</textarea><footer><button type="button" class="outline-button" data-reference-action="cancel-import" ${s.busy?'disabled':''}>取消</button><button type="button" class="outline-button" data-reference-action="recognize" ${s.busy?'disabled':''}>${icon('sparkles')}${s.busy?'正在识别…':'识别'}</button></footer></div>`:'';
  const message=`<p class="academic-reference-message error-message" role="alert" ${s.error?'':'hidden'}>${esc(s.error)}</p><p class="academic-reference-message" role="status" ${s.notice?'':'hidden'}>${esc(s.notice)}</p>`;
  return `<section class="academic-references" data-reference-drop aria-label="${names[kind]}设置">${root.AcademicCalendar.markup(M,t,kind,{tools,importPanel:panel,message})}<datalist id="schedule-course-options">${Object.keys(M.assignments).filter(n=>!M.assignments[n]||M.assignments[n]===M.selected).map(v=>`<option value="${esc(v)}">`).join('')}</datalist><datalist id="schedule-type-options">${(S.tag_catalog?.groups?.class_type||[]).map(v=>`<option value="${esc(v)}">`).join('')}</datalist></section>`;
 }
 const toBase64=raw=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('文件读取失败。'));reader.readAsDataURL(raw);});
 async function choose(files){
  const M=model(),s=state();if(!files.length||busy(M)||M.saving)return;
  try{if(files.length>1)throw new Error('请一次导入一份文件。');const f=files[0];if(!f.size||f.size>5*1024*1024)throw new Error('请选择 5 MB 内的非空文件。');let name=f.name;if(!/\.(pdf|png|jpg|jpeg|webp|gif|docx|pptx|md|txt)$/i.test(name)){if(!f.type.startsWith('image/'))throw new Error('请选择图片、PDF 或文档。');name='微信图片.'+({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'}[f.type]||'png');}const payload=await toBase64(f);if(model()!==M)return;s.files=[{filename:name,file:payload,mime:f.type}];s.open=true;s.error='';redraw();}catch(e){s.error=e.message;redraw();}
 }
 async function recognize(){
  const M=model(),t=term(),kind=M.referenceTab,s=state(M,kind),owner=S.user?.id;if(s.busy)return;
  try{
   if(S.demonstration)throw new Error('请在正式学期中导入资料。');
   if(!S.academic_settings?.terms?.some(t=>t.key===M.selected))throw new Error('请先保存这个学期。');
   const files=[...s.files];if(s.text.trim())files.push({filename:names[kind]+'-粘贴内容.txt',file:await toBase64(new Blob([s.text],{type:'text/plain'}))});
   if(!files.length)throw new Error('请选择文件、粘贴图片或文字。');
   if((M.referenceFiles?.length||0)+files.length>3)throw new Error('请先保存已识别的资料，再继续导入。');
   s.busy=true;s.error='';s.notice='';redraw();
   const result=await api('/api/academic-settings/import',{term_key:M.selected,kind,text:s.text,attachments:files});
   if(model()!==M||owner!==S.user?.id)return;
   if(!result.rows.length){s.notice=result.reply||'没有读到完整安排，请换清晰原图或补充说明。';return;}
   t[kind]=result.rows;t.references||=[];M.referenceFiles||=[];
   result.references.forEach((ref,i)=>{if(!t.references.some(r=>r.id===ref.id&&r.kind===ref.kind))t.references.push(ref);M.referenceFiles.push({...files[i],kind});});
   if(kind==='timetable')for(const r of result.rows)if(!M.assignments[r.course])M.assignments[r.course]=M.selected;
   s.text='';s.files=[];s.open=false;s.notice='识别完成，请核对后保存。';root.AcademicCalendar.reset(M,kind);
  }catch(e){s.error=e.message;}finally{s.busy=false;if(model()===M&&owner===S.user?.id)redraw();}
 }
 function openImport(){const M=model();if(!M||!term()){root.StudyAcademic?.reportError('请先添加并保存学期，再导入校历或课表。');return;}if(busy(M)||M.saving)return;root.StudyAcademic.commit();const kind=names[M.referenceTab]?M.referenceTab:'calendar';M.referenceTab=kind;const s=state(M,kind);s.open=true;s.chooseKind=true;s.error='';redraw();}
 root.AcademicReferences={tabsMarkup,markup,pending,busy,validate,parseWeeks,formatWeeks,openImport};
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-reference-action]');if(!button||!model())return;event.preventDefault();event.stopImmediatePropagation();const M=model(),action=button.dataset.referenceAction;if(busy(M)||M.saving)return;
  try{if(action==='tab'){if(pending(M)&&button.dataset.kind!==M.referenceTab)throw new Error('请先完成或取消当前编辑。');root.StudyAcademic.commit();M.referenceTab=button.dataset.kind;redraw();return;}const kind=M.referenceTab,s=state();if(!names[kind])return;
   if(action==='import'){s.open=true;s.error='';redraw();}
   if(action==='cancel-import'){s.open=false;s.files=[];s.text='';s.error='';redraw();}
   if(action==='recognize')await recognize();
   if(action==='add-row'){button.closest('.calendar-new-menu')?.removeAttribute('open');root.AcademicCalendar.add();}
  }catch(e){root.StudyAcademic.reportError(e.message);}
 },true);
 document.addEventListener('input',event=>{if(model()&&event.target.hasAttribute('data-reference-text')){state().text=event.target.value;root.StudyAcademic.refreshActions();}});
 document.addEventListener('change',event=>{if(event.target.id==='academic-reference-file')choose([...event.target.files]);if(event.target.hasAttribute('data-reference-target')){const M=model(),old=state(),kind=event.target.value;if(!names[kind]||busy(M)||kind===M.referenceTab)return;M.referenceTab=kind;const next=state(M,kind);Object.assign(next,{text:old.text,files:old.files,open:true,chooseKind:true,error:'',notice:''});old.text='';old.files=[];old.open=false;redraw();}});
 document.addEventListener('paste',event=>{if(!document.querySelector('.academic-references')||busy(model()))return;const images=[...(event.clipboardData?.items||[])].filter(i=>i.kind==='file'&&i.type.startsWith('image/')).map(i=>i.getAsFile()).filter(Boolean);if(images.length){event.preventDefault();choose(images);}});
 document.addEventListener('dragover',event=>{if(event.target.closest('[data-reference-drop]')){event.preventDefault();event.dataTransfer.dropEffect='copy';}});
 document.addEventListener('drop',event=>{if(event.target.closest('[data-reference-drop]')){event.preventDefault();choose([...event.dataTransfer.files]);}});
})(typeof window==='undefined'?{}:window);
