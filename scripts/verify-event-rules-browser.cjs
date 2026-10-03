'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const site=process.argv[2],output=process.argv[3];assert(site&&output);
(async()=>{
 const version=await(await fetch('http://127.0.0.1:9222/json/version')).json();const socket=new WebSocket(version.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});let serial=0,session,context,target;const pending=new Map(),errors=[];
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error('CDP protocol failure')):p.resolve(m.result)}}else if(m.sessionId===session&&m.method==='Runtime.exceptionThrown')errors.push('page_runtime_exception')});
 const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout'))},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}))});const page=(method,params={})=>call(method,params,session);
 const evaluate=async expression=>{const result=await page('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error('Browser assertion/evaluation failed');return result.result.value};
 const ready=async predicate=>{for(let i=0;i<300;i++){if(await evaluate(predicate))return;await new Promise(resolve=>setTimeout(resolve,100))}throw new Error('Live application readiness timeout')};
 const click=async selector=>{const box=await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n)throw new Error('control absent');n.scrollIntoView({block:'center',behavior:'instant'});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await page('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...box});await page('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...box})};

 const result={browser:version.Browser,ok:false,pageCases:0,crossPageChecks:0,keyboardChecks:0,extraChecks:0,site};
 try{
  context=(await call('Target.createBrowserContext')).browserContextId;target=(await call('Target.createTarget',{url:'about:blank',browserContextId:context})).targetId;session=(await call('Target.attachToTarget',{targetId:target,flatten:true})).sessionId;await page('Page.enable');await page('Runtime.enable');await page('Network.enable');await page('Network.setCacheDisabled',{cacheDisabled:true});

  const goto=async(url,predicate)=>{await page('Page.navigate',{url});await ready(predicate);await evaluate("document.documentElement.style.scrollBehavior='auto';document.head.append(Object.assign(document.createElement('style'),{textContent:'*{scroll-behavior:auto!important;animation:none!important;transition:none!important}'}))")};
  const homeReady="document.readyState==='complete'&&window.WuriLeagueApp&&document.querySelectorAll('.team-card').length===12";
  const rulesReady="document.readyState==='complete'&&window.WuriEventRulesPage";
  for(const width of [360,390,768,1280])for(const locale of ['zh','en'])for(const theme of ['light','dark']){
    await page('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    await goto(site,homeReady);await click(`[data-locale="${locale}"]`);await evaluate(`WuriLeagueTheme.set(${JSON.stringify(theme)})`);
    assert(await evaluate("document.querySelectorAll('#eventRulesEntry').length===1&&document.querySelectorAll('#homeA tbody tr,#homeB tbody tr').length===12&&document.documentElement.scrollWidth<=innerWidth"),'home layout/content');result.pageCases++;
    if(width===390&&locale==='zh'&&theme==='light'){const image=await page('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(output.replace('.json','-home-mobile.png'),Buffer.from(image.data,'base64'))}
    await click('#eventRulesEntry');await ready(rulesReady);
    const state=await evaluate("(()=>{const en=document.documentElement.lang==='en';return {locale:en?'en':'zh',theme:document.documentElement.dataset.theme,points:document.querySelectorAll('.order .point').length,seats:document.querySelectorAll('.seat').length,overflow:document.documentElement.scrollWidth>innerWidth,date:document.querySelector('time').getAttribute('datetime'),emptyTranslations:Array.from(document.querySelectorAll('[data-t]')).filter(n=>!n.textContent.trim()).length,navFits:Array.from(document.querySelectorAll('header .nav-btn')).every(n=>n.scrollWidth<=n.clientWidth+1),title:document.querySelector('h1').textContent}})()");
    assert.deepEqual(state,{locale,theme,points:3,seats:6,overflow:false,date:'2026-12-06',emptyTranslations:0,navFits:true,title:locale==='zh'?'賽事規則':'Event rules'});result.pageCases++;result.crossPageChecks++;
    await click('#theme');assert.equal(await evaluate('document.documentElement.dataset.theme'),theme==='dark'?'light':'dark');await click('#theme');
    if(width===390&&locale==='zh'&&theme==='light'){
      await evaluate('window.scrollTo(0,0)');const image=await page('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(output.replace('.json','-rules-mobile.png'),Buffer.from(image.data,'base64'));
    }
    await click('.back-link');await ready(homeReady);assert(await evaluate(`document.documentElement.lang===${JSON.stringify(locale==='zh'?'zh-Hant':'en')}&&document.documentElement.dataset.theme===${JSON.stringify(theme)}&&document.querySelector('.page.active').id==='home'`));result.crossPageChecks++;
    await evaluate("document.getElementById('eventRulesEntry').focus()");await page('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await page('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await ready(rulesReady);result.keyboardChecks++;
    for(const name of ['schedule','standings','teams','home']){
      await click(`header a[href="index.html#${name}"]`);await ready(homeReady);assert.equal(await evaluate("document.querySelector('.page.active').id"),name);result.crossPageChecks++;
      if(name==='standings'){await click('.ranking-guide summary');await click('#rankingRulesLink')}else{await click('.nav-btn[data-page="home"]');await click('#eventRulesEntry')}
      await ready(rulesReady);result.crossPageChecks++;
    }
  }
  // Shared bootstrap supports system preference and blocked localStorage.
  await page('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});await goto(site+'event-rules.html',rulesReady);await evaluate('localStorage.removeItem("wuriLeagueTheme")');await goto(site+'event-rules.html',rulesReady);assert.equal(await evaluate('document.documentElement.dataset.theme'),'dark');
  await page('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});await ready("document.documentElement.dataset.theme==='light'");result.extraChecks++;
  const blocked=await page('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(window,'localStorage',{get(){throw new Error('storage blocked')}})"});await goto(site+'event-rules.html',rulesReady);assert(await evaluate("document.documentElement.lang==='zh-Hant'&&document.querySelectorAll('.seat').length===6"));await click('[data-lang="en"]');await click('#theme');assert.equal(await evaluate('document.documentElement.lang'),'en');await page('Page.removeScriptToEvaluateOnNewDocument',{identifier:blocked.identifier});result.extraChecks++;
  // Rules remain available when league data is disabled.
  const disabled=await page('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(window,'LEAGUE_CONFIG',{value:Object.freeze({mode:'disabled'}),writable:false,configurable:true})"});
  await goto(site,"document.readyState==='complete'&&window.WuriLeagueApp");await click('#eventRulesEntry');await ready(rulesReady);assert(await evaluate("document.querySelectorAll('.seat').length===6"));await page('Page.removeScriptToEvaluateOnNewDocument',{identifier:disabled.identifier});result.extraChecks++;
  // Unrelated admin route remains login gated; never sign in or send writes.
  const admin=await fetch(site+'admin/');if(admin.ok){await goto(site+'admin/',"document.readyState==='complete'&&window.LeagueAdminRepository&&document.getElementById('loginView')");assert(await evaluate("!document.getElementById('loginView').classList.contains('hidden')&&document.getElementById('appView').classList.contains('hidden')"));result.extraChecks++}
  assert.deepEqual(errors,[]);result.ok=true;result.pageErrors=0;result.verifiedAt=new Date().toISOString();fs.writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{if(target)await call('Target.closeTarget',{targetId:target}).catch(()=>{});if(context)await call('Target.disposeBrowserContext',{browserContextId:context}).catch(()=>{});socket.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1});
