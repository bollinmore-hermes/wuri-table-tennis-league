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
async function navigate(){await call('Page.navigate',{url});await evaluate(`new Promise((resolve,reject)=>{const until=Date.now()+20000;const tick=()=>{if(window.WuriLeagueApp?.getSummary().teams>0&&typeof followDatasetLoaded!=='undefined'&&followDatasetLoaded)return resolve(true);if(Date.now()>until)return reject(Error('data hydration timeout'));setTimeout(tick,50)};tick()})`)}
async function click(selector){const point=await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({behavior:'instant',block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1})}
(async()=>{
  const endpoint=await new Promise((resolve,reject)=>{let text='';chrome.stderr.on('data',b=>{text+=b;const m=text.match(/DevTools listening on (ws:\/\/\S+)/);if(m)resolve(m[1])});chrome.on('error',reject);chrome.on('exit',code=>reject(Error('Chrome exited '+code)))});
  socket=new WebSocket(endpoint);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject});
  socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(Error(m.error.message));else p?.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text)};
  const target=await call('Target.createTarget',{url:'about:blank'},true);sessionId=(await call('Target.attachToTarget',{targetId:target.targetId,flatten:true},true)).sessionId;
  await call('Page.enable');await call('Runtime.enable');
  await call('Page.addScriptToEvaluateOnNewDocument',{source:"const originalScroll=window.scrollTo.bind(window);window.scrollTo=options=>originalScroll({...options,behavior:'instant'});"});
  await navigate();
  const provenance=await evaluate(`(async()=>{if(!config.pointerUrl)return {mode:config.mode};const p=await (await fetch(config.pointerUrl+'?verify='+Date.now(),{cache:'no-store'})).json();return {warning:repository.warning,match:repository.metadata?.snapshotId===p.snapshotId&&repository.metadata?.contentHash===p.contentHash}})()`);
  if(provenance.match!==undefined){assert.equal(provenance.warning,null);assert.equal(provenance.match,true)}
  await evaluate(`saveFollowedTeam(null);renderFollowedTeam()`);
  assert.equal(await evaluate(`document.querySelector('#followTeamCard').checkVisibility()`),false);
  assert.equal(await evaluate(`document.querySelector('#followTeamSelect')`),null);
  await click('[data-page="teams"]');
  const firstName=await evaluate(`teams.A[0]`);
  await click('article[data-team='+JSON.stringify(firstName)+']');
  assert.equal(await evaluate(`document.querySelector('#followTeamToggle').textContent`),'關注此隊');
  await click('#followTeamToggle');assert.equal(await evaluate(`document.activeElement.id`),'followTeamToggle');
  assert.equal(await evaluate(`localStorage.getItem(followStorageKey)`),'A01');
  await navigate();assert.equal(await evaluate(`document.querySelector('#followTeamCard').checkVisibility()`),true);
  const matrix=[];
  for(const width of [320,390,768,1280])for(const locale of ['zh','en'])for(const theme of ['light','dark']){
    await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
    await evaluate(`applyLocale('${locale}');WuriLeagueTheme.set('${theme}');goToTeam(teams.B[0],'B')`);
    assert.equal(await evaluate(`document.querySelector('#snapshotNotice')`),null);
    assert.equal(await evaluate(`document.querySelector('#followTeamDetailNotice').textContent`),'');
    if(await evaluate(`followedTeamCode!=='B01'`))await click('#followTeamToggle');
    const detail=await evaluate(`(()=>{const b=document.querySelector('#followTeamToggle'),r=b.getBoundingClientRect(),card=b.closest('.team-detail').getBoundingClientRect();return {pressed:b.getAttribute('aria-pressed'),text:b.textContent,buttonFits:r.left>=card.left&&r.right<=card.right,labelFits:b.scrollWidth<=b.clientWidth,noOverflow:document.documentElement.scrollWidth<=innerWidth}})()`);
    assert.equal(detail.pressed,'true');assert.equal(detail.text,locale==='zh'?'取消關注':'Unfollow');assert(detail.buttonFits&&detail.labelFits&&detail.noOverflow,JSON.stringify(detail));
    await evaluate(`switchPage('home')`);
    const result=await evaluate(`(() => {const card=document.querySelector('#followTeamCard'),r=card.getBoundingClientRect(),summary=document.querySelector('#followTeamSummary'),rank=standings('B',{key:'pts',dir:'desc'}).findIndex(row=>row.name===teams.B[0])+1;return {width:innerWidth,locale:'${locale}',theme:'${theme}',visible:card.checkVisibility(),noOverflow:document.documentElement.scrollWidth<=innerWidth,cardFits:r.left>=0&&r.right<=innerWidth,summary:summary.innerText,expectedRank:rank,stored:localStorage.getItem(followStorageKey)}})()`);
    assert.equal(result.width,width);assert(result.visible&&result.noOverflow&&result.cardFits,JSON.stringify(result));assert.equal(result.stored,'B01');assert(result.summary.includes(locale==='zh'?`第 ${result.expectedRank} 名`:`Rank ${result.expectedRank}`));matrix.push({...result,detail});
  }
  await evaluate(`applyLocale('zh');WuriLeagueTheme.set('light')`);
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});
  await evaluate(`document.querySelector('#followTeamCard').scrollIntoView({behavior:'instant',block:'center'})`);
  let png=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'follow-team-home-mobile.png'),Buffer.from(png.data,'base64'));
  await click('#followTeamSummary button');assert.equal(await evaluate(`activeTeamDetail.name`),'我們這一隊');
  await evaluate(`document.querySelector('.team-detail').scrollIntoView({behavior:'instant',block:'center'})`);
  png=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'follow-team-detail-mobile.png'),Buffer.from(png.data,'base64'));
  await click('#followTeamToggle');assert.equal(await evaluate(`localStorage.getItem(followStorageKey)`),null);assert.equal(await evaluate(`document.activeElement.id`),'followTeamToggle');
  assert.equal(await evaluate(`document.querySelector('#followTeamToggle').textContent`),'關注此隊');
  await evaluate(`switchPage('home')`);assert.equal(await evaluate(`document.querySelector('#followTeamCard').checkVisibility()`),false);
  await navigate();assert.equal(await evaluate(`document.querySelector('#followTeamCard').checkVisibility()`),false);
  await evaluate(`saveFollowedTeam('removed-team');renderFollowedTeam()`);assert.equal(await evaluate(`document.querySelector('#followTeamCard').checkVisibility()`),false);
  await evaluate(`saveFollowedTeam('A01');games=[];renderFollowedTeam()`);assert((await evaluate(`document.querySelector('#followTeamSummary').innerText`)).includes('目前沒有後續賽程'));
  await navigate();await evaluate(`goToTeam(teams.B[0],'B');Storage.prototype.setItem=function(){throw Error('blocked')};Storage.prototype.removeItem=function(){throw Error('blocked')}`);
  await click('#followTeamToggle');assert((await evaluate(`document.querySelector('#followTeamDetailNotice').innerText`)).includes('無法儲存'));assert.equal(await evaluate(`followedTeamCode`),'B01');
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});await call('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
  assert.equal(await evaluate(`followedTeamCode`),null);assert.equal(await evaluate(`document.activeElement.id`),'followTeamToggle');
  assert.deepEqual(errors,[]);
  const evidence={url,provenance,summary:await evaluate('WuriLeagueApp.getSummary()'),matrix,checks:{detailFollowButton:true,homeHasNoSelector:true,homeHiddenWhenUnfollowed:true,reloadPersistence:true,replacement:true,cancellationAndFocus:true,keyboardToggle:true,teamNavigation:true,staleTeam:true,noFutureMatch:true,blockedStorage:true},browserErrors:errors};
  fs.writeFileSync(path.join(out,'browser-evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({ok:true,cases:matrix.length,checks:evidence.checks,browserErrors:errors,evidence:path.join(out,'browser-evidence.json')},null,2));
})().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(async()=>{clearTimeout(deadline);if(socket?.readyState===WebSocket.OPEN){try{await call('Browser.close',{},true)}catch{}socket.close()}if(chrome.exitCode===null)chrome.kill();});
