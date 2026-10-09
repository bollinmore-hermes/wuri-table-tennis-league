'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {parseHTML}=require('linkedom'),R=require('../assets/js/reporting-core.js');

async function harness({uncertain=false,knownFailure=false}={}) {
  const {window}=parseHTML(fs.readFileSync('referee.html','utf8'));
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{get(){const options=[...this.querySelectorAll('option')],o=options.find(o=>o.hasAttribute('selected'))||options[0];return o?.getAttribute('value')??o?.textContent??''},set(v){for(const o of this.querySelectorAll('option')){if((o.getAttribute('value')??o.textContent)===String(v))o.setAttribute('selected','');else o.removeAttribute('selected')}}});
  const Option=function(text,value){const e=window.document.createElement('option');e.textContent=text;e.setAttribute('value',value);return e};
  const rows=['M1','M2'].map(match_code=>({match_code,time:'15:30',group:'A',home_name:'合成左隊',away_name:'合成右隊',reportable:true}));
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
