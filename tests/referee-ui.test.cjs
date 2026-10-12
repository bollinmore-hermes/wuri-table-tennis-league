'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {parseHTML}=require('linkedom'),R=require('../assets/js/reporting-core.js');

async function harness({uncertain=false,knownFailure=false,matches}={}) {
  const {window}=parseHTML(fs.readFileSync('referee.html','utf8'));
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{get(){const options=[...this.querySelectorAll('option')],o=options.find(o=>o.hasAttribute('selected'))||options[0];return o?.getAttribute('value')??o?.textContent??''},set(v){for(const o of this.querySelectorAll('option')){if((o.getAttribute('value')??o.textContent)===String(v))o.setAttribute('selected','');else o.removeAttribute('selected')}}});
  const Option=function(text,value){const e=window.document.createElement('option');e.textContent=text;e.setAttribute('value',value);return e};
  const rows=matches||['M1','M2'].map(match_code=>({match_code,time:'15:30',group:'A',home_name:'合成左隊',away_name:'合成右隊',reportable:true}));
  let writes=0,original;
  const client={async rpc(name,args){
    if(name==='get_daily_report_schedule')return {data:{season:'synthetic',date:'2099-01-01',matches:rows}};
    if(name==='submit_referee_report'){
      writes++;original=args;
      if(uncertain||knownFailure)return {error:{message:'failure',code:knownFailure?'P0001':'FETCH'},status:knownFailure?400:0};
      return {data:{status:'received',match_code:args.p_match_code,request_id:args.p_request_id}};
    }
    if(name==='get_referee_report_status')return {data:{status:'not_received',match_code:args.p_match_code,request_id:args.p_request_id}};
    throw Error('unexpected RPC');
  }};
  window.WuriReporting={...R};window.LEAGUE_CONFIG={mode:'supabase',supabaseUrl:'https://example.supabase.co',supabasePublishableKey:'synthetic-public-key'};window.supabase={createClient:()=>client};
  vm.runInNewContext(fs.readFileSync('assets/js/referee.js','utf8'),{window,document:window.document,location:{hash:'#token='+'a'.repeat(64)},URLSearchParams,Option,console});
  await new Promise(setImmediate);
  const q=s=>window.document.querySelector(s);q('.match-pick').onclick();q('#home').value='3';q('#away').value='0';
  return {q,writes:()=>writes,original:()=>original};
}

test('mobile picker has no filters and lists all matches chronologically with full team names and status',async()=>{const matches=[{match_code:'M2',time:'16:30',group:'B',home_name:'完整長隊名乙',away_name:'右隊乙',reportable:false,completed:true},{match_code:'M1',time:'15:30',group:'A',home_name:'完整長隊名甲',away_name:'右隊甲',reportable:true}];const h=await harness({matches});assert.equal(h.q('#group'),null);assert.equal(h.q('#search'),null);assert.equal(h.q('.match-meta').textContent,'15:30 · A 組');assert.equal(h.q('.match-team').textContent,'完整長隊名甲');assert.equal(h.q('.match-status').textContent,'可回報');assert.equal(h.q('.match-pick').getAttribute('aria-label').includes('回報比分'),true);assert.equal(h.q('.match-pick').nextElementSibling.disabled,true);assert.equal(h.q('#dayTitle').textContent,'2099-01-01');assert.equal(h.writes(),0)});
test('compact picker keeps both team names with a versus separator and omits redundant code/action rows',async()=>{const h=await harness();assert.equal(Boolean(h.q('#matches .match-code')),false);assert.equal(Boolean(h.q('#matches .match-action')),false);assert.equal(h.q('.match-versus').textContent,'vs');assert.equal(h.q('.match-teams').children.length,3);assert.equal(h.q('.match-pick').getAttribute('aria-label').includes('回報比分'),true)});
test('schedule status defaults to pending without resetting on normal rerenders',()=>{const html=fs.readFileSync('admin.html','utf8');assert.match(html,/<select class="filter" id="scheduleStatus">.*?<option value="scheduled" selected>/);const source=fs.readFileSync('assets/js/admin.js','utf8');assert(!/scheduleStatus.{0,30}value\s*=/.test(source))});

test('referee uncertain write freezes scores and prevents changing match or returning to picker until original-request check',async()=>{
  const h=await harness({uncertain:true});await h.q('#submit').onclick();
  assert.equal(h.q('#home').disabled,true);assert.equal(h.q('#back').disabled,true);
  await h.q('#back').onclick();assert.equal(h.q('#picker').hidden,true);
  h.q('.match-pick').onclick();assert.match(h.q('#identity').textContent,/M1/);
  await h.q('#submit').onclick();assert.equal(h.writes(),1);
  await h.q('#check').onclick();assert.equal(h.q('#home').disabled,false);assert.equal(h.q('#home').value,'3');
  assert.match(h.q('#message').textContent,/原請求尚未收到/);assert.equal(h.original().p_match_code,'M1');
});
test('referee definite rejection preserves input without claiming receipt',async()=>{
  const h=await harness({knownFailure:true});await h.q('#submit').onclick();
  assert.equal(h.q('#home').value,'3');assert.equal(h.q('#home').disabled,false);assert.match(h.q('#message').textContent,/未寫入/);
});
test('successful referee receipt is not an official result and permits returning to the same day schedule',async()=>{
  const h=await harness();await h.q('#submit').onclick();assert.match(h.q('#message').textContent,/尚非正式結果/);
  assert.equal(h.q('#home').disabled,true);assert.equal(h.q('#back').disabled,false);
  await h.q('#back').onclick();assert.equal(h.q('#picker').hidden,false);assert.equal(h.q('#entry').hidden,true);
});
