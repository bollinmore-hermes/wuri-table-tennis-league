'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.argv[2]||path.join(root,'docs/evidence/issue-29'));
const publicUrl=process.argv[3]||'http://127.0.0.1:8879/',adminUrl=process.argv[4]||'http://127.0.0.1:8880/';
(async()=>{
 const version=await (await fetch('http://127.0.0.1:9222/json/version')).json();const ws=new WebSocket(version.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
 let serial=0,session,target;const pending=new Map(),errors=[];
 ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const p=pending.get(message.id);if(p){pending.delete(message.id);clearTimeout(p.timer);message.error?p.reject(new Error(JSON.stringify(message.error))):p.resolve(message.result)}}else if(message.sessionId===session&&message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text)});
 const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method))},15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}: {})}))});
 const page=(method,params={})=>call(method,params,session);
 const evaluate=async(expression)=>{const result=await page('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value};
 const ready=async(predicate)=>{for(let i=0;i<100;i++){if(await evaluate(predicate))return;await new Promise(resolve=>setTimeout(resolve,50))}throw new Error('Application readiness timeout')};
 const click=async(selector)=>{const box=await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n)throw new Error('Missing control');n.scrollIntoView({block:'center',behavior:'instant'});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await page('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...box});await page('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...box})};
 const screenshot=async(name)=>{const result=await page('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,name),Buffer.from(result.data,'base64'))};
 const matrix=[];
 fs.mkdirSync(out,{recursive:true});
 try{
  target=(await call('Target.createTarget',{url:'about:blank'})).targetId;session=(await call('Target.attachToTarget',{targetId:target,flatten:true})).sessionId;
  await page('Page.enable');await page('Runtime.enable');
  await page('Page.navigate',{url:publicUrl});await ready("document.readyState==='complete'&&!!window.WuriLeagueApp&&document.querySelectorAll('.team-card').length===12");
  await evaluate("window.scrollTo=()=>{};document.documentElement.style.scrollBehavior='auto';document.head.append(Object.assign(document.createElement('style'),{textContent:'*{scroll-behavior:auto!important;animation:none!important;transition:none!important}'}));");
  const official=require('../assets/js/official-data.js');
  for(const width of [360,390,768,1280])for(const locale of ['zh','en'])for(const theme of ['light','dark']){
    await page('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    await click(`[data-locale="${locale}"]`);await evaluate(`WuriLeagueTheme.set(${JSON.stringify(theme)})`);
    await click('.nav-btn[data-page="teams"]');
    for(const team of official.teams){
      await click(`.team-card[data-team="${team.name}"]`);
      const actual=await evaluate("(()=>{const s=document.querySelector('[data-public-roster]');return {names:Array.from(s.querySelectorAll('li')).map(n=>n.textContent),headings:Array.from(s.querySelectorAll('h2,h3')).map(n=>n.textContent),overflow:document.documentElement.scrollWidth>innerWidth,sectionOverflow:s.scrollWidth>s.clientWidth}})()");
      assert.deepEqual(actual.names,official.roster.filter(row=>row.team_code===team.team_code).map(row=>row.display_name));assert.equal(actual.overflow,false);assert.equal(actual.sectionOverflow,false);assert.equal(actual.headings[0],locale==='zh'?'球隊名冊':'Team roster');
      matrix.push({width,locale,theme,team_code:team.team_code,members:actual.names.length,overflow:false});
      if(team.team_code==='A03'&&locale==='zh'&&theme==='light'&&(width===390||width===1280)){await evaluate("document.querySelector('[data-public-roster]').scrollIntoView({block:'center',behavior:'instant'})");await screenshot(`public-roster-${width}.png`)}
      await click('[data-back-teams]');assert.equal(await evaluate("document.querySelectorAll('.team-card').length"),12);
    }
  }
  // The management layout uses synthetic names only; no private roster leaves local SQL verification.
  await page('Page.navigate',{url:adminUrl});await ready("document.readyState==='complete'&&!!window.LeagueAdminRepository");
  await evaluate("localStorage.removeItem('wuriLeagueAdminV2');document.getElementById('mockRole').value='admin'");await click('#mockLogin');await ready("!document.getElementById('appView').classList.contains('hidden')&&document.querySelectorAll('#teamRows tr').length===12");
  await page('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await click('[data-page="teams"]');await click('#teamRows tr:first-child .icon-btn');await click('#addPlayer');
  await evaluate("document.querySelector('.roster-editor input[aria-label=\"完整姓名\"]').value='測試甲';document.querySelector('.roster-editor select[aria-label=\"名冊角色\"]').value='leader';document.querySelector('.roster-editor select[aria-label=\"公開名冊\"]').value='true'");
  await click('.roster-editor .primary');await ready("document.getElementById('rosterList').textContent.includes('測試甲')");
  assert(await evaluate("document.getElementById('rosterList').textContent.includes('領隊')&&document.getElementById('rosterList').textContent.includes('公開遮罩')"));
  for(const width of [360,390,768,1280]){
    await page('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    await evaluate("Array.from(document.querySelectorAll('.roster-summary')).find(n=>n.textContent.includes('測試甲')).click()");
    const geometry=await evaluate("(()=>{const d=document.getElementById('rosterDialog'),e=document.querySelector('.roster-editor'),r=d.getBoundingClientRect();return {documentOverflow:document.documentElement.scrollWidth>innerWidth,editorOverflow:e.scrollWidth>e.clientWidth,dialogWithin:r.left>=0&&r.right<=innerWidth,controls:Array.from(e.querySelectorAll('input,select')).map(n=>({label:n.getAttribute('aria-label'),width:n.getBoundingClientRect().width}))}})()");
    assert.equal(geometry.documentOverflow,false);assert.equal(geometry.editorOverflow,false);assert(geometry.dialogWithin);assert(geometry.controls.every(control=>control.width>0));matrix.push({admin:true,width,...geometry});
    if(width===390||width===1280)await screenshot(`admin-synthetic-roster-${width}.png`);
  }
  await click('#rosterDialog .dialog-foot button');await click('#logout');await ready("document.readyState==='complete'&&document.getElementById('mockLogin')!==null");
  await evaluate("document.getElementById('mockRole').value='scorer'");await click('#mockLogin');await ready("!document.getElementById('appView').classList.contains('hidden')");
  await evaluate("document.querySelector('[data-page=teams]').click()");
  assert.equal(await evaluate("document.getElementById('appView').textContent.includes('測試甲')"),false);
  assert.equal(await evaluate("Array.from(document.querySelectorAll('#teamRows button,#teamCards button')).filter(n=>n.textContent==='名單').length"),0);
  matrix.push({scorer:true,privateNameAbsent:true,rosterButtons:0});
  await evaluate("localStorage.removeItem('wuriLeagueAdminV2')");
  assert.deepEqual(errors,[]);
  const evidence={ok:true,browser:version.Browser,publicArtifact:'pages-dist',adminArtifact:'admin-demo-dist (synthetic names; local demo only)',animationTimingExcluded:true,matrix,errors,remoteVerified:false};
  fs.writeFileSync(path.join(out,'browser-verification.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({ok:true,browser:version.Browser,publicCases:matrix.filter(row=>!row.admin&&!row.scorer).length,adminWidths:matrix.filter(row=>row.admin).length,scorerVerified:true,pageErrors:errors.length,evidence:out},null,2));
 }finally{if(target)await call('Target.closeTarget',{targetId:target}).catch(()=>{});ws.close();}
})().catch(error=>{console.error(JSON.stringify({ok:false,error:error.message}));process.exitCode=1});
