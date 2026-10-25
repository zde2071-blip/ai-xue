/* Academic position, kept separate from material classification. */
(function(root){
 'use strict';
 const stages={highschool:'高中',university:'大学',postgraduate:'研究生'};
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const keyOf=a=>a&&stages[a.stage]&&Number.isSafeInteger(a.year)&&a.year>0&&Number.isSafeInteger(a.semester)&&a.semester>0?`${a.stage}|${a.year}|${a.semester}`:'unassigned';
 const shortName=t=>`${stages[t?.stage]||''} · Year ${t?.year} · Semester ${t?.semester}`;
 function termsFor(doc,rows=[]){const terms=new Map((doc?.terms||[]).map(t=>[keyOf(t),{...t,key:keyOf(t)}]));for(const row of rows){const a=resolve(row,doc),key=keyOf(a);if(key!=='unassigned'&&!terms.has(key))terms.set(key,{...a,key,name:''});}return [...terms.values()].sort((a,b)=>Object.keys(stages).indexOf(a.stage)-Object.keys(stages).indexOf(b.stage)||a.year-b.year||a.semester-b.semester);}
 function resolve(row,doc){if(row.course&&Object.hasOwn(doc?.assignments||{},row.course)){const key=doc.assignments[row.course];return doc.terms.find(t=>keyOf(t)===key)||null;}const academic=row.academic||null;return (doc?.removed_terms||[]).includes(keyOf(academic))?null:academic;}
 function label(key,doc){if(key==='all')return '全部学期';if(key==='unassigned')return '待归档';const term=doc?.terms?.find(t=>keyOf(t)===key);if(term)return shortName(term);const [stage,year,semester]=key.split('|');return shortName({stage,year,semester});}
 function markup(selected,doc,rows){
  const terms=termsFor(doc,rows),groups=[...new Set(terms.map(t=>`${t.stage}|${t.year}`))];
  const choice=(key,name)=>`<button type="button" data-academic-action="switch" data-key="${escape(key)}" class="${selected===key?'selected':''}" aria-pressed="${selected===key}"><span>${escape(name)}</span>${selected===key?'<span aria-hidden="true">✓</span>':''}</button>`;
  return `<details class="academic-switcher"><summary aria-label="切换学期"><span>${escape(label(selected,{terms}))}</span><i data-lucide="chevron-down"></i></summary><div class="academic-switcher-menu" aria-label="学期列表">${choice('all','全部学期')}${groups.map(group=>{const [stage,year]=group.split('|');return `<div class="academic-term-group"><div>${stages[stage]} · Year ${year}</div>${terms.filter(t=>t.stage===stage&&String(t.year)===year).map(t=>choice(t.key,`Semester ${t.semester}`)).join('')}</div>`;}).join('')}${choice('unassigned','待归档')}<footer><button type="button" data-academic-action="manage"><i data-lucide="sliders-horizontal"></i>管理学期</button></footer></div></details>`;
 }
 function removeTerm(doc,key){
  const assignments={...doc.assignments};for(const name of Object.keys(assignments))if(assignments[name]===key)assignments[name]=null;
  return {...doc,terms:doc.terms.filter(t=>keyOf(t)!==key),assignments,removed_terms:[...new Set([...(doc.removed_terms||[]),key])]};
 }
 function availableCourses(names,assignments,selected){return [...new Set(names.filter(Boolean))].filter(name=>!Object.hasOwn(assignments,name)||!assignments[name]||assignments[name]===selected).sort((a,b)=>a.localeCompare(b,'zh-CN',{numeric:true}));}
 function termHierarchyMarkup(terms,selected,glyph=()=> ''){
  const active=terms.find(t=>t.key===selected);
  return Object.entries(stages).map(([stage,name])=>{
   const rows=terms.filter(t=>t.stage===stage);if(!rows.length)return '';
   const years=[...new Set(rows.map(t=>t.year))].sort((a,b)=>a-b);
   return `<details class="academic-manager-stage" ${active?.stage===stage?'open':''}><summary>${glyph('chevron-right')}<span>${name}</span></summary>${years.map(year=>`<details class="academic-manager-year" ${active?.stage===stage&&active.year===year?'open':''}><summary>${glyph('chevron-right')}<span>Year ${year}</span></summary>${rows.filter(t=>t.year===year).sort((a,b)=>a.semester-b.semester).map(t=>`<button type="button" data-academic-action="edit-term" data-key="${escape(t.key)}" aria-label="${escape(shortName(t))}" aria-pressed="${t.key===selected}" class="${t.key===selected?'selected':''}"><span>Semester ${t.semester}</span>${t.key===selected?glyph('check'):''}</button>`).join('')}</details>`).join('')}</details>`;
  }).join('');
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={keyOf,shortName,termsFor,resolve,label,markup,availableCourses,termHierarchyMarkup,removeTerm};return;}
 let installed=false,M=null,config=null,termMenu=null,termMenuOrigin=null;
 function fail(message){const target=document.querySelector('#academic-management-error');if(target)target.textContent=message;}
 function current(){return M?.terms.find(t=>t.key===M.selected);}
 function commit(){
  if(!M||!current())return;
  const form=document.querySelector('#academic-management-form');if(!form)return;
  const data=Object.fromEntries(new FormData(form)),term=current(),next={stage:data.stage,year:Number(data.year),semester:Number(data.semester),name:term.name||''};
  if(!stages[next.stage]||!Number.isSafeInteger(next.year)||next.year<1||!Number.isSafeInteger(next.semester)||next.semester<1)throw new Error('请选择阶段，年级和学期请填写大于 0 的整数。');
  const key=keyOf(next);if(M.terms.some(t=>t.key!==term.key&&keyOf(t)===key))throw new Error('同一年级的学期不能重复。');
  const old=term.key;Object.assign(term,next,{key});for(const name of Object.keys(M.assignments))if(M.assignments[name]===old)M.assignments[name]=key;
  if(M.selectedScope===old)M.selectedScope=key;M.selected=key;M.formDraft=null;
 }
 function managerMarkup(){
  const term=current(),values=M.formDraft?.key===M.selected?M.formDraft:term,courseNames=availableCourses([...config.rows().map(r=>r.course),...(S.tag_catalog?.groups?.course||[]),...Object.keys(M.assignments)],M.assignments,M.selected);
  return `<div class="academic-management"><nav aria-label="管理的学期"><details class="academic-manager-picker"><summary aria-label="选择管理的学期" data-term-context="${escape(M.selected)}"><span>${term?escape(shortName(term)):'选择学期'}</span>${icon('chevron-down')}</summary><div class="academic-manager-menu" aria-label="学期分级菜单">${termHierarchyMarkup(M.terms,M.selected,icon)||'<p>尚未添加学期</p>'}</div></details>${root.StudyTemplates.actionMenuMarkup('添加',{label:'手动添加',icon:'plus',attributes:'data-academic-action="add-term"'},{label:'用 AI 识别',icon:'sparkles',attributes:'data-academic-action="add-ai"'},{glyph:icon,ariaLabel:'添加学期'})}</nav><div class="academic-term-editor">${term?`<form id="academic-management-form"><label>阶段<select name="stage" aria-label="学业阶段">${Object.entries(stages).map(([key,name])=>`<option value="${key}" ${values.stage===key?'selected':''}>${name}</option>`).join('')}</select></label><label>年级<input name="year" type="number" min="1" step="1" inputmode="numeric" aria-label="年级" value="${escape(values.year)}" required></label><label>学期<input name="semester" type="number" min="1" step="1" inputmode="numeric" aria-label="学期序号" value="${escape(values.semester)}" required></label></form><section class="academic-term-courses"><h3>课程</h3>${courseNames.map(name=>{const assigned=M.assignments[name],checked=assigned===term.key;return `<label><input type="checkbox" data-academic-course="${escape(name)}" aria-label="${escape(name)}" ${checked?'checked':''}><span>${escape(name)}</span></label>`;}).join('')||'<p>暂无可添加的课程</p>'}</section>`:'<div class="academic-no-term">添加一个学期</div>'}</div></div><p id="academic-management-error" class="error-message" role="alert"></p><div class="modal-actions" ${dirty()?'':'hidden'}><button type="button" class="outline-button" data-academic-action="cancel">取消</button><button type="button" class="primary" data-academic-action="save">保存</button></div>`;
 }
 function formChanged(){
  const form=document.querySelector('#academic-management-form'),term=current();if(!form||!term)return false;
  return ['stage','year','semester'].some(key=>String(form.elements[key].value).trim()!==String(term[key]??''));
 }
 function snapshot(){return JSON.stringify({terms:M.terms.map(({key,...term})=>term),assignments:M.assignments,removed_terms:M.removed_terms});}
 function dirty(){return !!M&&(formChanged()||snapshot()!==M.baseline);}
 function canLeaveSettings(){if(!M)return true;if(M.saving){fail('正在保存…');return false;}if(dirty()){fail('请先保存或取消学期修改。');return false;}return true;}
 function refreshActions(){const footer=document.querySelector('.academic-settings-page .modal-actions');if(footer)footer.hidden=!dirty();}
 function paint(){closeTermMenu();render();refreshActions();}
 async function prepareSettings(scope=config.scope()){
  const owner=S.user?.id,doc=S.demonstration?S.academic_settings||{terms:termsFor(null,config.rows()),assignments:{},etag:''}:await api('/api/academic-settings');
  if(owner!==S.user?.id)return;
  const rows=config.rows(),terms=termsFor(doc,rows),assignments={...doc.assignments};
  for(const row of rows)if(row.course&&!Object.hasOwn(assignments,row.course)){const set=new Set(rows.filter(r=>r.course===row.course).map(r=>keyOf(resolve(r,doc))));if(set.size===1)assignments[row.course]=[...set][0]==='unassigned'?null:[...set][0];}
  M={owner,terms,assignments,removed_terms:[...(doc.removed_terms||[])],etag:doc.etag,selected:terms.some(t=>t.key===scope)?scope:terms[0]?.key||'',selectedScope:scope,saving:false};M.baseline=snapshot();
 }
 function settingsMarkup(){return `<section class="academic-settings-page" aria-label="学期管理">${M?managerMarkup():''}</section>`;}

 function closeTermMenu(restore=false){const origin=termMenuOrigin;termMenu?.remove();termMenu=null;termMenuOrigin=null;if(restore&&origin?.isConnected)origin.focus();}
 function showTermMenu(event,origin){
  if(!M||M.saving)return;const key=origin.dataset.termContext||origin.dataset.key;if(!key||!M.terms.some(t=>t.key===key))return;
  closeTermMenu();termMenuOrigin=origin;termMenu=document.createElement('div');termMenu.className='academic-term-context-menu';termMenu.setAttribute('role','menu');termMenu.setAttribute('aria-label','学期操作');
  termMenu.innerHTML=`<button type="button" role="menuitem" data-academic-action="delete-term" data-key="${escape(key)}">${icon('trash-2')}删除学期</button>`;document.body.append(termMenu);root.lucide?.createIcons();
  termMenu.style.left=Math.max(8,Math.min(event.clientX,window.innerWidth-termMenu.offsetWidth-8))+'px';termMenu.style.top=Math.max(8,Math.min(event.clientY,window.innerHeight-termMenu.offsetHeight-8))+'px';termMenu.querySelector('button')?.focus();
 }

 function recognitionCurrent(){return {terms:M.terms.map(t=>({stage:t.stage,year:t.year,semester:t.semester})),assignments:M.assignments,course_names:[...new Set([...config.rows().map(r=>r.course),...Object.keys(M.assignments)].filter(Boolean))]};}
 function applyRecognition(proposal){
  commit();let firstNew='';for(const term of proposal.terms||[]){const key=keyOf(term);if(key==='unassigned')continue;if(!M.terms.some(t=>t.key===key)){M.terms.push({...term,key,name:''});if(!firstNew)firstNew=key;}if(!M.selected)M.selected=key;}
  if(firstNew)M.selected=firstNew;
  for(const row of proposal.assignments||[]){const existing=M.assignments[row.course];if((!existing||existing===row.term_key)&&M.terms.some(t=>t.key===row.term_key))M.assignments[row.course]=row.term_key;}
 }

 root.StudyAcademic={keyOf,resolve,termsFor,markup,label,recognitionCurrent,applyRecognition,prepareSettings,settingsMarkup,canLeaveSettings,dirty,busy:()=>!!M?.saving,install(options){
  config=options;if(installed)return;installed=true;
  document.addEventListener('click',async event=>{
   const button=event.target.closest('[data-academic-action]');if(!button)return;
   event.preventDefault();event.stopImmediatePropagation();const action=button.dataset.academicAction;button.closest('.settings-action-menu')?.removeAttribute('open');closeTermMenu();
   try{
    if(action==='switch'){document.querySelector('.academic-switcher')?.removeAttribute('open');config.select(button.dataset.key);return;}
    if(action==='manage'){document.querySelector('.academic-switcher')?.removeAttribute('open');await root.StudyTemplates?.open('academic');return;}
    if(!M||M.owner!==S.user?.id||M.saving||!document.querySelector('.academic-settings-page'))return;
    if(action==='delete-term'){const original=M.selected;commit();const key=button.dataset.key===original?M.selected:button.dataset.key;if(!M.terms.some(t=>t.key===key))return;const next=removeTerm(M,key);M.terms=next.terms;M.assignments=next.assignments;M.removed_terms=next.removed_terms;if(M.selected===key)M.selected=M.terms[0]?.key||'';if(M.selectedScope===key)M.selectedScope='unassigned';paint();return;}
    if(action==='cancel'){await prepareSettings(M.selectedScope);paint();return;}
    if(action==='edit-term'){const old=M.selected,target=button.dataset.key;commit();if(target!==old)M.selected=target;paint();return;}
    if(action==='add-ai'){root.StudyTemplates.openAcademicAI();return;}
    if(action==='add-term'){commit();const candidate={stage:current()?.stage||'university',year:current()?.year||1,semester:1,name:''};while(M.terms.some(t=>keyOf(t)===keyOf(candidate)))candidate.semester++;const term={...candidate,key:keyOf(candidate)};M.terms.push(term);M.selected=term.key;paint();return;}
    if(action==='save'){
     commit();if(S.demonstration)throw new Error('示例模式不会保存修改。');M.saving=true;const owner=M.owner;
     document.querySelectorAll('.academic-settings-page button,.academic-settings-page input,.academic-settings-page select').forEach(el=>el.disabled=true);
     try{const doc=await api('/api/academic-settings',{terms:M.terms,assignments:M.assignments,removed_terms:M.removed_terms,etag:M.etag});if(S.user?.id!==owner)return;S.academic_settings=doc;M.etag=doc.etag;M.removed_terms=doc.removed_terms||[];M.baseline=snapshot();M.saving=false;config.select(M.selectedScope);toast('已保存');}
     catch(error){if(S.user?.id!==owner)return;M.saving=false;document.querySelectorAll('.academic-settings-page button,.academic-settings-page input,.academic-settings-page select').forEach(el=>el.disabled=false);throw error;}

    }
   }catch(error){if(document.querySelector('.academic-settings-page'))fail(error.message);else toast(error.message);}
  },true);
  document.addEventListener('contextmenu',event=>{const origin=event.target.closest('.academic-settings-page [data-academic-action="edit-term"],.academic-settings-page [data-term-context]');if(!origin)return;event.preventDefault();event.stopImmediatePropagation();showTermMenu(event,origin);},true);
  document.addEventListener('pointerdown',event=>{if(termMenu&&!termMenu.contains(event.target))closeTermMenu();},true);
  document.addEventListener('click',event=>{if(termMenu&&!termMenu.contains(event.target))closeTermMenu();},true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&termMenu){event.preventDefault();closeTermMenu(true);return;}const origin=event.target.closest?.('.academic-settings-page [data-academic-action="edit-term"],.academic-settings-page [data-term-context]');if(origin&&(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')){event.preventDefault();const r=origin.getBoundingClientRect();showTermMenu({clientX:r.left+16,clientY:r.bottom},origin);}},true);
  document.addEventListener('scroll',()=>closeTermMenu(),true);window.addEventListener('resize',()=>closeTermMenu());window.addEventListener('blur',()=>closeTermMenu());
  document.addEventListener('submit',event=>{if(event.target.id!=='academic-management-form')return;event.preventDefault();event.stopImmediatePropagation();document.querySelector('[data-academic-action="save"]')?.click();},true);
  document.addEventListener('input',event=>{if(event.target.closest('#academic-management-form')){const form=document.querySelector('#academic-management-form');M.formDraft={...Object.fromEntries(new FormData(form)),key:M.selected};fail('');refreshActions();}});
  document.addEventListener('change',event=>{if(!M||M.owner!==S.user?.id)return;if(event.target.hasAttribute('data-academic-course')){const name=event.target.dataset.academicCourse,assigned=Object.hasOwn(M.assignments,name)?M.assignments[name]:null;if(assigned&&assigned!==M.selected){event.target.checked=false;return;}M.assignments[name]=event.target.checked?M.selected:null;}else if(!event.target.closest('#academic-management-form'))return;else{const form=document.querySelector('#academic-management-form');M.formDraft={...Object.fromEntries(new FormData(form)),key:M.selected};}fail('');refreshActions();});
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.academic-switcher'))document.querySelector('.academic-switcher')?.removeAttribute('open');if(!event.target.closest('.academic-manager-picker'))document.querySelector('.academic-manager-picker')?.removeAttribute('open');},true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){document.querySelector('.academic-switcher')?.removeAttribute('open');document.querySelector('.academic-manager-picker')?.removeAttribute('open');}});

 }};
})(typeof window==='undefined'?{}:window);
