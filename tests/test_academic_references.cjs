const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseWeeks,formatWeeks,tabsMarkup}=require('../web/academic-references.js');
test('teaching weeks preserve odd weeks and disjoint ranges',()=>{
 assert.deepEqual(parseWeeks('1–3, 5, 7-9'),[1,2,3,5,7,8,9]);
 assert.deepEqual(parseWeeks(''),[]);
 assert.equal(formatWeeks([1,2,3,5,7,8,9]),'1–3, 5, 7–9');
 for(const invalid of ['0','61','7-2','1,abc','1.5','1-100000'])assert.throws(()=>parseWeeks(invalid));
});
test('semester owns information, calendar and timetable tabs',()=>{
 const html=tabsMarkup('calendar');
 assert.match(html,/data-kind="calendar" class="selected"/);
 assert.match(html,/学期信息/);assert.match(html,/课表/);
 assert.doesNotMatch(html,/统计|进度/);
});
