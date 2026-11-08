/* Navigation is a view over learning records, not the storage hierarchy. */
(function(root){
 'use strict';
 const dimensions={course:'课程',week:'周次',type:'课堂类型',session:'课次',chapter:'章节',kind:'资料类型',topic:'主题'};
 const displayLabels={course:'课程',week:'周次',type:'课堂类型',session:'课次',chapter:'章节',topic:'主题',kind:'资料类型'};
 const sessionLabel=(s,row)=>s.number!=null?`${s.class_type||row.class_type||'课次'} ${s.number}`:'';
 const kindLabels={originals:'原始文件',notes:'笔记',exercises:'练习题'};
 const stages={highschool:'高中',university:'大学',postgraduate:'研究生'};
 const natural=(a,b)=>String(a).localeCompare(String(b),'zh-CN',{numeric:true});
 function scopeKey(a){return a&&stages[a.stage]&&Number.isSafeInteger(a.year)&&a.year>0&&Number.isSafeInteger(a.semester)&&a.semester>0?`${a.stage}|${a.year}|${a.semester}`:'unassigned';}
 function scopeLabel(key){const [stage,year,semester]=key.split('|');return key==='all'?'全部学期':key==='unassigned'?'待归档':`${stages[stage]} · Year ${year} · Semester ${semester}`;}
 function entriesFor(mode,courses,resources){
  const byId=new Map(courses.map(c=>[c.id,c]));
  const origins=new Set(courses.filter(c=>resources.some(r=>r.id==='source-'+c.id)).map(c=>c.origin_material_id).filter(Boolean));
  return resources.filter(r=>!['timetable','syllabus'].includes(r.role)&&!origins.has(r.id)&&(mode==='review'?(!!r.note_id||r.kind==='notes'):(!r.note_id&&r.kind!=='notes'))).map(r=>{
   const c=byId.get(r.unit_id||r.course_id),linked=!!r.unit_id||!!r.note_id||r.id==='source-'+c?.id||r.study_source===true;
   const tags=r.tags||(linked&&c?.tags?c.tags:null);
   return {...r,unit_id:r.unit_id||(linked?c?.id:null),sessions:r.sessions||c?.sessions||[],course:tags?tags.course||'':c?.course_label||r.course_title||'',weeks:tags?tags.weeks||[]:r.weeks?.length?r.weeks:r.week!=null?[r.week]:[],class_type:tags?tags.class_type||'':r.class_type||'',chapter:tags?tags.chapter||'':r.chapter||'',topic:tags?tags.topic||'':r.topic||'',custom:tags?.custom||[],academic:c?.academic||null,status:c?.status||'',completed:c?.completed?.length||0,total:c?.blocks?.length||0};
  });
 }
 function valuesFor(row,key,context={}){
  if(!Object.hasOwn(dimensions,key))return [];
  const allSessions=row.sessions||[],has=key=>Object.hasOwn(context,key);
  const sessions=allSessions.filter(s=>(!has('week')||String(s.week??'')===context.week)&&(!has('type')||String(s.class_type||row.class_type||'')===context.type)&&(!has('session')||sessionLabel(s,row)===context.session));
  if(key==='session'){const labels=sessions.map(s=>sessionLabel(s,row));return labels.length?[...new Set(labels)]:[''];}
  if(key==='week'){
   if(allSessions.length&&(has('session')||has('type'))){const paired=sessions.map(s=>s.week==null?'':String(s.week));return paired.length?[...new Set(paired)]:[''];}
   const weeks=[...(row.weeks||[]).map(String),...allSessions.map(s=>s.week==null?'':String(s.week))];return weeks.length?[...new Set(weeks)]:[''];
  }
  if(key==='type'&&allSessions.length){const types=sessions.map(s=>s.class_type||row.class_type||'');return types.length?[...new Set(types)]:[''];}
  return [String(key==='type'?row.class_type:key==='kind'?row.kind:row[key]||'')];
 }
 function visibleTags(row,keys){return keys.filter(key=>Object.hasOwn(displayLabels,key)).flatMap(key=>{const values=key==='topic'?[row.topic]:valuesFor(row,key);return values.filter(v=>v!==''&&v!=null).map(v=>({key,label:key==='week'?'Week '+v:key==='kind'?kindLabels[v]||v:String(v)}));}).filter((tag,i,all)=>all.findIndex(t=>t.label===tag.label)===i);}
 function compareRows(a,b,key){
  if(key==='recent')return String(b.created_at||'').localeCompare(a.created_at||'')||natural(a.title,b.title);
  if(key==='name')return natural(a.title,b.title);
  const av=valuesFor(a,key).filter(Boolean).sort(natural)[0]||'',bv=valuesFor(b,key).filter(Boolean).sort(natural)[0]||'';
  return (av===''&&bv!==''?1:bv===''&&av!==''?-1:natural(av,bv))||natural(a.title,b.title);
 }
 function groupLabel(key,value){return value?(key==='week'?'Week '+value:key==='kind'?kindLabels[value]||value:value):({course:'未设置课程',week:'未分周',type:'未设置类型',chapter:'未设置章节',session:'未设置课次',topic:'未设置主题'}[key]||'未分类');}
 function classify(rows,order,wanted=[]){
  let visible=[...rows];const columns=[],path=[];
  for(const key of order.filter(k=>Object.hasOwn(dimensions,k))){
   const context=Object.fromEntries(columns.map((c,i)=>[c.key,path[i]]));
   const groups=new Map();for(const row of visible)for(const value of new Set(valuesFor(row,key,context))){if(!groups.has(value))groups.set(value,[]);groups.get(value).push(row);}
   const options=[...groups].sort(([a],[b])=>a===''?1:b===''?-1:natural(a,b)).map(([value,items])=>({value,label:groupLabel(key,value),count:items.length,items}));
   const chosen=options.find(g=>g.value===wanted[path.length])||options[0];
   if(!chosen)break;columns.push({key,options,selected:chosen.value});path.push(chosen.value);visible=chosen.items;
  }
  return {columns,path,rows:visible};
 }
 function toggleOrder(order,key){if(!Object.hasOwn(dimensions,key))return [...order];return order.includes(key)?order.filter(k=>k!==key):[...order,key];}
 function moveOrder(order,key,target,after=false){if(!order.includes(key)||!order.includes(target)||key===target)return [...order];const rest=order.filter(k=>k!==key);rest.splice(rest.indexOf(target)+(after?1:0),0,key);return rest;}
 function matches(row,query){const haystack=[row.title,row.filename,row.course,row.class_type,row.chapter,row.topic,...(row.sessions||[]).map(s=>sessionLabel(s,row)),...row.weeks.map(w=>'Week '+w)].join(' ').toLocaleLowerCase();return query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).every(word=>/^\d+$/.test(word)?new RegExp('(^|\\D)0*'+Number(word)+'(?!\\d)').test(haystack):haystack.includes(word));}
 function normalizeView(value){
  if(!value||typeof value!=='object')return value;
  const next={...value};
  if(Array.isArray(value.order)){
   const indexes=value.order.map((key,index)=>({key,index})).filter(({key},i,all)=>Object.hasOwn(dimensions,key)&&all.findIndex(row=>row.key===key)===i);
   next.order=indexes.map(row=>row.key);next.path=indexes.map(row=>typeof value.path?.[row.index]==='string'?value.path[row.index]:'');
  }
  if(Array.isArray(value.display))next.display=value.display.filter(key=>Object.hasOwn(displayLabels,key));
  if(value.sort==='custom')next.sort='name';
  return next;
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={dimensions,scopeKey,scopeLabel,entriesFor,valuesFor,groupLabel,classify,toggleOrder,moveOrder,matches,visibleTags,compareRows,normalizeView};return;}
 root.StudyNavigation={install(){
  const base={sidebar,header,library,loadCourse,openNote,returnToBrowser};
  let owner='',mode='learning',views={};
  const fresh=()=>({order:['course','week'],path:[],selected:'',query:'',scope:'all',sort:'name',display:['week','type'],displayEdited:false});
  function ensure(){const id=S.user?.id||'guest';if(id===owner)return;owner=id;views={learning:fresh(),review:fresh()};mode='learning';try{const saved=JSON.parse(localStorage.getItem('study-navigation-v2-'+id)||'null');if(saved){if(['learning','review'].includes(saved.mode))mode=saved.mode;for(const k of ['learning','review']){const v=normalizeView(saved[k]);if(!v)continue;if(Array.isArray(v.order))views[k].order=[...new Set(v.order.filter(d=>Object.hasOwn(dimensions,d)))];if(Array.isArray(v.path))views[k].path=v.path.filter(x=>typeof x==='string');if(typeof v.selected==='string')views[k].selected=v.selected;if(v.scope==='all'||v.scope==='unassigned'||/^(highschool|university|postgraduate)\|[1-9]\d*\|[1-9]\d*$/.test(v.scope))views[k].scope=v.scope;if(['name','recent',...Object.keys(dimensions)].includes(v.sort))views[k].sort=v.sort;if(typeof v.displayEdited==='boolean')views[k].displayEdited=v.displayEdited;if(Array.isArray(v.display))views[k].display=[...new Set(v.display.filter(d=>Object.hasOwn(displayLabels,d)))];}}else if(S.demonstration&&B.stage!=='unassigned'){const initial=scopeKey({stage:B.stage,year:B.year,semester:B.semester});views.learning.scope=initial;views.review.scope=initial;}}catch{}for(const v of Object.values(views))v.scope='all';}
  function scopeOptions(){const keys=[...entries().map(r=>scopeKey(r.academic)),...(S.academic_settings?.terms||[]).map(scopeKey)];return [...new Set(['unassigned',...keys])].sort(natural);}
  function activeMode(){ensure();return S.view==='note'||S.view==='unit-review'?'review':['learn','overview'].includes(S.view)?'learning':mode;}
  function save(){try{localStorage.setItem('study-navigation-v2-'+owner,JSON.stringify({mode,...views}));}catch{}}
  function activeView(){return views[activeMode()];}
  function entries(which=activeMode()){return entriesFor(which,S.courses,S.resources).map(r=>{const row={...r,academic:r.academic||B.academics[r.course_id]||null};return {...row,academic:root.StudyAcademic?root.StudyAcademic.resolve(row,S.academic_settings):row.academic};});}

  root.StudyLearningHome?.install({scopeKey});
  function displayedKeys(){const v=activeView();return v.displayEdited?v.display:['week','type'].filter(key=>v.query.trim()||!v.order.includes(key));}
  function browse(){const v=activeView(),all=entries();if(v.scope!=='all'&&!scopeOptions().includes(v.scope))v.scope='all';let scoped=all.filter(r=>v.scope==='all'||scopeKey(r.academic)===v.scope);scoped.sort((a,b)=>compareRows(a,b,v.sort));const tree=v.query.trim()?{columns:[],path:[],rows:scoped.filter(r=>matches(r,v.query))}:classify(scoped,v.order,v.path);if(!v.query.trim())v.path=tree.path;if(!tree.rows.some(r=>r.id===v.selected))v.selected=tree.rows[0]?.id||'';return {...tree,all,selected:tree.rows.find(r=>r.id===v.selected),query:v.query};}
  sidebar=function(){const active=S.view==='templates'?'templates':activeMode();return `<aside class="sidebar tool-rail navigation-rail" aria-label="工具导航"><nav class="sidebar-nav" aria-label="主导航">${[['learning','book-open','学习'],['review','notebook-pen','复习']].map(([key,glyph,label])=>`<button data-action="nav-mode" data-mode="${key}" class="${active===key?'active':''}" aria-label="${label}" ${active===key?'aria-current="page"':''}>${icon(glyph)}<span>${label}</span></button>`).join('')}<button data-template-action="open" class="${active==='templates'?'active':''}" aria-label="学习设置" ${active==='templates'?'aria-current="page"':''}>${icon('sliders-horizontal')}<span>学习设置</span></button></nav><div class="tool-rail-bottom"><footer class="sidebar-footer" aria-label="个人与设置"><button class="profile-button" data-action="account-menu" aria-label="个人设置" aria-haspopup="menu" aria-expanded="false"><span class="profile-avatar">${avatarMarkup(S.profile)}</span><span class="rail-account-label">个人设置</span></button></footer></div></aside>`;};
  header=function(){activeMode();return base.header().replace(/<div class="toggle-group unit-mode"[\s\S]*?<\/div>/,'').replace(/(<button class="text-button" data-action="browser-return">[\s\S]*?<\/i>)资料/,'$1返回');};
  function rowMarkup(r,selected,searching){const isNote=!!r.note_id||r.kind==='notes';return `<button class="classified-file ${selected?'selected':''}" data-action="nav-select" aria-haspopup="menu" data-id="${esc(r.id)}" aria-pressed="${selected}" aria-label="${esc(r.title)}">${icon(isNote?'notebook-pen':r.kind==='exercises'?'list-checks':'file-text')}<span><strong>${esc(r.title)}</strong>${searching?`<small>${esc([r.course||'未设置课程',r.weeks.length?'Week '+r.weeks.join(', '):'',r.class_type].filter(Boolean).join(' / '))}</small>`:''}</span><span class="classified-file-tags">${visibleTags(r,displayedKeys()).map(t=>`<span class="classified-tag" title="${esc(displayLabels[t.key])}">${esc(t.label)}</span>`).join('')}</span>${r.available===false?'<small>文件已移走</small>':''}</button>`;}
  const treeClosed=new Map();
  function reviewGroupingMarkup(order){
   const available=['course','week','type'].filter(key=>!order.includes(key));
   return [...order,...available].map((key,index)=>{
    const active=index<order.length,label=dimensions[key];
    return `<button data-action="nav-order" data-key="${key}" aria-pressed="${active}" aria-label="${active?'第 '+(index+1)+' 级，'+label:'添加'+label+'分类'}"><span class="review-grouping-rank" aria-hidden="true">${active?index+1:icon('plus')}</span><span>${label}</span></button>`;
   }).join('');
  }
  function reviewTreeMarkup(){
   ensure();const v=views.review;v.order=v.order.filter(k=>k!=='session');const rows=entries('review').filter(r=>(v.scope==='all'||scopeKey(r.academic)===v.scope)&&(!v.query.trim()||matches(r,v.query))).sort((a,b)=>compareRows(a,b,v.sort));
   function branch(items,depth=0,path=[],context={}){
    if(depth>=v.order.length||v.query.trim())return items.map(r=>`<button class="review-tree-file ${S.note?.id===r.note_id?'selected':''}" data-action="nav-select" data-id="${esc(r.id)}" aria-label="${esc(r.title)}">${icon('file-text')}<span>${esc(r.title.replace(/\.md$/i,''))}</span></button>`).join('');
    const key=v.order[depth],groups=new Map();for(const row of items)for(const value of new Set(valuesFor(row,key,context))){if(!groups.has(value))groups.set(value,[]);groups.get(value).push(row);}
    return [...groups].sort(([a],[b])=>natural(a,b)).map(([value,group])=>{const id=JSON.stringify([S.user?.id,...path,key,value]);return `<details class="review-tree-folder" data-tree-key="${esc(id)}" ${treeClosed.get(id)?'':'open'}><summary>${icon('chevron-right')}<span>${esc(groupLabel(key,value))}</span></summary><div class="review-tree-children">${branch(group,depth+1,[...path,key,value],{...context,[key]:value})}</div></details>`;}).join('');
   }
   return `<aside class="review-file-tree" aria-label="笔记目录"><header><strong>笔记</strong><details class="review-tree-settings"><summary class="icon-button" aria-label="目录分类">${icon('list-filter')}</summary><div aria-label="目录层级">${reviewGroupingMarkup(v.order)}</div></details></header><label class="review-tree-search">${icon('search')}<input id="classified-search" aria-label="搜索笔记" placeholder="搜索笔记" value="${esc(v.query)}"></label><div class="review-tree-scroll">${branch(rows)||'<p class="muted">暂无笔记</p>'}</div></aside>`;
  }
  root.StudyNavigation.reviewTreeMarkup=reviewTreeMarkup;
  document.addEventListener('toggle',event=>{const el=event.target;if(el.matches?.('[data-tree-key]')&&el.isConnected)treeClosed.set(el.dataset.treeKey,!el.open);},true);
  library=function(){const active=activeMode(),v=activeView();if(active==='learning'&&root.StudyLearningHome){if(v.scope!=='all'&&!scopeOptions().includes(v.scope))v.scope='all';return root.StudyLearningHome.markup({scope:v.scope,entries:entries()});}if(active==='review')return `<section class="review-browser">${reviewTreeMarkup()}<div class="review-empty-reading">选择一篇笔记</div></section>`;const d=browse(),isReview=active==='review';const scopes=scopeOptions(),unused=Object.keys(dimensions).filter(key=>!v.order.includes(key));
   const grouping=`<div class="classified-organization"><nav aria-label="快速分类">${v.order.map((key,index)=>`<button class="selected" data-action="nav-order" data-key="${key}" draggable="true" aria-pressed="true" aria-label="第 ${index+1} 级：${dimensions[key]}，再次点击取消" title="拖动调整分类顺序"><b>${index+1}</b><span>${dimensions[key]}</span></button>`).join('')}${unused.length?`<details class="classified-extra"><summary title="添加分类" aria-label="添加分类">${icon('plus')}<span>分类</span></summary><div class="classified-extra-popover">${unused.map(key=>`<button data-action="nav-order" data-key="${key}" aria-label="按${dimensions[key]}分类">${dimensions[key]}</button>`).join('')}</div></details>`:''}</nav></div>`;
   const listTools=`<div class="classified-list-tools"><select id="classified-sort" aria-label="排序方式"><option value="name" ${v.sort==='name'?'selected':''}>按名称</option><option value="recent" ${v.sort==='recent'?'selected':''}>最近添加</option>${Object.entries(dimensions).map(([key,label])=>`<option value="${key}" ${v.sort===key?'selected':''}>按${label}</option>`).join('')}</select><details class="classified-display"><summary class="icon-button" title="显示标签" aria-label="显示标签">${icon('sliders-horizontal')}</summary><div class="classified-display-popover" role="group" aria-label="列表显示标签"><strong>显示标签</strong>${Object.entries(displayLabels).map(([key,label])=>`<label><input type="checkbox" data-display-tag="${key}" ${displayedKeys().includes(key)?'checked':''}><span>${label}</span></label>`).join('')}</div></details></div>`;
   return `<section class="classified-browser"><header class="classified-toolbar">${grouping}<div class="classified-toolbar-right"><label class="classified-search">${icon('search')}<input id="classified-search" aria-label="搜索${isReview?'笔记':'学习资料'}" placeholder="搜索${isReview?'笔记':'资料'}" value="${esc(v.query)}">${v.query?`<button class="icon-button" data-action="nav-clear-search" aria-label="清除搜索">${icon('x')}</button>`:''}</label>${S.demonstration?'<span class="classified-demo">示例</span>':''}</div></header><div class="classified-columns ${d.query.trim()?'search-results':''}">${d.columns.map((column,depth)=>`<section class="classified-column" aria-label="${dimensions[column.key]}分类"><div class="classified-column-heading">${dimensions[column.key]}</div><div class="classified-column-scroll">${column.options.map(g=>`<button class="classified-group ${g.value===column.selected?'selected':''}" data-action="nav-group" data-depth="${depth}" data-value="${esc(g.value)}" aria-pressed="${g.value===column.selected}" title="${esc(g.label)}">${icon(depth===0?'folder':'folder-open')}<span>${esc(g.label)}</span>${icon('chevron-right')}</button>`).join('')}</div></section>`).join('')}<section class="classified-results" aria-label="${isReview?'笔记列表':'学习资料列表'}"><div class="classified-column-heading"><span>${d.query.trim()?'搜索结果':isReview?'笔记':'资料'}</span>${listTools}</div><div class="classified-column-scroll">${d.rows.map(r=>rowMarkup(r,r.id===v.selected,!!v.query.trim())).join('')||`<div class="classified-empty">${icon(isReview?'notebook-pen':'files')}<p>${v.query.trim()?'没有找到相关内容':isReview?'学完后整理的笔记会显示在这里':'导入课件，开始学习'}</p></div>`}</div></section></div></section>`;
  };
  loadCourse=async function(cid){if(!canLeave()||S.busy)return;ensure();const course=S.courses.find(c=>c.id===cid);if(course?.status==='completed'&&course.notes?.length){const latest=[...course.notes].reverse().sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')))[0];await openNote(cid,latest.id);return;}mode='learning';save();await base.loadCourse(cid);};
  openNote=async function(cid,nid){if(!canLeave()||S.busy)return;ensure();mode='review';save();await base.openNote(cid,nid);};
  returnToBrowser=async function(){ensure();mode=activeMode();if(!canLeave()||S.busy)return;await base.returnToBrowser();S.search='';save();render();};
  async function navigate(next){if(!canLeave()||S.busy)return;ensure();mode=next;S.search='';await base.returnToBrowser();save();render();}
  let openingEntry=false;
  async function openEntry(id){if(openingEntry)return;openingEntry=true;try{const row=entries().find(r=>r.id===id);if(!row||row.available===false)return;if(!canLeave()||S.busy)return;if(activeMode()==='review'){await openResource(row.id);return;}if(row.unit_id){await loadCourse(row.unit_id);return;}if(S.demonstration){await openResource(row.id);return;}if(!S.settings.connected){await showSettings();return;}await root.StudyUnits.importMaterial(row.id);}finally{openingEntry=false;}}
  async function refreshFiles(){const data=await api('/api/state');Object.assign(S,{courses:data.courses,resources:data.resources,units:data.units,tag_catalog:data.tag_catalog});if(S.course)S.course=S.courses.find(c=>c.id===S.course.id)||null;render();}
  async function renameFile(id){const row=await api('/api/library/'+encodeURIComponent(id));modalContent('重命名',`<form id="file-rename-form"><input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="version" value="${esc(row.version)}"><label class="field"><span class="field-label">名称</span><input name="name" value="${esc(row.title)}" maxlength="150" required autocomplete="off"></label><div id="file-operation-error" class="error-message" role="alert"></div><div class="modal-actions"><button type="submit" class="primary">保存</button></div></form>`);const input=$('#file-rename-form [name="name"]');input?.focus();input?.select();}
  async function showBin(){const result=await api('/api/trash');modalContent('回收站',result.items.length?`<div class="trash-file-list">${result.items.map(item=>`<div><span>${esc(item.title)}</span><button class="text-button" data-action="nav-restore" data-id="${esc(item.id)}">恢复</button></div>`).join('')}</div>`:'<p class="modal-description">回收站为空</p>');}
  document.addEventListener('submit',async event=>{if(event.target.getAttribute('id')!=='file-rename-form')return;event.preventDefault();event.stopImmediatePropagation();const button=event.target.querySelector('[type="submit"]');button.disabled=true;try{await api('/api/library/manage',{...Object.fromEntries(new FormData(event.target)),action:'rename'});modal.close();await refreshFiles();toast('已重命名');}catch(error){$('#file-operation-error').textContent=error.message;}finally{button.disabled=false;}},true);
  let draggedDimension='';
  document.addEventListener('dragstart',event=>{const chip=event.target.closest('[data-action="nav-order"][draggable="true"]');if(!chip)return;draggedDimension=chip.dataset.key;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',draggedDimension);});
  document.addEventListener('dragover',event=>{const chip=event.target.closest('[data-action="nav-order"][draggable="true"]');if(chip&&draggedDimension){event.preventDefault();event.dataTransfer.dropEffect='move';}});
  document.addEventListener('drop',event=>{const chip=event.target.closest('[data-action="nav-order"][draggable="true"]');if(!chip||!draggedDimension)return;event.preventDefault();const rect=chip.getBoundingClientRect(),v=activeView();v.order=moveOrder(v.order,draggedDimension,chip.dataset.key,event.clientX>rect.left+rect.width/2);v.path=[];v.selected='';draggedDimension='';save();render();});
  document.addEventListener('dragend',()=>{draggedDimension='';});
  document.addEventListener('keydown',event=>{const chip=event.target.closest('[data-action="nav-order"][draggable="true"]');if(!chip||!event.altKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();event.stopImmediatePropagation();const v=activeView(),i=v.order.indexOf(chip.dataset.key),next=i+(event.key==='ArrowRight'?1:-1);if(next<0||next>=v.order.length)return;v.order=moveOrder(v.order,chip.dataset.key,v.order[next],next>i);v.path=[];save();render();document.querySelector(`[data-action="nav-order"][data-key="${chip.dataset.key}"]`)?.focus();},true);
  let contextMenu=null,contextOrigin=null;
  function selectFile(id){
   activeView().selected=id;save();
   // Selection also anchors the file context menu.
   document.querySelectorAll('[data-action="nav-select"]').forEach(row=>{const selected=row.dataset.id===id;row.classList.toggle('selected',selected);row.setAttribute('aria-pressed',String(selected));});
  }
  function closeContextMenu(restore=false){const origin=contextOrigin;contextMenu?.remove();contextMenu=null;contextOrigin=null;if(restore&&origin?.isConnected)origin.focus();}
  function showContextMenu(event,rowButton){
   if(S.busy||S.threadBusy)return;
   closeContextMenu();if(rowButton)selectFile(rowButton.dataset.id);
   const row=rowButton?entries().find(r=>r.id===rowButton.dataset.id):null;
   contextOrigin=rowButton||document.activeElement;
   const action=(key,label,glyph,id='',disabled=false)=>`<button type="button" role="menuitem" data-action="${key}" data-id="${esc(id)}" ${disabled?'disabled':''}>${icon(glyph)}<span>${label}</span></button>`;
   const items=[];
   if(row){const isReview=activeMode()==='review';if(!isReview)items.push(action('nav-preview','查看原文件','file-text',row.id,row.available===false));items.push(action('nav-details','详细信息','info',row.id));items.push(action('nav-rename','重命名','pencil',row.id,row.available===false));items.push('<div class="classified-menu-separator" role="separator"></div>');items.push(action('nav-trash','移至回收站','trash-2',row.id,row.available===false));}
   if(!row){
   if(!S.demonstration){if(activeMode()==='learning')items.push(action('nav-import','导入材料','plus'));items.push(action('nav-catalog','标签库','tags'));items.push(action('nav-bin','回收站','trash-2'));}
   else items.push('<a role="menuitem" href="/">'+icon('arrow-left')+'<span>退出示例</span></a>');
   }
   contextMenu=document.createElement('div');contextMenu.className='classified-context-menu';contextMenu.setAttribute('role','menu');contextMenu.setAttribute('aria-label',row?'文件操作':'资料操作');contextMenu.innerHTML=items.join('');document.body.appendChild(contextMenu);icons();
   const bounds=rowButton?.getBoundingClientRect(),x=event.clientX??bounds?.left??100,y=event.clientY??bounds?.bottom??100;
   contextMenu.style.left=Math.max(8,Math.min(x,window.innerWidth-contextMenu.offsetWidth-8))+'px';contextMenu.style.top=Math.max(8,Math.min(y,window.innerHeight-contextMenu.offsetHeight-8))+'px';contextMenu.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
  }
  document.addEventListener('contextmenu',event=>{const area=event.target.closest('.classified-browser,.learning-home,.review-file-tree');if(!area)return;event.preventDefault();event.stopPropagation();showContextMenu(event,event.target.closest('[data-action="nav-select"]'));});
  document.addEventListener('pointerdown',event=>{if(contextMenu&&!contextMenu.contains(event.target))closeContextMenu();},true);
  document.addEventListener('click',event=>{if(contextMenu)closeContextMenu();},true);
  document.addEventListener('scroll',()=>closeContextMenu(),true);
  window.addEventListener('resize',()=>closeContextMenu());window.addEventListener('blur',()=>closeContextMenu());
  document.addEventListener('keydown',event=>{
   if(!contextMenu)return;
   const items=[...contextMenu.querySelectorAll('[role="menuitem"]:not(:disabled)')],index=items.indexOf(document.activeElement);
   if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeContextMenu(true);}
   else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus();}
   else if(event.key==='Tab')closeContextMenu();
  },true);
  document.addEventListener('click',async event=>{const button=event.target.closest('[data-action^="nav-"]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();if(S.threadBusy||S.busy)return;const v=activeView();try{switch(button.dataset.action){
   case 'nav-mode':pendingNavigation=()=>navigate(button.dataset.mode);await navigate(button.dataset.mode);break;
   case 'nav-home':pendingNavigation=()=>navigate(activeMode());await navigate(activeMode());break;
   case 'nav-order':{
    const menu=button.closest?.('.review-tree-settings');
    v.order=toggleOrder(v.order,button.dataset.key);v.path=[];v.selected='';save();render();
    if(menu){const next=document.querySelector('.review-tree-settings');if(next){next.open=true;next.querySelector(`[data-key="${button.dataset.key}"]`)?.focus();}}
    break;
   }
   case 'nav-group':v.path=[...v.path.slice(0,Number(button.dataset.depth)),button.dataset.value];v.selected='';save();render();break;
   case 'nav-select':selectFile(button.dataset.id);await openEntry(button.dataset.id);break;
   case 'nav-clear-search':v.query='';save();render();$('#classified-search')?.focus();break;
   case 'nav-import':showResourceImport();break;
   case 'nav-catalog':await root.StudyUnits.showCatalog();break;
   case 'nav-rename':await renameFile(button.dataset.id);break;
   case 'nav-trash':{const row=await api('/api/library/'+encodeURIComponent(button.dataset.id));await api('/api/library/manage',{id:row.id,version:row.version,action:'trash'});await refreshFiles();toast('已移至回收站，可从空白处右键恢复');break;}
   case 'nav-bin':await showBin();break;
   case 'nav-restore':await api('/api/trash/restore',{id:button.dataset.id});await refreshFiles();await showBin();toast('已恢复');break;
   case 'nav-preview':await openResource(button.dataset.id);break;
   case 'nav-details':if(root.StudyDetails&&!S.demonstration)await root.StudyDetails.open(button.dataset.id);else showResourceClassification(button.dataset.id);break;
  }}catch(error){toast(error.message);}},true);

  document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'&&['courses','library'].includes(S.view)){event.preventDefault();event.stopImmediatePropagation();(activeMode()==='learning'?$('#learning-history-search'):$('#classified-search'))?.focus();return;}const button=event.target.closest('[data-action="nav-select"]');if(button&&(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')){event.preventDefault();event.stopImmediatePropagation();const rect=button.getBoundingClientRect();showContextMenu({clientX:rect.left+20,clientY:rect.bottom},button);return;}if(button&&event.key==='Enter'){event.preventDefault();openEntry(button.dataset.id).catch(error=>toast(error.message));}},true);
  document.addEventListener('change',event=>{const key=event.target.dataset?.displayTag;if(key&&Object.hasOwn(displayLabels,key)){const v=activeView();if(!v.displayEdited)v.display=displayedKeys();v.displayEdited=true;v.display=event.target.checked?[...new Set([...v.display,key])]:v.display.filter(k=>k!==key);save();const d=browse();document.querySelectorAll('.classified-results .classified-file-tags').forEach((el,i)=>{el.innerHTML=visibleTags(d.rows[i],v.display).map(t=>`<span class="classified-tag" title="${esc(displayLabels[t.key])}">${esc(t.label)}</span>`).join('');});return;}if(event.target.id!=='classified-sort')return;const v=activeView();v.sort=event.target.value;save();render();});
  document.addEventListener('pointerdown',event=>{for(const cls of ['.classified-display','.classified-extra'])if(!event.target.closest(cls))document.querySelector(cls)?.removeAttribute('open');},true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')for(const cls of ['.classified-display','.classified-extra'])document.querySelector(cls)?.removeAttribute('open');});
  document.addEventListener('input',event=>{if(event.target.id!=='classified-search')return;const input=event.target,start=input.selectionStart,end=input.selectionEnd,v=activeView();v.query=input.value;render();const next=$('#classified-search');next?.focus();next?.setSelectionRange(start,end);});
 }};
})(typeof window==='undefined'?{}:window);
