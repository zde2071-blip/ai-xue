/* Free prompts, custom types, and one assistant for importing or revising them. */
(function(root){
 'use strict';
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const defaults=[{id:'concepts',name:'知识点总结'},{id:'solutions',name:'题目讲解'}];
 function draftOf(value){return {name:value.name||'',prompt:value.prompt||''};}
 function changed(template,draft){return JSON.stringify(draftOf(template||{}))!==JSON.stringify(draft);}
 function promptMarkup(draft,isNew=false){return `${isNew?`<input class="template-name" data-template-field="name" aria-label="模板名称" placeholder="模板名称" value="${escape(draft.name)}" maxlength="60" required>`:''}<textarea class="template-prompt" data-template-field="prompt" aria-label="模板 Prompt" placeholder="写下你的学习要求，或让右侧 AI 帮你整理…" maxlength="40000" spellcheck="false">${escape(draft.prompt)}</textarea>`;}
 function choicesMarkup(choices,selected='',automatic=false){return `${automatic?'<option value="">自动选择</option>':''}${choices.map(row=>`<option value="${escape(row.id)}" ${row.id===selected?'selected':''}>${escape(row.name)}</option>`).join('')}`;}
 function historyFor(messages){return messages.slice(-10).map(message=>({role:message.role,content:message.content}));}
 function scopedProposal(proposal,key){return {...proposal,groups:Object.fromEntries(['course','class_type','weeks'].map(name=>[name,name===key?proposal.groups?.[name]||[]:[]])),note_types:key==='note_kind'?proposal.note_types||[]:[]};}
 function actionMenuMarkup(label,manual,ai,{glyph=()=>'',className='',ariaLabel=label,triggerIcon='plus'}={}){
  return `<details class="settings-action-menu ${className}"><summary class="outline-button" aria-label="${escape(ariaLabel)}">${glyph(triggerIcon)}<span>${escape(label)}</span>${glyph('chevron-down')}</summary><div class="settings-action-options">${[manual,ai].map(item=>`<button type="button" ${item.attributes}>${glyph(item.icon)}<span>${escape(item.label)}</span></button>`).join('')}</div></details>`;
 }
 const propertyNames={course:'课程归属',class_type:'课程类型',weeks:'教学周',note_kind:'笔记类型'};
 if(typeof module!=='undefined'&&module.exports){module.exports={draftOf,changed,promptMarkup,choicesMarkup,historyFor,addOptions,navigationMarkup,actionMenuMarkup,scopedProposal};return;}
 function addOptions(key,text){
  if(key!=='weeks')return text.split(/[,，、\n]/).map(v=>v.trim()).filter(Boolean);
  const out=[];
  for(const part of text.trim().split(/[,，、\s]+/)){
   const m=part.match(/^(\d+)(?:[-–—~至](\d+))?$/);if(!m||Number(m[1])<1||Number(m[2]||m[1])>60||Number(m[2]||m[1])<Number(m[1]))throw new Error('教学周请填写 1–60，可用 1–16 这样的范围。');
   for(let i=Number(m[1]);i<=Number(m[2]||m[1]);i++)out.push(String(i));
  }
  return [...new Set(out)];
 }
 let installed=false,recognizer=null;
 const Q={doc:null,groups:null,noteTypes:[],ai:null,aiContexts:{},aiContext:'information:class_type',aiOpen:false,pending:{},key:'class_type',saving:false,error:'',notice:''};
 const settingsDirty=()=>!!Q.doc&&(JSON.stringify(Q.groups)!==JSON.stringify(Q.doc.groups)||JSON.stringify(Q.noteTypes)!==JSON.stringify(Q.doc.note_types));
 const V={mode:'information',owner:null,data:null,selected:'concepts',draft:null,saving:false,loading:false,error:'',notice:'',aiOpen:false,chats:{},undo:null};
 const selected=()=>V.data?.templates.find(row=>row.id===V.selected);
 const dirty=()=>!!V.draft&&(!V.selected||changed(selected(),V.draft));
 const chat=()=>V.chats[V.selected||'new']||(V.chats[V.selected||'new']={messages:[],message:'',files:[],proposal:null,busy:false,recording:false,error:''});
 const working=()=>V.saving||V.loading||Q.saving||Q.ai?.busy||chat().busy;
 function rememberChoices(doc){S.templates=doc.templates.map(({id,name})=>({id,name}));}
 async function prepare(){try{const doc=await api('/api/templates');rememberChoices(doc);return doc;}catch{return null;}}
 function options(id='',automatic=false){return choicesMarkup(S.templates?.length?S.templates:defaults,id,automatic);}
 function panelMarkup(){
  const state=chat(),speechSupported=!!(root.SpeechRecognition||root.webkitSpeechRecognition);
  return `<aside class="template-ai" aria-label="模板 AI 助手"><header><span>${icon('sparkles')}AI 整理</span><button type="button" class="icon-button" data-template-action="ai-toggle" aria-label="收起 AI 整理" title="收起">${icon('x')}</button></header><div class="template-ai-history" aria-live="polite">${state.messages.map(message=>`<div class="template-ai-message ${message.role}">${escape(message.content)}</div>`).join('')}${state.proposal?`<section class="template-proposal"><details><summary>查看整理结果</summary><pre>${escape(state.proposal.prompt)}</pre></details><button type="button" class="outline-button" data-template-action="apply">应用到 Prompt</button></section>`:''}${state.busy?'<p class="template-ai-working" role="status">正在整理…</p>':''}</div><div class="template-ai-composer"><div class="template-attachments">${state.files.map((file,i)=>`<span>${icon('file-text')}<span>${escape(file.filename)}</span><button type="button" class="icon-button" data-template-action="remove-file" data-index="${i}" aria-label="移除附件 ${escape(file.filename)}">${icon('x')}</button></span>`).join('')}</div><textarea data-template-field="message" aria-label="告诉 AI 你的模板要求" rows="3" maxlength="40000" placeholder="粘贴模板，或说说你想怎么学…" ${state.busy?'disabled':''}>${escape(state.message)}</textarea><div class="template-ai-tools"><button type="button" class="icon-button" data-template-action="attach" aria-label="导入到 AI 整理" title="添加文件" ${state.busy?'disabled':''}>${icon('paperclip')}</button><button type="button" class="icon-button ${state.recording?'recording':''}" data-template-action="voice" aria-label="${state.recording?'结束口述':'口述模板要求'}" title="${speechSupported?'口述，由浏览器转写':'当前浏览器不支持语音转写，可使用系统听写输入'}" ${!speechSupported||state.busy?'disabled':''}>${icon(state.recording?'square':'mic')}</button><span></span><button type="button" class="template-send" data-template-action="send" aria-label="发送给 AI 整理" title="发送" ${state.busy||state.recording?'disabled':''}>${icon('arrow-up')}</button></div><input type="file" id="template-attachments" aria-label="选择模板参考文件" accept=".md,.txt,.json,.yaml,.yml,.pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp" multiple hidden><p class="template-ai-error" role="alert" ${state.error?'':'hidden'}>${escape(state.error)}</p></div></aside>`;
 }
 function navigationMarkup(mode,key,templates,selected,draftName='',glyph=()=> ''){
  return `<aside class="study-settings-nav" aria-label="学习设置二级导航"><nav>${[['academic','calendar-days','学期管理'],['information','tags','详细信息'],['prompts','text-cursor-input','学习 Prompt']].map(([id,name,label])=>`<button type="button" data-settings-action="mode" data-mode="${id}" class="settings-section ${mode===id?'selected':''}" aria-pressed="${mode===id}">${glyph(name)}<span>${label}</span></button>`).join('')}</nav></aside>`;
 }
 function useAIContext(mode){const key=mode==='academic'?'academic':'information:'+Q.key;if(Q.aiContext!==key){Q.aiContexts[Q.aiContext]=Q.ai;Q.ai=Q.aiContexts[key]||null;Q.aiContext=key;}Q.aiOpen=false;}
 function settingsAI(){return Q.ai||(Q.ai={messages:[],message:'',files:[],references:[],proposal:null,busy:false,error:''});}
 function proposalMarkup(proposal){
  if(!proposal)return '';
  if(V.mode==='academic')return `<section class="settings-recognition-results">${(proposal.terms||[]).map(t=>`<div><span>${escape(root.StudyAcademic.label(root.StudyAcademic.keyOf(t),{terms:proposal.terms}))}</span></div>`).join('')}${proposal.terms?.length?'<button type="button" class="outline-button" data-settings-action="apply-ai">应用到学期</button>':''}</section>`;
  proposal=scopedProposal(proposal,Q.key);const groups={...proposal.groups,note_kind:proposal.note_types};
  return `<section class="settings-recognition-results">${Object.entries(propertyNames).filter(([key])=>groups[key]?.length).map(([key,label])=>`<div><h3>${label}</h3><div>${groups[key].map(value=>{const source=proposal.evidence[key]?.find(row=>String(row.value)===String(value));return `<span title="${escape(source?source.source+'：'+source.quote:'')}">${escape(key==='weeks'?'Week '+value:value)}</span>`;}).join('')}</div></div>`).join('')}${Object.values(groups).some(values=>values?.length)?'<button type="button" class="outline-button" data-settings-action="apply-ai">应用到设置</button>':''}</section>`;
 }
 function settingsAIPanel(){
  const state=settingsAI(),academic=V.mode==='academic',hint=academic?'导入课表、校历，或描述要添加的学期…':'导入文件，或描述要添加的'+propertyNames[Q.key]+'…';
  return `<aside class="template-ai settings-ai" aria-label="设置 AI 助手"><header><span>${icon('sparkles')}AI 识别</span><button type="button" class="icon-button" data-settings-action="ai-toggle" aria-label="收起 AI 识别">${icon('x')}</button></header><div class="template-ai-history" aria-live="polite">${state.messages.map(row=>`<div class="template-ai-message ${row.role}">${escape(row.display||row.content)}</div>`).join('')}${proposalMarkup(state.proposal)}${state.busy?'<p role="status" class="template-ai-working">正在识别…</p>':''}</div><div class="template-ai-composer"><div class="template-attachments">${state.files.map((file,index)=>`<span>${icon('file-text')}<span>${escape(file.filename)}</span><button type="button" class="icon-button" data-settings-action="remove-file" data-index="${index}" aria-label="移除参考文件 ${escape(file.filename)}">${icon('x')}</button></span>`).join('')}</div><textarea data-settings-message aria-label="设置识别要求" rows="3" maxlength="6000" placeholder="${escape(hint)}" ${state.busy?'disabled':''}>${escape(state.message)}</textarea><div class="template-ai-tools"><button type="button" class="icon-button" data-settings-action="attach" aria-label="导入课表或校历" title="添加文件" ${state.busy?'disabled':''}>${icon('paperclip')}</button><span></span><button type="button" class="template-send" data-settings-action="send-ai" aria-label="识别学习设置" title="发送" ${state.busy?'disabled':''}>${icon('arrow-up')}</button></div><input type="file" id="settings-reference-files" accept=".md,.txt,.json,.yaml,.yml,.pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp" multiple hidden><p class="template-ai-error" role="alert" ${state.error?'':'hidden'}>${escape(state.error)}</p></div></aside>`;
 }
 function settingsPage(){
  const key=Q.key,notes=key==='note_kind',values=notes?Q.noteTypes:Q.groups[key],label=propertyNames[key];
  return `<header class="settings-fields-bar"><nav aria-label="详细信息设置字段">${Object.entries(propertyNames).map(([id,name])=>`<button type="button" data-settings-action="category" data-key="${id}" class="${id===key?'selected':''}" aria-pressed="${id===key}">${name}</button>`).join('')}</nav><div class="settings-operation-group">${actionMenuMarkup('添加',{label:'手动添加',icon:'plus',attributes:'data-settings-action="add"'},{label:'用 AI 识别',icon:'sparkles',attributes:'data-settings-action="add-ai"'},{glyph:icon,ariaLabel:'添加'+label})}</div></header><div class="property-settings-layout ${Q.aiOpen?'with-ai':''}"><form id="property-settings-form"><fieldset ${Q.saving?'disabled':''}><div class="property-option-list">${values.map((row,index)=>{const value=notes?row.name:row;return `<div class="property-option-row">${key==='weeks'?'<span>Week</span>':''}<input data-setting-index="${index}" aria-label="${label}选项 ${index+1}" placeholder="${key==='weeks'?'如 1–16':label}" value="${escape(value)}" maxlength="${key==='course'?150:key==='weeks'?100:60}">${notes?row.id?`<button type="button" class="icon-button" data-settings-action="edit-prompt" data-id="${escape(row.id)}" aria-label="编辑 ${escape(row.name)} 的 Prompt" title="编辑 Prompt">${icon('square-pen')}</button>`:`<button type="button" class="icon-button" data-settings-action="remove" data-index="${index}" aria-label="移除新笔记类型">${icon('x')}</button>`:`<button type="button" class="icon-button" data-settings-action="remove" data-index="${index}" aria-label="移除 ${escape(key==='weeks'?'Week '+value:value||'新'+label)}" title="移出可选项">${icon('x')}</button>`}</div>`;}).join('')}</div></fieldset><p id="property-settings-error" class="template-error" role="alert" ${Q.error?'':'hidden'}>${escape(Q.error)}</p><p class="property-settings-notice" role="status" ${Q.notice?'':'hidden'}>${escape(Q.notice)}</p><footer class="property-settings-actions template-actions" ${settingsDirty()?'':'hidden'}><button type="button" class="outline-button" data-settings-action="cancel" ${Q.saving?'disabled':''}>取消</button><button type="submit" class="primary" ${Q.saving?'disabled':''}>${Q.saving?'保存中…':'保存'}</button></footer></form>${Q.aiOpen?settingsAIPanel():''}</div>`;
 }
 function promptPage(){
  if(!V.data||!V.draft)return '';
  const isNew=!V.selected;
  return `<div class="template-tabs-row"><nav class="template-tabs" aria-label="学习模板">${V.data.templates.map(row=>`<button type="button" data-template-action="select" data-id="${escape(row.id)}" class="${row.id===V.selected?'selected':''}" aria-pressed="${row.id===V.selected}" title="${escape(row.name)}">${escape(row.name)}</button>`).join('')}${isNew?`<button type="button" class="selected template-pending" aria-pressed="true">${escape(V.draft.name||'新模板')}</button>`:''}</nav><div class="settings-operation-group">${actionMenuMarkup('编辑 Prompt',{label:'手动编辑',icon:'square-pen',attributes:'data-template-action="manual-edit"'},{label:'用 AI 整理',icon:'sparkles',attributes:'data-template-action="edit-ai"'},{glyph:icon,className:'prompt-edit-menu',ariaLabel:'编辑当前 Prompt',triggerIcon:'square-pen'})}</div></div><div class="template-workspace ${V.aiOpen?'with-ai':''}"><form id="learning-template-form" aria-busy="${V.saving}">${V.undo?'<div class="template-editor-tools"><button type="button" class="outline-button" data-template-action="undo">撤销应用</button></div>':''}<fieldset ${V.saving?'disabled':''}>${promptMarkup(V.draft,isNew)}</fieldset><div class="template-save-area"><p id="template-error" class="template-error" role="alert" ${V.error?'':'hidden'}>${escape(V.error)}</p><p class="template-notice" role="status" ${V.notice?'':'hidden'}>${escape(V.notice)}</p><footer class="template-actions" ${dirty()?'':'hidden'}><button type="button" class="outline-button" data-template-action="cancel" ${V.saving?'disabled':''}>取消</button><button type="submit" class="primary" ${V.saving?'disabled':''}>${V.saving?'保存中…':'保存'}</button></footer></div></form>${V.aiOpen?panelMarkup():''}</div>`;
 }
 function page(){
  if(!V.data||!V.draft)return '';
  return `<section class="study-settings-shell">${navigationMarkup(V.mode,Q.key,V.data.templates,V.selected,V.draft.name,icon)}<div class="template-page study-settings-content">${V.mode==='academic'?`<div class="academic-settings-layout ${Q.aiOpen?'with-ai':''}">${root.StudyAcademic?.settingsMarkup()||''}${Q.aiOpen?settingsAIPanel():''}</div>`:V.mode==='information'?settingsPage():promptPage()}</div></section>`;
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
 async function open(mode='information',category='class_type'){
  if(S.busy||S.threadBusy||!canLeave())return;
  const owner=S.user?.id;
  try{
   const [doc,settings]=await Promise.all([api('/api/templates'),api('/api/learning-settings')]);if(S.user?.id!==owner)return;
   if(V.owner!==owner){V.owner=owner;V.selected='concepts';V.chats={};V.aiOpen=false;Q.ai=null;Q.aiContexts={};Q.aiContext='information:class_type';Q.aiOpen=false;}
   V.data=doc;rememberChoices(doc);Q.key=Object.hasOwn(propertyNames,category)?category:'class_type';useAIContext(mode);V.mode=mode;Q.doc=settings;Q.groups=JSON.parse(JSON.stringify(settings.groups));Q.noteTypes=JSON.parse(JSON.stringify(settings.note_types));Q.pending={};Q.error='';Q.notice='';
   if(!selected())V.selected=doc.templates[0].id;
   V.draft=draftOf(selected());V.error='';V.notice='';V.undo=null;
   if(mode==='academic')await root.StudyAcademic?.prepareSettings();if(S.user?.id!==owner)return;
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
    if(V.mode==='academic'&&!root.StudyAcademic?.canLeaveSettings())return false;
    if(working()||chat().recording){fail('请等待整理完成，或结束口述。');return false;}
    if(settingsDirty()){Q.error='请先保存或取消设置修改。';const el=document.getElementById('property-settings-error');if(el){el.hidden=false;el.textContent=Q.error;}return false;}
    if(dirty()){fail('请先保存或取消 Prompt 修改。');return false;}
   }
   return base.canLeave();
  };
  function settingsError(message){Q.error=message;const el=document.getElementById('property-settings-error');if(el){el.hidden=!message;el.textContent=message;}}
  function settingsRefresh(){Q.notice='';const footer=document.querySelector('.property-settings-actions');if(footer)footer.hidden=!settingsDirty();const notice=document.querySelector('.property-settings-notice');if(notice)notice.hidden=true;}
  function addSetting(){
   const notes=Q.key==='note_kind',values=notes?Q.noteTypes:Q.groups[Q.key];let index=values.findIndex(row=>!(notes?row.name:row).trim());
   if(index<0){index=values.length;values.push(notes?{id:'',name:''}:'');}
   Q.error='';Q.notice='';paint();document.querySelector(`[data-setting-index="${index}"]`)?.focus();
  }
  async function sendSettingsAI(){
   const state=settingsAI();if(working())return;
   if(!state.message.trim()&&!state.files.length){state.error='请添加文件或描述要求。';paint();return;}
   const references=[...new Map([...state.references,...state.files].map(file=>[file.filename,file])).values()];
   if(references.length>3){state.error='一轮识别最多使用 3 份参考文件。';paint();return;}
   const request=state.message,files=[...state.files],owner=S.user?.id;state.busy=true;state.error='';paint();
   try{
    const academic=V.mode==='academic';
    const result=await api(academic?'/api/academic-settings/assist':'/api/learning-settings/assist',{request,target:academic?null:Q.key,attachments:references,history:state.messages.slice(-8).map(row=>({role:row.role,content:row.display||row.content})),current:academic?root.StudyAcademic.recognitionCurrent():{groups:Object.fromEntries(['course','class_type','weeks'].map(key=>[key,Q.groups[key]])),note_types:Q.noteTypes.map(row=>row.name),proposal:state.proposal?{groups:state.proposal.groups,note_types:state.proposal.note_types}:null}});
    if(S.user?.id!==owner)return;
    state.messages.push({role:'user',content:[request,...files.map(file=>'附件：'+file.filename)].filter(Boolean).join('\n')},{role:'assistant',content:JSON.stringify(result),display:result.reply});
    state.references=references;state.proposal=result;state.message='';state.files=[];
   }catch(error){state.error=error.message;}
   finally{state.busy=false;paint();document.querySelector('.settings-ai .template-ai-history')?.scrollTo({top:100000});}
  }
  function applySettingsAI(){
   let proposal=settingsAI().proposal;if(!proposal)return;
   if(V.mode==='academic'){try{root.StudyAcademic.applyRecognition(proposal);Q.error='';paint();}catch(error){settingsAI().error=error.message;paint();}return;}
   proposal=scopedProposal(proposal,Q.key);
   for(const key of ['course','class_type','weeks']){
    const seen=new Set(Q.groups[key].map(value=>String(value).trim().toLocaleLowerCase()));
    for(const value of proposal.groups[key]||[])if(!seen.has(String(value).toLocaleLowerCase())){Q.groups[key].push(String(value));seen.add(String(value).toLocaleLowerCase());}
   }
   const names=new Set(Q.noteTypes.map(row=>row.name.toLocaleLowerCase()));
   for(const name of proposal.note_types||[])if(!names.has(name.toLocaleLowerCase())){Q.noteTypes.push({id:'',name});names.add(name.toLocaleLowerCase());}
   Q.error='';Q.notice='';paint();
  }
  document.addEventListener('input',event=>{
   if(event.target.matches('[data-settings-message]')){settingsAI().message=event.target.value;return;}
   if(event.target.dataset.settingIndex===undefined||S.view!=='templates')return;
   if(Q.key==='note_kind')Q.noteTypes[Number(event.target.dataset.settingIndex)].name=event.target.value;else Q.groups[Q.key][Number(event.target.dataset.settingIndex)]=event.target.value;settingsRefresh();
  });
  document.addEventListener('click',async event=>{
   const button=event.target.closest('[data-settings-action]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();if(working())return;
   try{
    const action=button.dataset.settingsAction;button.closest('.settings-action-menu')?.removeAttribute('open');
    if(action==='mode'){
     if(V.mode===button.dataset.mode)return;
     if(V.mode==='academic'&&!root.StudyAcademic?.canLeaveSettings())return;
     if(settingsDirty()){settingsError('请先保存或取消设置修改。');return;}
     if(dirty()||chat().recording){fail(chat().recording?'请先结束口述。':'请先保存或取消 Prompt 修改。');return;}
     if(button.dataset.mode==='academic')await root.StudyAcademic?.prepareSettings();
     useAIContext(button.dataset.mode);V.mode=button.dataset.mode;paint();
    }else if(action==='category'){Q.key=button.dataset.key;useAIContext('information');Q.error='';Q.notice='';paint();}
    else if(action==='ai-toggle'){Q.aiOpen=!Q.aiOpen;paint();}
    else if(action==='add-ai'){Q.aiOpen=true;paint();document.querySelector('[data-settings-message]')?.focus();}
    else if(action==='attach')document.getElementById('settings-reference-files')?.click();
    else if(action==='remove-file'){settingsAI().files.splice(Number(button.dataset.index),1);paint();}
    else if(action==='send-ai')await sendSettingsAI();
    else if(action==='apply-ai')applySettingsAI();
    else if(action==='edit-prompt'){
     if(settingsDirty()){settingsError('请先保存或取消设置修改。');return;}
     V.selected=button.dataset.id;V.draft=draftOf(selected());V.mode='prompts';V.error='';V.notice='';V.undo=null;paint();
    }
    else if(action==='add')addSetting();
    else if(action==='remove'){(Q.key==='note_kind'?Q.noteTypes:Q.groups[Q.key]).splice(Number(button.dataset.index),1);Q.error='';Q.notice='';paint();}
    else if(action==='cancel'){const doc=await api('/api/learning-settings');Q.doc=doc;Q.groups=JSON.parse(JSON.stringify(doc.groups));Q.noteTypes=JSON.parse(JSON.stringify(doc.note_types));Q.pending={};Q.error='';Q.notice='';paint();}
   }catch(error){settingsError(error.message);}
  },true);
  document.addEventListener('pointerdown',event=>{document.querySelectorAll('.settings-action-menu[open]').forEach(menu=>{if(!menu.contains(event.target))menu.removeAttribute('open');});},true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')document.querySelectorAll('.settings-action-menu[open]').forEach(menu=>menu.removeAttribute('open'));});
  document.addEventListener('submit',async event=>{
   if(event.target.id!=='property-settings-form')return;event.preventDefault();event.stopImmediatePropagation();if(working())return;
   Q.saving=true;Q.error='';paint();
   try{const doc=await api('/api/learning-settings',{etag:Q.doc.etag,groups:{...Q.groups,weeks:Q.groups.weeks.flatMap(value=>addOptions('weeks',String(value)))},note_types:Q.noteTypes,templates_etag:Q.doc.templates_etag});Q.doc=doc;Q.groups=JSON.parse(JSON.stringify(doc.groups));Q.noteTypes=JSON.parse(JSON.stringify(doc.note_types));S.tag_catalog=await api('/api/tags');V.data=await api('/api/templates');rememberChoices(V.data);V.draft=draftOf(selected());Q.notice='已保存';}
   catch(error){Q.error=error.message;}
   finally{Q.saving=false;paint();}
  },true);
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
     if(dirty()){fail('请先保存或取消 Prompt 修改。');return;}
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
   if(event.target.id!=='settings-reference-files')return;
   const state=settingsAI(),files=[...event.target.files];
   if(state.files.length+files.length>3||files.some(file=>file.size>5*1024*1024)){state.error='每次最多 3 份文件，每份不超过 5 MB。';paint();return;}
   V.loading=true;
   try{state.files.push(...await Promise.all(files.map(async file=>({filename:file.name,file:await readUpload(file)}))));state.error='';}catch(error){state.error=error.message;}finally{V.loading=false;paint();}
  });
  document.addEventListener('keydown',event=>{if(event.target.matches('[data-settings-message]')&&(event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();event.stopImmediatePropagation();sendSettingsAI();}},true);
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
    const doc=await api('/api/templates',{id:V.selected,etag:V.data.etag,template:V.draft});const previous=V.selected||'new';V.data=doc;V.selected=doc.saved_id;rememberChoices(doc);V.draft=draftOf(selected());V.undo=null;V.notice='已保存';Q.doc.note_types=doc.templates.map(({id,name})=>({id,name}));Q.doc.templates_etag=doc.etag;Q.noteTypes=JSON.parse(JSON.stringify(Q.doc.note_types));
    if(previous==='new'){V.chats[V.selected]=V.chats.new;V.chats.new=null;}
   }catch(error){V.error=error.message;}
   finally{V.saving=false;paint();}
  },true);
  window.addEventListener('beforeunload',event=>{if(S.view==='templates'&&(working()||(V.mode==='academic'&&(root.StudyAcademic?.dirty()||root.StudyAcademic?.busy()))||settingsDirty()||dirty()||Object.values(Q.aiContexts).some(state=>state&&(state.busy||state.message.trim()||state.files.length))||Q.ai?.message.trim()||Q.ai?.files.length||chat().recording||chat().message.trim()||chat().files.length)){event.preventDefault();event.returnValue='';}});
 }
 root.StudyTemplates={install,open,prepare,options,actionMenuMarkup,openAcademicAI(){if(V.mode!=='academic'||working())return;Q.aiOpen=true;paint();document.querySelector('[data-settings-message]')?.focus();}};
})(typeof window==='undefined'?{}:window);
