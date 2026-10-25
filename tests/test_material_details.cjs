const test=require('node:test'),assert=require('node:assert/strict');
const {parseWeeks,draftFromDetails,buildPayload,currentResourceId,detailsMarkup,hasChanges,setField,fieldValue}=require('../web/material-details.js');
const sample=()=>({item:{id:'note-c-n',title:'关系与函数'},unit_id:'c',etag:'one',tags:{course:'ADS102',weeks:[3,4],class_type:'Lecture',chapter:'第二章',topic:'关系',custom:['重点']},sessions:[{week:3,class_type:'Lecture',number:1},{week:4,class_type:'Lecture',number:2}],note_kind:'concepts',relations:[{material_id:'source-c',title:'Lecture 1–2',filename:'original.pdf',role:'primary',pages:'1-3',available:true}],metadata_sources:{weeks:{source:'filename',evidence:'Week 3–4',status:'unconfirmed'},sessions:{source:'content',evidence:'Lecture 1 and 2',status:'conflict'},course:{source:'user',status:'confirmed'}},relation_candidates:[{id:'extra',title:'补充课件'}],related_notes:[]});
test('week ranges normalize without confusing weeks with session numbers',()=>{assert.deepEqual(parseWeeks('3, 4–6，3'),[3,4,5,6]);assert.deepEqual(parseWeeks('3 - 5'),[3,4,5]);assert.throws(()=>parseWeeks('0'));assert.throws(()=>parseWeeks('6-3'));assert.throws(()=>parseWeeks('Week 3'));});
test('paired sessions preserve their association and allow missing week or number',()=>{const draft=draftFromDetails(sample());draft.sessions.push({week:null,class_type:'Lab',number:1},{week:7,class_type:'Tutorial',number:null},{week:null,class_type:'',number:null});const payload=buildPayload(draft,'one');assert.deepEqual(payload.sessions,[{week:3,class_type:'Lecture',number:1},{week:4,class_type:'Lecture',number:2},{week:null,class_type:'Lab',number:1},{week:7,class_type:'Tutorial',number:null}]);assert.deepEqual(payload.tags.weeks,[3,4]);});
test('saving sends only explicitly checked confirmation fields',()=>{const draft=draftFromDetails(sample());assert.deepEqual(buildPayload(draft,'one').confirm_fields,[]);draft.confirm_fields=['weeks'];const payload=buildPayload(draft,'one');assert.deepEqual(payload.confirm_fields,['weeks']);assert.equal(payload.etag,'one');assert.deepEqual(payload.relations,[{material_id:'source-c',role:'primary',pages:'1-3'}]);});
test('draft changes do not mutate fetched metadata or reference records',()=>{const data=sample(),draft=draftFromDetails(data);draft.tags.weeks.push(5);draft.sessions[0].number=8;draft.relations[0].pages='4-6';assert.deepEqual(data.tags.weeks,[3,4]);assert.equal(data.sessions[0].number,1);assert.equal(data.relations[0].pages,'1-3');});
test('existing-material units and note resources resolve without invented source IDs',()=>{const items=[{id:'existing-file',unit_id:'c'},{id:'note-c-n',unit_id:'c',note_id:'n'}];assert.equal(currentResourceId(items,'c','n'),'note-c-n');assert.equal(currentResourceId(items,'c',null),'existing-file');assert.equal(currentResourceId([{id:'source-old'}],'old',null),'source-old');assert.equal(currentResourceId(items,'other','n'),null);});



test('details show four readable properties and original links together without a modal or tabs',()=>{
 const data=sample(),html=detailsMarkup(data,draftFromDetails(data));
 assert.deepEqual([...html.matchAll(/<label class="details-label">(课程归属|课程类型|教学周|笔记类型)<\/label>/g)].map(m=>m[1]),['课程归属','课程类型','教学周','笔记类型']);
 assert.doesNotMatch(html,/role="tab"|data-tab=|data-details-action="edit"/);
 assert.match(html,/data-details-list="course"/);assert.match(html,/data-details-list="class_type"/);assert.match(html,/data-details-list="note_kind"/);assert.match(html,/data-details-choice="weeks"/);
 assert.match(html,/<h3>原始材料<\/h3>/);assert.doesNotMatch(html,/自定义标签|data-details-list="custom"|考前复习/);
 assert.match(html,/<footer class="details-footer" hidden>/);
 assert.doesNotMatch(html,/课次对应|识别依据|关联资料|关联笔记|name="chapter"|name="topic"|data-confirm-field/);
});
test('original materials contain direct safe links without relationship editors',()=>{
 const data=sample();data.item.title='<script>alert(1)</script>';data.relations[0].title='<img src=x onerror=alert(1)>';
 const html=detailsMarkup(data,draftFromDetails(data),'originals');
 assert.match(html,/href="\/api\/library\/source-c\/file" target="_blank" rel="noopener"/);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<script>|<img src=x|data-relation-field|data-details-action="(?:add-relation|remove-relation|open-note)"|选择已有材料|用途|页码/);
});
test('editing visible tags preserves existing hidden metadata and source references',()=>{
 const data=sample(),draft=draftFromDetails(data);draft.tags.course='CPT111';draft.tags.weeks=[5];draft.note_kind='solutions';
 const payload=buildPayload(draft,data.etag);
 assert.equal(payload.tags.course,'CPT111');assert.deepEqual(payload.tags.weeks,[5]);assert.equal(payload.note_kind,'solutions');assert.deepEqual(payload.tags.custom,data.tags.custom);
 assert.equal(payload.tags.chapter,data.tags.chapter);assert.equal(payload.tags.topic,data.tags.topic);
 assert.deepEqual(payload.sessions,data.sessions);assert.deepEqual(payload.relations,data.relations.map(({material_id,role,pages})=>({material_id,role,pages})));
 assert.deepEqual(payload.confirm_fields,[]);assert.equal('content' in payload,false);assert.equal('completed' in payload,false);
});
test('missing originals remain readable without offering a broken link',()=>{
 const data=sample();data.relations[0].available=false;
 let html=detailsMarkup(data,draftFromDetails(data),'originals');assert.match(html,/文件暂不可用/);assert.doesNotMatch(html,/href="\/api\/library/);
 data.relations=[];html=detailsMarkup(data,draftFromDetails(data),'originals');assert.match(html,/暂无原始材料/);
});

test('editing one property preserves other fields and only actual changes reveal save actions',()=>{
 const data=sample(),draft=draftFromDetails(data);
 assert.equal(hasChanges(data,draft),false);
 assert.equal(hasChanges(data,draft,{key:'course',value:'ADS102'}),false);
 assert.equal(hasChanges(data,draft,{key:'course',value:'CPT111'}),true);
 assert.throws(()=>setField(draft,'custom','复习'));assert.deepEqual(draft.tags.custom,['重点']);setField(draft,'course','CPT111');
 assert.equal(hasChanges(data,draft),true);
 assert.doesNotMatch(detailsMarkup(data,draft),/<footer class="details-footer" hidden>/);
 assert.deepEqual(draft.sessions,data.sessions);assert.deepEqual(draft.relations,data.relations);
 assert.throws(()=>setField(draft,'weeks','Week 9'));assert.deepEqual(draft.tags.weeks,[3,4]);
 assert.throws(()=>setField(draft,'chapter','第三章'));assert.equal(draft.tags.chapter,'第二章');
});
test('all fields are directly editable and error feedback preserves the draft and version',()=>{
 const data=sample(),draft=draftFromDetails(data);setField(draft,'weeks','5–6');
 assert.equal(fieldValue(draft,'weeks'),'5, 6');
 const html=detailsMarkup(data,draft,{editor:'weeks',error:'信息已被更新。'});
 assert.match(html,/data-details-list="weeks"/);assert.match(html,/data-details-list="course"/);assert.doesNotMatch(html,/data-details-editor=/);
 assert.match(html,/role="alert" >信息已被更新。/);assert.equal(buildPayload(draft,data.etag).etag,'one');
 const saved=detailsMarkup(data,draftFromDetails(data),{notice:'已保存'});
 assert.match(saved,/role="status" >已保存/);assert.match(saved,/<footer class="details-footer" hidden>/);
});

test('configured choices are offered without discarding a note using a removed option',()=>{
 const data=sample();data.choices={course:['CPT111'],class_type:['Workshop'],weeks:['1','6'],custom:['考前复习']};data.templates=[{id:'tpl_a',name:'错题复盘'},{id:'concepts',name:'知识点总结'}];
 const html=detailsMarkup(data,draftFromDetails(data));
 for(const value of ['Workshop','Lecture','Week 6','Week 3','错题复盘'])assert.match(html,new RegExp(value));
 assert.match(html,/data-value="Lecture" aria-pressed="true"/);assert.equal(hasChanges(data,draftFromDetails(data)),false);
});

test('all four fields use choices with one shared management destination and no free-form add flow',()=>{
 const data=sample(),html=detailsMarkup(data,draftFromDetails(data));
 for(const key of ['course','class_type','weeks','note_kind'])assert.match(html,new RegExp(`data-details-list="${key}"`));
 assert.equal((html.match(/data-details-action="manage"/g)||[]).length,4);assert.doesNotMatch(html,/<select|<datalist|data-details-add=|data-details-field=/);
});
