'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{parseHTML}=require('linkedom');
const R=require('../assets/js/reporting-core.js');
function harness({reports=[],role='admin',confirm,reviewStatus,refresh}={}){
const {window}=parseHTML('<html><body><div id="cards"></div></body></html>');
Object.defineProperty(window.HTMLSelectElement.prototype,'value',{get(){return [...this.querySelectorAll('option')].find(o=>o.hasAttribute('selected'))?.getAttribute('value')||''},set(value){for(const o of this.querySelectorAll('option')){if(o.getAttribute('value')===String(value))o.setAttribute('selected','');else o.removeAttribute('selected')}}});
const Option=function(text,value){const e=window.document.createElement('option');e.textContent=text;e.setAttribute('value',value);return e};
let writes=0,receipt;const data={teams:[{team_code:'L',name:'左隊'},{team_code:'R',name:'右隊'}],matches:[{match_code:'M1',date:'2099-01-01',time:'15:30',group:'A',home_team_code:'L',away_team_code:'R'}],results:[]};
const api={queue:async()=>reports,confirm:async p=>{writes++;receipt=confirm?await confirm(p):{...p,version:1};return receipt},reviewStatus:reviewStatus|| (async()=>({status:'saved',receipt})),lock:async()=>{}};
window.WuriReporting={...R};vm.runInNewContext(fs.readFileSync('assets/js/result-review.js','utf8'),{window,document:window.document,Option,console});
const ui=window.WuriReporting.createReview({api,getData:()=>data,isAdmin:()=>role==='admin',container:window.document.getElementById('cards'),refresh:refresh||(async()=>true)});const q=s=>window.document.querySelector(s);return {ui,data,q,writes:()=>writes,render:()=>ui.render(data.matches)};
}
async function loaded(options){const h=harness(options);await h.ui.load();h.render();return h}
const report={id:'r1',match_code:'M1',home_score:3,away_score:0,disposition:'pending',created_at:'2026-10-09T10:00:00Z'};
test('inline UI single candidate preselects score; score change selects custom without writing and filters preserve draft',async()=>{const h=await loaded({reports:[report]});assert.equal(h.ui.drafts.get('M1').source,'r1');assert.equal(h.q('select').value,'3');h.q('select').value='2';h.q('select').onchange();assert.equal(h.ui.drafts.get('M1').source,'custom');assert.equal(h.writes(),0);h.ui.render([]);h.render();assert.equal(h.q('select').value,'2');assert.equal(h.q('input[value=custom]').checked,true)});
test('inline UI conflicting reports require explicit candidate and blank score is rejected',async()=>{const h=await loaded({reports:[report,{...report,id:'r2',home_score:2,away_score:1}]});assert.equal(h.ui.drafts.get('M1').source,'');await h.q('.primary').onclick();assert.equal(h.writes(),0);assert.match(h.q('[role=status]').textContent,/請選擇回報/);h.q('input[value=r2]').onchange();assert.equal(h.q('select').value,'2');await h.q('.primary').onclick();assert.equal(h.writes(),1);assert.match(h.q('[role=status]').textContent,/M1 已確認儲存 2–1/)});
test('inline UI uncertain write freezes original request and blocks repeat save until receipt reconciliation',async()=>{let checked=0;const h=await loaded({reports:[report],confirm:async()=>{throw Error('network')},reviewStatus:async s=>{checked++;return {status:'not_saved',match_code:s.payload.match_code,request_id:s.requestId}}});await h.q('.primary').onclick();const d=h.ui.drafts.get('M1');assert.equal(d.request.phase,'unknown');assert.equal(h.q('select').disabled,true);await h.q('.primary').onclick();assert.equal(h.writes(),1);const check=[...h.q('.report-actions').querySelectorAll('button')].find(b=>b.textContent==='查證原請求');await check.onclick();assert.equal(checked,1);assert.equal(d.request.phase,'rejected');assert.equal(h.q('select').disabled,false)});
test('known committed response plus failed readback does not allow another write; refresh failure remains saved',async()=>{const h=await loaded({reports:[report],reviewStatus:async()=>{throw Error('readback')}});await h.q('.primary').onclick();assert.equal(h.writes(),1);assert.equal(h.ui.drafts.get('M1').request.phase,'unknown');assert.match(h.q('[role=status]').textContent,/已收到儲存回應/);const ok=await loaded({reports:[report],refresh:async()=>false});await ok.q('.primary').onclick();assert.match(ok.q('[role=status]').textContent,/已儲存 3–0；畫面更新失敗/)});
test('scorer lock denied in actual handler and pending double clicks cannot resend',async()=>{let finish;const h=await loaded({reports:[report],confirm:p=>new Promise(resolve=>finish=()=>resolve({...p,version:1}))});const pending=h.q('.primary').onclick();await h.q('.primary').onclick();assert.equal(h.writes(),1);finish();await pending;const locked=await loaded({role:'scorer'});locked.data.results=[{match_code:'M1',home_score:3,away_score:0,version:1,locked:true}];locked.render();assert.equal(locked.q('.primary').disabled,true);await locked.q('.primary').onclick();assert.equal(locked.writes(),0)});
test('renderer treats imported identity as text, not DOM markup',async()=>{const h=await loaded({reports:[report]});h.data.teams[0].name='<img src=x onerror=alert(1)>';h.render();assert.equal(h.q('img'),null);assert(h.q('#cards').textContent.includes('<img'))});

test('review groups chronologically by date and keeps dates out of per-match headings',async()=>{
 const h=await loaded(),base=h.data.matches[0];h.data.matches=[{...base,match_code:'A-2099-01-02-1',date:'2099-01-02'},{...base,match_code:'A-2099-01-01-1'},{...base,match_code:'A-2099-01-01-2'}];h.render();
 const groups=[...h.q('#cards').querySelectorAll('[data-review-date]')];assert.deepEqual(groups.map(g=>g.dataset.reviewDate),['2099-01-01','2099-01-02']);assert.equal(groups[0].querySelectorAll('[data-review-match]').length,2);
 const card=h.q('[data-review-match="A-2099-01-01-1"]');assert.equal(card.querySelector('h3').textContent,'15:30｜A 組｜A-1');assert(!card.textContent.includes('2099-01-01'));assert.equal(card.querySelector('h3').title,'A-2099-01-01-1');
 h.ui.render([]);assert.equal(h.q('[data-review-date]'),null);assert.match(h.q('#cards').textContent,/沒有符合/);
});
test('no-report paper entry hides meaningless single-option fieldset and retains original write identity',async()=>{
 const h=await loaded();h.data.matches[0].match_code='A-2099-01-01-1';h.render();assert.equal(Boolean(h.q('fieldset')),false);const selects=h.q('#cards').querySelectorAll('select');selects[0].value='3';selects[0].onchange();selects[1].value='0';selects[1].onchange();await h.q('.primary').onclick();
 assert.equal(h.writes(),1);const d=h.ui.drafts.get('A-2099-01-01-1');assert.equal(d.request.payload.match_code,'A-2099-01-01-1');assert.equal(d.request.payload.report_id,null);assert.match(h.q('[role=status]').textContent,/已確認儲存/);
});
test('idle cards have no permanent validation/publication prose; invalid input alone shows legal score guidance',async()=>{
 const h=await loaded();assert.equal(Boolean(h.q('[role=status]')),false);assert(!h.q('#cards').textContent.includes('合法比分'));assert(!h.q('#cards').textContent.includes('不同操作'));
 await h.q('.primary').onclick();assert.equal(h.writes(),0);assert.match(h.q('[role=status]').textContent,/3–0、0–3、2–1、1–2/);
});
test('confirmed published result omits candidate selection and stale per-card publication claims',async()=>{
 const h=await loaded();h.data.results=[{match_code:'M1',home_score:3,away_score:0,version:1,published:true}];h.render();assert.equal(Boolean(h.q('fieldset')),false);assert(!h.q('#cards').textContent.includes('待發布'));assert.equal(h.q('.primary').textContent,'儲存更正');
});
test('date regrouping preserves unsaved paper-entry scores and notes',async()=>{
 const h=await loaded();const s=h.q('select');s.value='2';s.onchange();const note=h.q('textarea');note.value='紙本備註';note.oninput();h.ui.render([]);h.render();assert.equal(h.q('select').value,'2');assert.equal(h.q('textarea').value,'紙本備註');assert.equal(h.writes(),0);
});
