/* Free prompts, custom types, and one assistant for importing or revising them. */
(function(root){
 'use strict';
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const defaults=[{id:'concepts',name:'知识点总结'},{id:'solutions',name:'题目讲解'}];
 function draftOf(value){return {name:value.name||'',prompt:value.prompt||''};}
 function changed(template,draft){return JSON.stringify(draftOf(template||{}))!==JSON.stringify(draft);}
 function promptMarkup(draft,isNew=false){return `${isNew?`<input class="template-name" data-template-field="name" aria-label="模板名称" placeholder="模板名称" value="${escape(draft.name)}" maxlength="60" required>`:''}<textarea class="template-prompt" data-template-field="prompt" aria-label="模板内容" placeholder="写下这种笔记的讲解和整理要求，或让 AI 帮你整理…" maxlength="40000" spellcheck="false">${escape(draft.prompt)}</textarea>`;}
 function choicesMarkup(choices,selected='',automatic=false){return `${automatic?'<option value="">自动选择</option>':''}${choices.map(row=>`<option value="${escape(row.id)}" ${row.id===selected?'selected':''}>${escape(row.name)}</option>`).join('')}`;}
 function historyFor(messages){return messages.slice(-10).map(message=>({role:message.role,content:message.content}));}
 function defaultTypeFor(name,rules){const key=Object.keys(rules||{}).find(key=>key.toLocaleLowerCase()===String(name||'').trim().toLocaleLowerCase());return key?rules[key]:'';}
 function suggestDefault(form,rules){const field=form?.elements?.learning_kind;if(field&&!field.dataset.userEdited)field.value=defaultTypeFor(form.elements.class_type?.value,rules)||'';}
 function actionMenuMarkup(label,manual,ai,{glyph=()=>'',className='',ariaLabel=label,triggerIcon='plus'}={}){
  return `<details class="settings-action-menu ${className}"><summary class="outline-button" aria-label="${escape(ariaLabel)}">${glyph(triggerIcon)}<span>${escape(label)}</span>${glyph('chevron-down')}</summary><div class="settings-action-options">${[manual,ai].map(item=>`<button type="button" aria-label="${escape(item.label)}" ${item.attributes}>${glyph(item.icon)}<span>${escape(item.label)}</span></button>`).join('')}</div></details>`;
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={draftOf,changed,promptMarkup,choicesMarkup,historyFor,navigationMarkup,actionMenuMarkup,defaultTypeFor,suggestDefault};return;}
 let installed=false,recognizer=null;
 const V={templatesExpanded:true,mode:'calendar',owner:null,data:null,selected:'concepts',draft:null,saving:false,loading:false,error:'',notice:'',aiOpen:false,chats:{},undo:null};
 const selected=()=>V.data?.templates.find(row=>row.id===V.selected);
 const dirty=()=>!!V.draft&&(!V.selected||changed(selected(),V.draft));
 const chat=()=>V.chats[V.selected||'new']||(V.chats[V.selected||'new']={messages:[],message:'',files:[],proposal:null,busy:false,recording:false,error:''});
 const working=()=>V.saving||V.loading||chat().busy;
 function rememberChoices(doc){S.templates=doc.templates.map(({id,name})=>({id,name}));}
 async function prepare(){try{const [doc,settings]=await Promise.all([api('/api/templates'),api('/api/learning-settings')]);rememberChoices(doc);S.classTypeDefaults=settings.class_type_defaults||{};return doc;}catch{return null;}}
 function suggestImport(form){suggestDefault(form,S.classTypeDefaults);}
 function options(id='',automatic=false){return choicesMarkup(S.templates?.length?S.templates:defaults,id,automatic);}
 function panelMarkup(){
  const state=chat(),speechSupported=!!(root.SpeechRecognition||root.webkitSpeechRecognition);
  return `<aside class="template-ai" aria-label="模板 AI 助手"><header><span>${icon('sparkles')}AI 整理</span><button type="button" class="icon-button" data-template-action="ai-toggle" aria-label="收起 AI 整理" title="收起">${icon('x')}</button></header><div class="template-ai-history" aria-live="polite">${state.messages.map(message=>`<div class="template-ai-message ${message.role}">${escape(message.content)}</div>`).join('')}${state.proposal?`<section class="template-proposal"><details><summary>查看整理结果</summary><pre>${escape(state.proposal.prompt)}</pre></details><button type="button" class="outline-button" data-template-action="apply">应用到 Prompt</button></section>`:''}${state.busy?'<p class="template-ai-working" role="status">正在整理…</p>':''}</div><div class="template-ai-composer"><div class="template-attachments">${state.files.map((file,i)=>`<span>${icon('file-text')}<span>${escape(file.filename)}</span><button type="button" class="icon-button" data-template-action="remove-file" data-index="${i}" aria-label="移除附件 ${escape(file.filename)}">${icon('x')}</button></span>`).join('')}</div><textarea data-template-field="message" aria-label="告诉 AI 你的模板要求" rows="3" maxlength="40000" placeholder="粘贴模板，或说说你想怎么学…" ${state.busy?'disabled':''}>${escape(state.message)}</textarea><div class="template-ai-tools"><button type="button" class="icon-button" data-template-action="attach" aria-label="导入到 AI 整理" title="添加文件" ${state.busy?'disabled':''}>${icon('paperclip')}</button><button type="button" class="icon-button ${state.recording?'recording':''}" data-template-action="voice" aria-label="${state.recording?'结束口述':'口述模板要求'}" title="${speechSupported?'口述，由浏览器转写':'当前浏览器不支持语音转写，可使用系统听写输入'}" ${!speechSupported||state.busy?'disabled':''}>${icon(state.recording?'square':'mic')}</button><span></span><button type="button" class="template-send" data-template-action="send" aria-label="发送给 AI 整理" title="发送" ${state.busy||state.recording?'disabled':''}>${icon('arrow-up')}</button></div><input type="file" id="template-attachments" aria-label="选择模板参考文件" accept=".md,.txt,.json,.yaml,.yml,.pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp" multiple hidden><p class="template-ai-error" role="alert" ${state.error?'':'hidden'}>${escape(state.error)}</p></div></aside>`;
 }
 function navigationMarkup(mode,key,templates=[],selected,draftName='',glyph=()=> '',calendarTree='',calendarExpanded=true,templatesExpanded=true,addMenu=''){
  const templateTree=`<div class="settings-template-tree" aria-label="笔记模板分类">${templates.map(row=>`<button type="button" data-template-action="select" data-id="${escape(row.id)}" class="${row.id===selected?'selected':''}" aria-pressed="${row.id===selected}">${glyph('file-text')}<span>${escape(row.name)}</span></button>`).join('')}${!selected&&draftName?`<span class="settings-template-pending">${escape(draftName)}</span>`:''}</div>`;
  return `<aside class="study-settings-nav" aria-label="学习设置二级导航"><nav>${[['calendar','calendar-days','日历'],['prompts','text-cursor-input','笔记模板']].map(([id,name,label])=>{const expanded=id==='calendar'?calendarExpanded:templatesExpanded;return `<div class="settings-nav-branch"><button type="button" data-settings-action="mode" data-mode="${id}" class="settings-section ${mode===id?'selected':''}" aria-pressed="${mode===id}" ${mode===id?`aria-expanded="${expanded}"`:''}>${glyph(name)}<span>${label}</span>${mode===id?`<span class="settings-disclosure">${glyph(expanded?'chevron-down':'chevron-right')}</span>`:''}</button>${mode===id?(id==='calendar'?calendarTree:(expanded?templateTree:'')):''}${mode===id?`<div class="settings-branch-add">${id==='calendar'?addMenu:`<button type="button" class="outline-button" data-template-action="new" aria-label="新建笔记模板">${glyph('plus')}添加模板</button>`}</div>`:''}</div>`;}).join('')}</nav></aside>`;
 }
 function promptPage(){
  if(!V.data||!V.draft)return '';
  const isNew=!V.selected;
  return `<div class="template-tabs-row"><strong class="template-current-name">${escape(V.draft.name||'新模板')}</strong><div class="settings-operation-group">${actionMenuMarkup('编辑模板',{label:'手动编辑',icon:'square-pen',attributes:'data-template-action="manual-edit"'},{label:'用 AI 整理',icon:'sparkles',attributes:'data-template-action="edit-ai"'},{glyph:icon,className:'prompt-edit-menu',ariaLabel:'编辑当前笔记模板',triggerIcon:'square-pen'})}</div></div><div class="template-workspace ${V.aiOpen?'with-ai':''}"><form id="learning-template-form" aria-busy="${V.saving}">${V.undo?'<div class="template-editor-tools"><button type="button" class="outline-button" data-template-action="undo">撤销应用</button></div>':''}<fieldset ${V.saving?'disabled':''}>${promptMarkup(V.draft,isNew)}</fieldset><div class="template-save-area"><p id="template-error" class="template-error" role="alert" ${V.error?'':'hidden'}>${escape(V.error)}</p><p class="template-notice" role="status" ${V.notice?'':'hidden'}>${escape(V.notice)}</p><footer class="template-actions" ${dirty()?'':'hidden'}><button type="button" class="outline-button" data-template-action="cancel" ${V.saving?'disabled':''}>取消</button><button type="submit" class="primary" ${V.saving?'disabled':''}>${V.saving?'保存中…':'保存'}</button></footer></div></form>${V.aiOpen?panelMarkup():''}</div>`;
 }
 function page(){
  if(!V.data||!V.draft)return '';
  return `<section class="study-settings-shell">${navigationMarkup(V.mode,'',V.data.templates,V.selected,V.draft.name,icon,V.mode==='calendar'?root.AcademicCalendar.sidebar():'',root.AcademicCalendar.sidebarExpanded(),V.templatesExpanded,root.AcademicReferences.addMenu())}<div class="template-page study-settings-content ${V.mode==='calendar'?'calendar-settings-content':''}">${V.mode==='calendar'?root.StudySchedule.markup():promptPage()}</div></section>`;
 }
 function paint(){
  const input=document.activeElement?.closest('[data-template-field]');const field=input?.dataset.templateField,start=input?.selectionStart,end=input?.selectionEnd;
  render();
  if(field){const next=document.querySelector(`[data-template-field="${field}"]`);next?.focus({preventScroll:true});if(Number.isInteger(start))next?.setSelectionRange(start,end);}
 }
 function fail(message){V.error=message;const el=document.getElementById('template-error');if(el){el.hidden=!message;el.textContent=message;}else toast(message);}
 function refreshSave(){
  document.querySelector('.template-actions')?.toggleAttribute('hidden',!dirty());
  const notice=document.querySelector('.template-notice');if(notice)notice.hidden=true;
 }
 function stopVoice(){if(recognizer){try{recognizer.stop();}catch{}}}
 async function open(mode='calendar'){
  if(S.busy||S.threadBusy||!canLeave())return;
  mode=mode==='prompts'?'prompts':'calendar';
  const owner=S.user?.id;
  try{
   const [doc,settings]=await Promise.all([api('/api/templates'),api('/api/learning-settings')]);if(S.user?.id!==owner)return;
   if(V.owner!==owner){V.owner=owner;V.selected='concepts';V.chats={};V.aiOpen=false;}
   V.data=doc;rememberChoices(doc);V.mode=mode;S.classTypeDefaults=settings.class_type_defaults||{};
   if(!selected())V.selected=doc.templates[0].id;
   V.draft=draftOf(selected());V.error='';V.notice='';V.undo=null;
   if(mode==='calendar')await root.StudySchedule.prepare();if(S.user?.id!==owner)return;
   S.view='templates';S.note=null;S.editing=false;closeDrawer();render();resetScroll();
  }catch(error){toast(error.message);}
 }
 async function send(){
  const state=chat();if(working()||state.recording)return;
  if(!state.message.trim()&&!state.files.length){state.error='请描述你的想法，或添加文件。';paint();return;}
  const request=state.message,files=state.files.map(file=>({...file})),owner=S.user?.id,key=V.selected;
  const current=state.proposal&&V.draft.prompt===state.proposal.basePrompt?state.proposal.prompt:V.draft.prompt;
  const payload={name:V.draft.name,current_prompt:current,request,attachments:files,history:historyFor(state.messages)};
  state.busy=true;state.error='';paint();
  try{
   const result=await api('/api/templates/assist',payload);if(S.user?.id!==owner||V.selected!==key)return;
   state.messages.push({role:'user',content:[request,...files.map(file=>'附件：'+file.filename)].filter(Boolean).join('\n')},{role:'assistant',content:result.reply});
   state.message='';state.files=[];state.proposal=result.prompt?{...result,basePrompt:V.draft.prompt}:null;
  }catch(error){state.error=error.message;}
  finally{state.busy=false;paint();document.querySelector('.template-ai-history')?.scrollTo({top:100000,behavior:'smooth'});}
 }
 function voice(){
  const state=chat();if(state.recording){stopVoice();return;}
  const Recognition=root.SpeechRecognition||root.webkitSpeechRecognition;if(!Recognition){state.error='可用系统听写将口述填入输入框。';paint();return;}
  const session=new Recognition(),base=state.message;recognizer=session;
  session.lang='zh-CN';session.continuous=true;session.interimResults=true;
  session.onstart=()=>{state.recording=true;state.error='';paint();};
  session.onresult=event=>{
   let transcript='';for(let i=0;i<event.results.length;i++)transcript+=event.results[i][0].transcript;
   state.message=[base,transcript].filter(Boolean).join('\n');const input=document.querySelector('[data-template-field="message"]');if(input)input.value=state.message;
  };
  session.onerror=event=>{state.error=event.error==='not-allowed'?'请允许麦克风访问，或使用系统听写输入。':'语音转写暂不可用，可使用系统听写或直接输入。';};
  session.onend=()=>{state.recording=false;if(recognizer===session)recognizer=null;paint();};
  state.recording=true;paint();
  try{session.start();}catch{state.recording=false;recognizer=null;state.error='无法开始口述，可使用系统听写输入。';paint();}
 }
 function install(){
  if(installed)return;installed=true;
  const base={notePage,header,statusPanel,canLeave};
  notePage=function(){return S.view==='templates'?page():base.notePage();};header=function(){return S.view==='templates'?'':base.header();};statusPanel=function(){return S.view==='templates'?'':base.statusPanel();};
  canLeave=function(){
   if(S.view==='templates'){
    if(V.mode==='calendar'&&!root.StudySchedule.canLeave())return false;
    if(working()||chat().recording){fail('请等待整理完成，或结束口述。');return false;}
    if(dirty()){fail('请先保存或取消模板修改。');return false;}
   }
   return base.canLeave();
  };
  document.addEventListener('click',async event=>{
   const node=event.target.closest('[data-settings-action="mode"]');if(!node||working())return;
   event.preventDefault();event.stopImmediatePropagation();const mode=node.dataset.mode;if(mode===V.mode){if(mode==='calendar')root.AcademicCalendar.toggleSidebar();else{V.templatesExpanded=!V.templatesExpanded;paint();}return;}
   if(!canLeave())return;if(mode==='calendar')await root.StudySchedule.prepare();V.mode=mode;paint();
  },true);
  document.addEventListener('pointerdown',event=>{document.querySelectorAll('.settings-action-menu[open]').forEach(menu=>{if(!menu.contains(event.target))menu.removeAttribute('open');});},true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')document.querySelectorAll('.settings-action-menu[open]').forEach(menu=>menu.removeAttribute('open'));});
  document.addEventListener('input',event=>{
   const field=event.target.dataset?.templateField;if(!field||S.view!=='templates')return;
   if(field==='message')chat().message=event.target.value;
   else {V.draft[field]=event.target.value;V.notice='';refreshSave();if(field==='name'){const tab=document.querySelector('.template-pending');if(tab)tab.textContent=V.draft.name||'新模板';}}
  });
  document.addEventListener('click',async event=>{
   const button=event.target.closest('[data-template-action]');if(!button)return;
   event.preventDefault();event.stopImmediatePropagation();const action=button.dataset.templateAction;button.closest('.settings-action-menu')?.removeAttribute('open');
   if(action==='ai-toggle'){V.aiOpen=!V.aiOpen;if(!V.aiOpen)stopVoice();paint();return;}
   if(action==='open'){await open();return;}
   if(working())return;
   try{
    if(action==='manual-edit'){document.querySelector('[data-template-field="prompt"]')?.focus();}
    else if(action==='edit-ai'){V.aiOpen=true;paint();document.querySelector('[data-template-field="message"]')?.focus();}
    else if(action==='select'||action==='new'){
     if(chat().recording){fail('请先结束口述。');return;}
     if(dirty()){fail('请先保存或取消模板修改。');return;}
     V.selected=action==='new'?'':button.dataset.id;V.draft=action==='new'?{name:'',prompt:''}:draftOf(selected());V.error='';V.notice='';V.undo=null;
     if(action==='new'){V.chats.new=null;V.aiOpen=true;}
     paint();if(action==='new')document.querySelector('[data-template-field="name"]')?.focus();
    }else if(action==='cancel'){
     const doc=await api('/api/templates');V.data=doc;rememberChoices(doc);if(!selected())V.selected=doc.templates[0].id;
     V.draft=draftOf(selected());V.error='';V.notice='';V.undo=null;paint();
    }else if(action==='attach')document.getElementById('template-attachments')?.click();
    else if(action==='remove-file'){chat().files.splice(Number(button.dataset.index),1);paint();}
    else if(action==='send')await send();
    else if(action==='voice')voice();
    else if(action==='apply'){
     const proposal=chat().proposal;if(!proposal)return;
     V.undo=draftOf(V.draft);V.draft.prompt=proposal.prompt;if(!V.selected&&!V.draft.name.trim())V.draft.name=proposal.name;
     V.error='';V.notice='';paint();
    }else if(action==='undo'&&V.undo){V.draft=V.undo;V.undo=null;paint();}
   }catch(error){fail(error.message);}
  },true);
  document.addEventListener('change',async event=>{
   if(event.target.id!=='template-attachments')return;
   const state=chat(),incoming=[...event.target.files];
   if(state.files.length+incoming.length>3){state.error='每次最多添加 3 份附件。';paint();return;}
   if(incoming.some(file=>file.size>5*1024*1024)){state.error='每份附件最多 5 MB。';paint();return;}
   V.loading=true;
   try{const read=await Promise.all(incoming.map(async file=>({filename:file.name,file:await readUpload(file)})));state.files.push(...read);state.error='';}
   catch(error){state.error=error.message;}
   finally{V.loading=false;paint();}
  });
  document.addEventListener('keydown',event=>{
   if(event.target.dataset?.templateField==='message'&&(event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();event.stopImmediatePropagation();send();}
  },true);
  document.addEventListener('submit',async event=>{
   if(event.target.id!=='learning-template-form')return;event.preventDefault();event.stopImmediatePropagation();if(working())return;
   if(!V.draft.name.trim()||!V.draft.prompt.trim()){fail('请填写模板名称和 Prompt。');return;}
   V.saving=true;V.error='';paint();
   try{
    const doc=await api('/api/templates',{id:V.selected,etag:V.data.etag,template:V.draft});const previous=V.selected||'new';V.data=doc;V.selected=doc.saved_id;rememberChoices(doc);V.draft=draftOf(selected());V.undo=null;V.notice='已保存';
    if(previous==='new'){V.chats[V.selected]=V.chats.new;V.chats.new=null;}
   }catch(error){V.error=error.message;}
   finally{V.saving=false;paint();}
  },true);
  window.addEventListener('beforeunload',event=>{if(S.view==='templates'&&(working()||(V.mode==='calendar'&&(root.StudySchedule.dirty()||root.StudySchedule.busy()))||dirty()||chat().recording||chat().message.trim()||chat().files.length)){event.preventDefault();event.returnValue='';}});
 }
 root.StudyTemplates={install,open,prepare,options,suggestImport,actionMenuMarkup};
})(typeof window==='undefined'?{}:window);
