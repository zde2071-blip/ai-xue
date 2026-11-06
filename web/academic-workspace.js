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
 if(typeof module!=='undefined'&&module.exports){module.exports={keyOf,shortName,termsFor,resolve,label};return;}
 root.StudyAcademic={keyOf,resolve,termsFor,label};
})(typeof window==='undefined'?{}:window);
