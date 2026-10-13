'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../assets/js/app.js'),'utf8');
function snapshot(warning=null,locale='zh'){
  let notice=null;const main={prepend(n){notice=n}};
  const ctx=vm.createContext({repository:{metadata:{generatedAt:'2026-10-13T00:00:00Z'},warning},locale,Intl,Date,document:{getElementById:()=>notice,querySelector:()=>main},dom:()=>({textContent:'',remove(){notice=null}})});
  vm.runInContext(source.slice(source.indexOf('function renderSnapshotNotice('),source.indexOf('function applyLocale(')),ctx);
  return {ctx,run:()=>vm.runInContext('renderSnapshotNotice()',ctx),notice:()=>notice};
}
test('UI cleanup: successful public snapshot displays no publication timestamp in either language',()=>{
  for(const locale of ['zh','en']){const b=snapshot(null,locale);b.run();assert.equal(b.notice(),null)}
});
test('UI cleanup: fallback warning survives, localizes and disappears after recovery',()=>{
  const b=snapshot('storage_unavailable');b.run();assert.match(b.notice().textContent,/備援快照/);
  b.ctx.locale='en';b.run();assert.match(b.notice().textContent,/fallback snapshot/);
  b.ctx.repository.warning=null;b.run();assert.equal(b.notice(),null);
});
function follow(available=true,exists=true){
  const button={dataset:{followTeamCode:'A01'},setAttribute(){}};
  const ctx=vm.createContext({activeFollowButton:button,activeFollowNotice:{textContent:''},followTeamRecords:exists?[{team_code:'A01'}]:[],followedTeamCode:null,followStorageAvailable:available,t:k=>({followAction:'關注此隊',followStorage:'瀏覽器無法儲存選擇',followMissing:'此球隊目前不在參賽清單',followHint:'一次關注一隊，不需登入；只記在這個瀏覽器。'})[k]});
  vm.runInContext(source.slice(source.indexOf('function updateFollowTeamControl('),source.indexOf('function createFollowTeamControl(')),ctx);
  vm.runInContext('updateFollowTeamControl()',ctx);return ctx;
}
test('UI cleanup: team profile does not display routine follow explanation',()=>{assert.equal(follow().activeFollowNotice.textContent,'')});
test('UI cleanup: storage failure and removed-team warnings remain visible',()=>{assert.match(follow(false).activeFollowNotice.textContent,/無法儲存/);assert.match(follow(true,false).activeFollowNotice.textContent,/不在參賽清單/)});
