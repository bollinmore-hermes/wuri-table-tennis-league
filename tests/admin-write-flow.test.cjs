'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {validScore,blank}=require('../assets/js/admin-repository.js');
function harness(repository,role='admin'){
 const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',disabled:false,closed:false,close(){this.closed=true},classList:{add(){},remove(){},toggle(){}},replaceChildren(){}});return elements.get(id)};
 const source=fs.readFileSync(require.resolve('../assets/js/admin.js'),'utf8').replace('init();\n})();',`repo=window.testRepository;currentRole=window.testRole;activeScoreMatch={match_code:'MATCH-1'};renderAll=()=>{};notice=(target,type,text)=>{target.textContent=text};toast=(title,text)=>{window.lastToast={title,text}};window.testAPI={confirmImport,applyRole,refresh,setImport:value=>pendingImport=value};\n})();`);
 const sandbox={window:{LEAGUE_CONFIG:{mode:'supabase',supabaseUrl:'https://test.supabase.co',supabasePublishableKey:'placeholder-public-key-00000'},LeagueExcel:{clean:v=>v},LeagueAdminRepository:{validScore,blank},testRepository:repository,testRole:role},document:{getElementById:element,querySelectorAll:()=>[]},console,setTimeout,clearTimeout};vm.runInNewContext(source,sandbox);element('homeScore').value='3';element('awayScore').value='0';element('scoreNote').value='draft';return {api:sandbox.window.testAPI,element,window:sandbox.window};
}
test('refresh failure does not reverse known committed writes',async()=>{const h=harness({load:async()=>{throw Error('read failure')}});assert.equal(await h.api.refresh(),false);assert.match(h.element('globalMessage').textContent,/已確認成功的寫入不會因此撤銷/)});
test('real UI blocks repeat uncertain imports and concurrent double clicks',async()=>{
 let writes=0,release;const h=harness({import:async()=>{writes++;await new Promise(resolve=>release=resolve);const e=new Error('timeout');e.mutationState='unknown';throw e}});h.api.setImport({teams:[]});const first=h.api.confirmImport();await h.api.confirmImport();release();await first;await h.api.confirmImport();assert.equal(writes,1);assert.equal(h.element('confirmImport').disabled,true);assert.match(h.element('importMessage').textContent,/結果待確認/);
});
