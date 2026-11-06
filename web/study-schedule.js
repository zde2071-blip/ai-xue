/* The calendar owns one draft and one save boundary; academic placement is unrelated. */
(function(root){
 'use strict';
 let M=null,inherited={};
 function activeDocument(doc){
  const active=structuredClone(doc);inherited={};
  for(const key of ['calendar','timetable','events']){
   inherited[key]=(active[key]||[]).filter(row=>row.calendar_group&&!row.source_id);
   active[key]=(active[key]||[]).filter(row=>!row.calendar_group||row.source_id);
  }
  return active;
 }
 function saveDocument(){
  const doc=Object.fromEntries(['calendar','timetable','events','references','sources','colors','etag'].map(k=>[k,M[k]]));
  for(const key of ['calendar','timetable','events'])doc[key]=[...M[key],...(inherited[key]||[])];
  return {...doc,reference_files:M.referenceFiles};
 }
 const snapshot=doc=>JSON.stringify(Object.fromEntries(['calendar','timetable','events','references','sources','colors'].map(k=>[k,doc[k]||(k==='colors'?{}:[])])));
 async function prepare(){const owner=S.user?.id,doc=await api('/api/calendar');if(owner!==S.user?.id)return;M={...activeDocument(doc),owner,saving:false,referenceFiles:[],visible:{calendar:true,timetable:true,exam:true}};M.baseline=snapshot(M);}
 function changed(){return !!M&&(snapshot(M)!==M.baseline||M.referenceFiles.length);}
 function dirty(){return changed()||!!M&&root.AcademicReferences.pending(M);}
 function busy(){return !!M?.saving||root.AcademicReferences.busy(M);}
 function reportError(message){if(!M)return;M.error=message;const el=document.querySelector('#schedule-error');if(el){el.hidden=!message;el.textContent=message;}}
 function refreshActions(){const footer=document.querySelector('.schedule-save-actions');if(footer)footer.hidden=!changed();if(busy())document.querySelectorAll('.study-calendar-page button,.study-calendar-page input,.study-calendar-page select,.study-calendar-page textarea').forEach(el=>el.disabled=true);}
 function paint(){render();refreshActions();}
 function canLeave(){if(busy()){reportError('请等待识别或保存完成。');return false;}if(dirty()){reportError('请先保存或取消日历修改。');return false;}return true;}
 function markup(){if(!M)return '';return `<section class="study-calendar-page" aria-label="学习日历">${root.AcademicReferences.markup(M)}<p id="schedule-error" class="error-message" role="alert" ${M.error?'':'hidden'}>${esc(M.error||'')}</p><footer class="schedule-save-actions" ${changed()?'':'hidden'}><button type="button" class="outline-button" data-schedule-action="cancel">取消</button><button type="button" class="primary" data-schedule-action="save">保存</button></footer></section>`;}
 async function save({quiet=false}={}){if(!M||busy())return false;
 const owner=M.owner;
  try{root.AcademicReferences.validate(M);M.saving=true;M.error='';if(!quiet)paint();const doc=await api('/api/calendar',saveDocument());if(owner!==S.user?.id)return false;Object.assign(M,activeDocument(doc),{referenceFiles:[]});M.baseline=snapshot(M);if(M.importUI)M.importUI.notice='';if(!quiet)toast('已保存');return true;}
  catch(error){reportError(error.message);return false;}finally{if(owner===S.user?.id){M.saving=false;if(!quiet)paint();}}
 }
 root.StudySchedule={prepare,save,markup,manager:()=>M,dirty,busy,canLeave,paint,refreshActions,reportError};
 document.addEventListener('click',async event=>{
  const node=event.target.closest('[data-schedule-action]');if(!node||!M||busy())return;event.preventDefault();event.stopImmediatePropagation();
  if(node.dataset.scheduleAction==='cancel'){await prepare();paint();return;}
  await save();
 },true);
 document.addEventListener('change',event=>{const key=event.target.dataset.calendarFilter;if(M&&key){M.visible[key]=event.target.checked;paint();}});
})(window);
