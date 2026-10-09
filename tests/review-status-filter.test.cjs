'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const R=require('../assets/js/reporting-core.js');
const html=fs.readFileSync('admin.html','utf8'),source=fs.readFileSync('assets/js/admin.js','utf8');
function filter({status='ALL',group='ALL',search='',kind='results'}={}){
 const matches=[{match_code:'M',group:'A',date:'2099-01-01',status:'scheduled',home_team_code:'L',away_team_code:'R'},{match_code:'R',group:'B',date:'2099-01-02',status:'scheduled',home_team_code:'L',away_team_code:'R'},{match_code:'F',group:'A',date:'2099-01-03',status:'final',home_team_code:'L',away_team_code:'R'}],results=[{match_code:'F',published:false,locked:false}];
 const controls={resultStatus:status,resultGroup:group,resultSearch:search,scheduleStatus:status,scheduleGroup:group,matchSearch:search};
 const box={data:{matches,results},el:id=>({value:controls[id]}),teamName:code=>code==='L'?'合成甲隊':'合成乙隊',resultByMatch:code=>results.find(r=>r.match_code===code),reviewUI:{hasReports:code=>code==='R'||code==='F'},window:{WuriReporting:R},matchSort:(a,b)=>a.date.localeCompare(b.date)};
 const start=source.indexOf('function filteredMatches('),end=source.indexOf('function renderSchedule(',start);assert(start>=0&&end>start);vm.runInNewContext(source.slice(start,end),box);return Array.from(box.filteredMatches(kind),m=>m.match_code);
}
test('review filter offers only All, Review, Manual Entry and Complete',()=>{
 const {document}=parseHTML(html);const options=[...document.querySelector('#resultStatus').options];assert.deepEqual(options.map(o=>[o.value,o.textContent]),[['ALL','全部'],['reported','核對'],['missing','補登'],['final','完成']]);
});
test('actual admin filter partitions missing, reported, and completed matches without overlap',()=>{
 assert.deepEqual(filter(),['M','R','F']);assert.deepEqual(filter({status:'missing'}),['M']);assert.deepEqual(filter({status:'reported'}),['R']);assert.deepEqual(filter({status:'final'}),['F']);
});
test('review state intersects group and team/match search; schedule filtering stays independent',()=>{
 assert.deepEqual(filter({status:'reported',group:'A'}),[]);assert.deepEqual(filter({status:'reported',group:'B',search:'合成甲隊'}),['R']);assert.deepEqual(filter({status:'missing',search:'m'}),['M']);assert.deepEqual(filter({kind:'schedule',status:'scheduled'}),['M','R']);assert.deepEqual(filter({kind:'schedule',status:'final'}),['F']);
});
