'use strict';
// Read-only public-page browser verification. Uses a fresh Chrome profile.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const url=process.argv[2],out=process.argv[3];
if(!url||!out)throw Error('Usage: node scripts/verify-follow-team-browser.cjs <url> <evidence-dir>');
fs.mkdirSync(out,{recursive:true});
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--no-default-browser-check',`--user-data-dir=${fs.mkdtempSync(path.join(process.env.TMPDIR||out,'wuri-follow-'))}`,'--remote-debugging-port=0','about:blank']);
let socket,id=0,sessionId;const pending=new Map(),errors=[];
const deadline=setTimeout(()=>{chrome.kill();console.error('Browser verification timed out');process.exit(1)},120000);
function call(method,params={},browser=false){return new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params,...(!browser&&sessionId?{sessionId}:{})}))})}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+' '+JSON.stringify(r.exceptionDetails.exception?.description));return r.result.value}
async function navigate(){await call('Page.navigate',{url});await evaluate(`new Promise((resolve,reject)=>{const until=Date.now()+20000;const tick=()=>{if(window.WuriLeagueApp?.getSummary().teams>0&&document.querySelector('#followTeamSelect')?.options.length>1)return resolve(true);if(Date.now()>until)return reject(Error('data hydration timeout'));setTimeout(tick,50)};tick()})`)}
async function click(selector){const point=await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({behavior:'instant',block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1})}
(async()=>{
  const endpoint=await new Promise((resolve,reject)=>{let text='';chrome.stderr.on('data',b=>{text+=b;const m=text.match(/DevTools listening on (ws:\/\/\S+)/);if(m)resolve(m[1])});chrome.on('error',reject);chrome.on('exit',code=>reject(Error('Chrome exited '+code)))});
  socket=new WebSocket(endpoint);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject});
  socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(Error(m.error.message));else p?.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text)};
  const target=await call('Target.createTarget',{url:'about:blank'},true);sessionId=(await call('Target.attachToTarget',{targetId:target.targetId,flatten:true},true)).sessionId;
  await call('Page.enable');await call('Runtime.enable');await navigate();
  await evaluate(`localStorage.removeItem(followStorageKey);saveFollowedTeam(null);renderFollowedTeam()`);
  assert.equal(await evaluate(`document.querySelector('#followTeamSelect').value`),'');
  await evaluate(`document.querySelector('#followTeamSelect').value='A01';document.querySelector('#followTeamSelect').dispatchEvent(new Event('change',{bubbles:true}))`);
  await navigate();assert.equal(await evaluate(`document.querySelector('#followTeamSelect').value`),'A01');
  const matrix=[];
  for(const width of [320,390,768,1280])for(const locale of ['zh','en'])for(const theme of ['light','dark']){
    await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
    const result=await evaluate(`(() => {applyLocale('${locale}');WuriLeagueTheme.set('${theme}');const select=document.querySelector('#followTeamSelect');select.value='B01';select.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.follow-team').scrollIntoView({behavior:'instant',block:'center'});const card=document.querySelector('.follow-team'),r=card.getBoundingClientRect(),summary=document.querySelector('#followTeamSummary'),rank=standings('B',{key:'pts',dir:'desc'}).findIndex(row=>row.name===teams.B[0])+1;return {width:innerWidth,locale:'${locale}',theme:'${theme}',noOverflow:document.documentElement.scrollWidth<=innerWidth,cardFits:r.left>=0&&r.right<=innerWidth,controlsFit:select.getBoundingClientRect().right<=r.right,selected:select.value,summary:summary.innerText,expectedRank:rank,stored:localStorage.getItem(followStorageKey)}})()`);
    assert.equal(result.width,width);assert(result.noOverflow&&result.cardFits&&result.controlsFit,JSON.stringify(result));assert.equal(result.selected,'B01');assert.equal(result.stored,'B01');assert(result.summary.includes(locale==='zh'?`第 ${result.expectedRank} 名`:`Rank ${result.expectedRank}`));matrix.push(result);
  }
  await evaluate(`applyLocale('zh');WuriLeagueTheme.set('light')`);
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});
  await evaluate(`document.querySelector('.follow-team').scrollIntoView({behavior:'instant',block:'center'})`);
  const png=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'follow-team-mobile.png'),Buffer.from(png.data,'base64'));
  await click('#followTeamSummary button');assert.equal(await evaluate(`activeTeamDetail.name`),'我們這一隊');
  await evaluate(`switchPage('home')`);await click('#clearFollowTeam');assert.equal(await evaluate(`localStorage.getItem(followStorageKey)`),null);assert.equal(await evaluate(`document.activeElement.id`),'followTeamSelect');
  await navigate();assert.equal(await evaluate(`document.querySelector('#followTeamSelect').value`),'');
  await evaluate(`saveFollowedTeam('removed-team');renderFollowedTeam()`);assert((await evaluate(`document.querySelector('#followTeamSummary').innerText`)).includes('原關注球隊'));
  await evaluate(`saveFollowedTeam('A01');games=[];renderFollowedTeam()`);assert((await evaluate(`document.querySelector('#followTeamSummary').innerText`)).includes('目前沒有後續賽程'));
  await navigate();
  await evaluate(`Storage.prototype.setItem=function(){throw Error('blocked')};Storage.prototype.removeItem=function(){throw Error('blocked')};saveFollowedTeam('A01');renderFollowedTeam()`);assert((await evaluate(`document.querySelector('#followStorageNotice').innerText`)).includes('無法儲存'));assert.equal(await evaluate(`document.querySelector('#followTeamSelect').value`),'A01');
  assert.deepEqual(errors,[]);
  const evidence={url,summary:await evaluate('WuriLeagueApp.getSummary()'),matrix,checks:{reloadPersistence:true,replacement:true,cancellationAndFocus:true,teamNavigation:true,staleTeam:true,noFutureMatch:true,blockedStorage:true},browserErrors:errors};
  fs.writeFileSync(path.join(out,'browser-evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({ok:true,cases:matrix.length,checks:evidence.checks,browserErrors:errors,evidence:path.join(out,'browser-evidence.json')},null,2));
})().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(async()=>{clearTimeout(deadline);if(socket?.readyState===WebSocket.OPEN){try{await call('Browser.close',{},true)}catch{}socket.close()}if(chrome.exitCode===null)chrome.kill();});
