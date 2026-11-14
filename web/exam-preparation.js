/* Course-first preparation. Notes are references, never copies or inferred scope. */
(function(root){
 'use strict';
 const code=value=>String(value||'').trim().replace(/^([a-z]{2,6})\s*(\d{2,4})(?![a-z0-9]).*$/i,(_,a,b)=>(a+b).toUpperCase());
 const when=r=>r.date?(r.date_end?`${r.date} 至 ${r.date_end}`:[r.date,r.start].filter(Boolean).join(' ')):(r.timing||'日期待确认');
 if(typeof module!=='undefined'&&module.exports){module.exports={code,when};return;}
 let D=null,loading=false,error='',selected='',dialog=null,saving=false;
 const E=v=>esc(v),I=v=>icon(v);
 async function load(){if(loading)return;loading=true;try{D=await api('/api/preparation');error='';}catch(e){error=e.message;}finally{loading=false;render();}}
 function notes(){const owners=new Map((S.courses||[]).map(c=>[c.id,c]));return (S.resources||[]).filter(r=>r.kind==='notes').map(r=>{const c=owners.get(r.unit_id||r.course_id)||{},tags=r.tags||c.tags;return {...r,code:code(tags?.course||c.course_label||r.course_title),weeks:[...new Set([...(tags?.weeks||r.weeks||[]),...(r.sessions||c.sessions||[]).map(s=>s.week).filter(Number.isInteger)])]};});}
 function originals(refs){return refs?.length?`<div class="prep-originals">原件：${refs.map(r=>`<a href="/api/academic-references/${E(r.id)}" target="_blank" rel="noopener">${E(r.filename)}</a>`).join('')}</div>`:'';}
 function examRow(r){return `<article class="prep-exam"><div class="prep-exam-heading"><div><strong>${E(r.title)}</strong><span>${E(when(r))}${r.weight?' · '+E(r.weight):''}</span></div>${r.legacy?'':`<button class="icon-button" data-prep="edit" data-id="${E(r.id)}" aria-label="编辑 ${E(r.title)}">${I('sliders-horizontal')}</button>`}</div><dl>${[['location','地点'],['duration','时长'],['question_types','题型'],['scope','考试范围']].map(([k,l])=>`<div><dt>${l}</dt><dd>${E(r[k]||'待补充')}</dd></div>`).join('')}</dl>${originals(r.originals)}${r.evidence?`<details><summary>原文依据</summary><p>${E(r.evidence)}</p></details>`:''}</article>`;}
 function markup(){if(!D&&!loading&&!error)queueMicrotask(load);if(!D)return `<section class="prep-page"><h1>备考</h1><p>${E(error||'正在读取…')}</p>${error?'<button data-prep="reload">重试</button>':''}</section>`;
 const exams=D.exams||[],courses=[...new Set([...exams.map(r=>code(r.course)),...Object.keys(D.courses)])].filter(Boolean).sort();
 const head=`<header class="prep-header"><div>${selected?'<button class="text-button" data-prep="back">← 全部课程</button>':''}<h1>${E(selected||'备考')}</h1></div><button class="outline-button" data-prep="add">${I('plus')}添加考试信息</button></header>`;
 if(!selected)return `<section class="prep-page">${head}<div class="prep-course-grid">${courses.map(c=>{const rows=exams.filter(r=>code(r.course)===c),future=rows.filter(r=>r.date>=new Date().toLocaleDateString('en-CA')).sort((a,b)=>a.date.localeCompare(b.date));const next=future[0]||rows.at(-1);return `<button class="prep-course" data-prep="course" data-code="${E(c)}"><strong>${E(c)}</strong><span>${E(next?when(next):'暂无考试安排')}</span><small>${rows.length} 项考试与考核</small></button>`;}).join('')||'<div class="prep-empty">添加老师的考试通知、安排表或 Module Handbook，按课程开始备考。</div>'}</div></section>`;
 const course=D.courses[selected]||{notes:[],papers:[]},list=notes().filter(r=>r.code===selected),weeks=[...new Set(list.flatMap(r=>r.weeks))].sort((a,b)=>a-b),chosen=new Set(course.notes||[]);
 return `<section class="prep-page">${head}<section class="prep-section"><header><h2>复习材料</h2><span class="muted">选择考试覆盖的笔记，关联原始课件</span></header><div class="prep-weeks">${weeks.map(w=>{const ids=list.filter(r=>r.weeks.includes(w)&&r.available!==false).map(r=>r.id);return `<label><input type="checkbox" data-prep-week="${w}" ${ids.length&&ids.every(id=>chosen.has(id))?'checked':''} ${saving?'disabled':''}>第 ${w} 周</label>`;}).join('')}</div><div class="prep-notes">${list.map(r=>{const origin=(S.resources||[]).find(o=>o.id===r.source_id),linked=D.note_originals?.[r.id]||(origin?[origin]:[]);return `<div class="prep-note"><label><input type="checkbox" data-prep-note="${E(r.id)}" ${chosen.has(r.id)?'checked':''} ${saving||r.available===false?'disabled':''}><span>${E(r.title)}<small>${r.weeks.length?'第 '+r.weeks.join('、')+' 周':'未分周'}${r.available===false?' · 文件已移走':''}</small></span></label><div><button class="text-button" data-prep="note" data-id="${E(r.id)}">笔记</button>${linked.length?linked.map(o=>o.available!==false?`<a href="/api/library/${E(o.id)}/file" target="_blank" rel="noopener" title="${E(o.filename)}${o.pages?' · '+E(o.pages):''}">${linked.length===1?'原课件':E(o.filename)}${o.pages?'（'+E(o.pages)+'）':''}</a>`:'<span class="muted">原件已移走</span>').join(''):'<span class="muted">暂无关联原件</span>'}</div></div>`;}).join('')||'<p class="muted">这门课还没有复习笔记。学完并整理笔记后，可在这里选择。</p>'}</div><p class="muted" role="status">${saving?'正在保存…':`已选 ${chosen.size} 篇笔记`}</p></section><section class="prep-section"><header><h2>老师的考试信息</h2></header>${exams.filter(r=>code(r.course)===selected).map(examRow).join('')||'<p class="muted">暂无考试信息</p>'}</section><section class="prep-section"><header><h2>模拟题与真题</h2><button class="text-button" data-prep="papers">${I('plus')}添加文件</button></header><ul class="prep-papers">${(course.papers||[]).map(p=>`<li><span>${p.kind==='past'?'真题':'模拟题'}</span><a href="/api/preparation/files/${E(p.id)}" target="_blank" rel="noopener">${E(p.filename)}</a></li>`).join('')||'<li class="muted">暂无文件</li>'}</ul></section></section>`;
 }
 function input(key,label,value,type='text'){return `<label><span>${label}</span><input data-exam-field="${key}" type="${type}" value="${E(value||'')}"></label>`;}
 function drawDialog(){const d=dialog;if(!d)return;
 if(d.mode==='choose'){modalContent('添加考试信息',`<div class="prep-methods"><button class="outline-button" data-prep="manual">${I('pencil')}手动添加</button><button class="outline-button" data-prep="ai">${I('sparkles')}AI 导入</button></div>`);return;}
 const files=`<label class="prep-upload">${I('upload')}选择多个文件<input type="file" data-prep-files multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.pptx,.md,.txt" ${d.busy?'disabled':''}></label><ul class="reference-file-list">${d.files.map((f,i)=>`<li><span>${i+1}. ${E(f.filename)}</span><button type="button" data-prep="remove-file" data-index="${i}" ${d.busy?'disabled':''}>移除</button></li>`).join('')}</ul>`;
 let body='';
 if(d.mode==='papers')body=`<label>类型<select id="prep-paper-kind"><option value="mock" ${d.paperKind==='mock'?'selected':''}>模拟题</option><option value="past" ${d.paperKind==='past'?'selected':''}>真题</option></select></label>${files}`;
 else if(!d.rows)body=`<p class="muted">考试安排、老师通知、Module Handbook 可一起上传；连续截图按选择顺序读取。</p>${files}<textarea id="prep-instructions" rows="3" placeholder="补充说明或更正，例如 ISA104 改为第 10 周周二">${E(d.text)}</textarea>`;
 else body=`<p class="muted">核对后保存。资料未提供的信息可留空。</p><div class="prep-draft">${d.rows.map((r,i)=>`<details class="prep-draft-item" ${i===0?'open':''}><summary>${E(r.course||'新考核')} · ${E(r.title||'考试信息')}<small>${E(when(r))}</small></summary><fieldset data-exam-index="${i}"><div class="prep-fields">${input('course','课程代码',r.course)}${input('title','考试／考核名称',r.title)}${input('date','具体日期／范围开始',r.date,'date')}${input('date_end','范围结束（非范围留空）',r.date_end,'date')}${input('start','开始时间',r.start,'time')}${input('end','结束时间',r.end,'time')}${input('timing','教学周／日期说明',r.timing)}${input('location','地点',r.location)}${input('duration','时长',r.duration)}${input('question_types','题型',r.question_types)}${input('scope','考试范围',r.scope)}${input('weight','占比',r.weight)}</div>${r.evidence?`<details><summary>原文依据</summary><p>${E(r.evidence)}</p></details>`:''}<button type="button" class="text-button" data-prep="remove-exam" data-index="${i}">移除此项</button></fieldset></details>`).join('')}</div>`;
 modalContent(d.mode==='papers'?'添加模拟题与真题':d.rows?'核对考试信息':'AI 导入',`<div class="prep-dialog">${body}<p id="prep-error" role="alert" class="error-message">${E(d.error||'')}</p><footer><button class="outline-button" data-prep="cancel" ${d.busy?'disabled':''}>取消</button><button class="primary" data-prep="${d.mode==='papers'?'save-papers':d.rows?'save-exams':'recognize'}" ${d.busy?'disabled':''}>${d.busy?'正在处理…':d.mode==='papers'||d.rows?'保存':'识别'}</button></footer></div>`);icons();
 }
 async function choose(files){const d=dialog;if(!d||d.busy)return;try{if(files.length+d.files.length>10)throw Error('每次最多 10 份文件。');const additions=await Promise.all(files.map(f=>root.AcademicReferences.attachment(f)));if([...d.files,...additions].reduce((n,f)=>n+f.file.length,0)>18*1024*1024)throw Error('文件总量过大，请分批导入。');if(dialog!==d)return;d.files.push(...additions);d.error='';}catch(e){d.error=e.message;}drawDialog();}
 async function act(action,button){
 if(action==='reload')return load();
 if(action==='course'){selected=button.dataset.code;render();return;}
 if(action==='back'){selected='';render();return;}
 if(action==='note'){await openResource(button.dataset.id);return;}
 if(action==='add'){if(!D)await load();dialog={mode:'choose',files:[],text:'',etag:D.calendar_etag};drawDialog();return;}
 if(action==='papers'){dialog={mode:'papers',files:[],paperKind:'mock',etag:D.etag};drawDialog();return;}
 if(action==='edit'){const r=D?.exams.find(r=>r.id===button.dataset.id);if(!r)return;dialog={mode:'manual',files:[],rows:[{...r}],source_id:r.source_id,etag:D.calendar_etag};drawDialog();return;}
 const d=dialog;if(!d||d.busy)return;
 if(action==='cancel'){document.querySelector('#modal').close();dialog=null;return;}
 if(action==='manual'){d.mode='manual';d.rows=[{course:selected,title:''}];drawDialog();return;}
 if(action==='ai'){d.mode='ai';drawDialog();return;}
 if(action==='remove-file'){d.files.splice(Number(button.dataset.index),1);drawDialog();return;}
 if(action==='remove-exam'){d.rows.splice(Number(button.dataset.index),1);drawDialog();return;}
 d.busy=true;d.error='';drawDialog();
 try{
 if(action==='recognize'){
  if(!d.files.length&&!d.text?.trim())throw Error('请选择文件或填写考试信息。');
  const r=await api('/api/calendar/import',{kind:'exam',attachments:d.files,text:d.text||''});
  if(!r.assessments?.length)throw Error(r.reply||'未读到课程和考试信息，请补充说明。');
  d.rows=r.assessments;d.error=r.incomplete?r.reply:'';
 }else if(action==='save-exams'){
  if(!d.rows?.length)throw Error('请至少保留一项考试或考核。');
  if(d.manager){
   const doc=JSON.parse(JSON.stringify(root.StudySchedule.document())),id=crypto.randomUUID(),rows=d.rows.map(r=>({...r,id:r.id||crypto.randomUUID()}));
   doc.sources.push({id,name:'考试信息',kind:'exam',type:'import',assessments:rows});
   for(const r of rows)if(r.date&&!r.date_end)doc.events.push({id:r.id,title:r.course+' · '+r.title,kind:'exam',date:r.date,start:r.start&&r.end?r.start:'',end:r.start&&r.end?r.end:'',location:r.location||'',source_id:id});
   await api('/api/calendar',doc);await root.StudySchedule.prepare({keepView:true});
  }else D=await api('/api/preparation/exams',{etag:d.etag,assessments:d.rows,source_id:d.source_id,attachments:d.files});
 }else if(action==='save-papers'){
  D=await api('/api/preparation/materials',{etag:d.etag,course:selected,action:'papers',paper_kind:d.paperKind,attachments:d.files});
 }
 if(action.startsWith('save-')){document.querySelector('#modal').close();dialog=null;render();toast('已保存');return;}
 }catch(e){d.error=e.message;}finally{d.busy=false;if(dialog===d)drawDialog();}
 }
 document.addEventListener('click',event=>{const button=event.target.closest('[data-prep]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();act(button.dataset.prep,button).catch(e=>toast(e.message));},true);
 document.addEventListener('input',event=>{if(!dialog||dialog.busy)return;const el=event.target;if(el.id==='prep-instructions')dialog.text=el.value;if(el.id==='prep-paper-kind')dialog.paperKind=el.value;const field=el.dataset.examField;if(field){const i=Number(el.closest('[data-exam-index]').dataset.examIndex);dialog.rows[i][field]=el.value;}});
 document.addEventListener('change',async event=>{const el=event.target;if(el.hasAttribute('data-prep-files')){await choose([...el.files]);return;}if(!el.hasAttribute('data-prep-week')&&!el.hasAttribute('data-prep-note'))return;if(saving)return;saving=true;const chosen=new Set(D.courses[selected]?.notes||[]),list=notes().filter(r=>r.code===selected&&r.available!==false),ids=el.dataset.prepNote?[el.dataset.prepNote]:list.filter(r=>r.weeks.includes(Number(el.dataset.prepWeek))).map(r=>r.id);for(const id of ids)el.checked?chosen.add(id):chosen.delete(id);render();try{D=await api('/api/preparation/materials',{etag:D.etag,course:selected,action:'notes',notes:[...chosen]});}catch(e){toast(e.message);}finally{saving=false;render();}});
 document.addEventListener('paste',event=>{if(!dialog||dialog.rows||dialog.busy||!event.target.closest('#modal'))return;const files=[...(event.clipboardData?.files||[])];if(files.length){event.preventDefault();choose(files);}});
 document.querySelector('#modal').addEventListener('close',()=>{dialog=null;});
 root.ExamPreparation={markup,enter:load,manualInCalendar(manager){dialog={mode:'manual',rows:[{course:'',title:''}],files:[],manager};drawDialog();}};
})(typeof window==='undefined'?{}:window);
