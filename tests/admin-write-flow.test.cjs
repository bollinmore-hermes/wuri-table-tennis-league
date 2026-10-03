'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {validScore,blank}=require('../assets/js/admin-repository.js');
function harness(repository,role='admin'){
 const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',disabled:false,closed:false,close(){this.closed=true},classList:{add(){},remove(){},toggle(){}},replaceChildren(){}});return elements.get(id)};
 const source=fs.readFileSync(require.resolve('../assets/js/admin.js'),'utf8').replace('init();\n})();',`repo=window.testRepository;currentRole=window.testRole;activeScoreMatch={match_code:'MATCH-1'};renderAll=()=>{};notice=(target,type,text)=>{target.textContent=text};toast=(title,text)=>{window.lastToast={title,text}};window.testAPI={saveScore,verifyScoreOutcome,openScoreDialog,confirmImport,applyRole,refresh,setImport:value=>pendingImport=value,pendingScoreVerification,scoreDrafts};\n})();`);
 const sandbox={window:{LEAGUE_CONFIG:{mode:'supabase',supabaseUrl:'https://test.supabase.co',supabasePublishableKey:'placeholder-public-key-00000'},LeagueExcel:{clean:v=>v},LeagueAdminRepository:{validScore,blank},testRepository:repository,testRole:role},document:{getElementById:element,querySelectorAll:()=>[]},console,setTimeout,clearTimeout};vm.runInNewContext(source,sandbox);element('homeScore').value='3';element('awayScore').value='0';element('scoreNote').value='draft';return {api:sandbox.window.testAPI,element,window:sandbox.window};
}
test('real UI preserves draft and never resends uncertain score until explicit readback',async()=>{
 let writes=0;const h=harness({saveResult:async()=>{writes++;const e=new Error('network');e.mutationState='unknown';throw e},load:async()=>blank()});
 await h.api.saveScore();await h.api.saveScore();assert.equal(writes,1);assert.equal(h.element('homeScore').value,'3');assert(h.api.scoreDrafts.has('MATCH-1'));assert.equal(h.element('saveScore').disabled,true);
 await h.api.verifyScoreOutcome();assert.equal(h.element('saveScore').disabled,false);assert.match(h.element('scoreWarning').textContent,/尚無此場比分/);
});
test('real UI successful score plus failed refresh remains saved and not reported as failed',async()=>{
 const h=harness({saveResult:async()=>({version:1}),load:async()=>{throw new Error('read failure')}});await h.api.saveScore();assert.equal(h.element('scoreDialog').closed,true);assert.equal(h.window.lastToast.title,'已儲存');assert.match(h.element('globalMessage').textContent,/已確認成功的寫入不會因此撤銷/);assert.equal(h.api.scoreDrafts.size,0);
});
test('blank score is not coerced to a legal zero score',async()=>{let writes=0;const h=harness({saveResult:async()=>writes++});h.element('awayScore').value='';await h.api.saveScore();assert.equal(writes,0)});
test('real UI blocks repeat uncertain imports and concurrent double clicks',async()=>{
 let writes=0,release;const h=harness({import:async()=>{writes++;await new Promise(resolve=>release=resolve);const e=new Error('timeout');e.mutationState='unknown';throw e}});h.api.setImport({teams:[]});const first=h.api.confirmImport();await h.api.confirmImport();release();await first;await h.api.confirmImport();assert.equal(writes,1);assert.equal(h.element('confirmImport').disabled,true);assert.match(h.element('importMessage').textContent,/結果待確認/);
});
