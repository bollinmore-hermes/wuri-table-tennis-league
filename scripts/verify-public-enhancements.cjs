// Run against a built read-only artifact; Playwright is an external test tool.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const url=process.argv[2],evidence=process.argv[3];
if(!url||!evidence)throw Error('Provide artifact URL and evidence directory');
fs.mkdirSync(evidence,{recursive:true});
(async()=>{
 const browser=await chromium.launch(),results=[];
 try{
  for(const width of [320,390,768,900,1024,1440])for(const locale of ['zh','en'])for(const theme of ['light','dark']){
   console.log(`Checking ${width}/${locale}/${theme}`);
   const context=await browser.newContext({viewport:{width,height:900},colorScheme:theme,isMobile:width<540,hasTouch:width<540});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{const original=window.scrollTo.bind(window);window.scrollTo=options=>original({...options,behavior:'instant'})});
   await page.goto(url);await page.addStyleTag({content:'html{scroll-behavior:auto!important}*{transition:none!important}'});
   assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
   await page.locator(`[data-locale="${locale}"]`).click();
   const nav=route=>page.locator(`nav [data-page="${route}"]`).click();
   const noOverflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}/${locale}/${theme} overflow`);
   const setDate=async date=>width<=820?page.locator(`[data-schedule-date="${date}"]`).click():page.locator('#dateFilter').selectOption(date);
   await noOverflow();
   // Measure actual computed foreground/background pairs for normal-sized text.
   const contrast=await page.evaluate(()=>{
    const root=getComputedStyle(document.documentElement),v=name=>root.getPropertyValue(name).trim();
    const luminance=color=>{const channels=color.startsWith('#')?[0,2,4].map(i=>parseInt(color.slice(1+i,3+i),16)/255):color.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>x/255);return channels.map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0)};
    const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
    const pairs=[['body',v('--text'),v('--bg')],['card',v('--text'),v('--surface')],['secondary',v('--muted'),v('--surface')],['group A',v('--group-a-ink'),v('--group-a-bg')],['group B',v('--group-b-ink'),v('--group-b-bg')],['rank A',v('--accent-ink'),v('--group-a-bg')],['rank B',v('--accent-ink'),v('--group-b-bg')],['up',v('--trend-up'),v('--surface')],['down',v('--trend-down'),v('--surface')]];
    for(const selector of ['.completion-mark','.result-mark.win','.result-mark.loss','.lang-btn.active','.btn-primary']){const node=document.querySelector(selector);if(node){const s=getComputedStyle(node);pairs.push([selector,s.color,s.backgroundColor])}}
    return pairs.map(([label,a,b])=>({label,ratio:ratio(a,b)}));
   });
   for(const pair of contrast)assert.ok(pair.ratio>=4.5,`${theme}/${pair.label} contrast ${pair.ratio}`);
   await nav('schedule');const defaultDate=await page.locator('#dateFilter').inputValue();
   await page.locator('#clearScheduleFilters').click();
   assert.equal(await page.locator('#allGames .game').count(),60);
   const reference=await page.evaluate(()=>games.map(({home,away,date,group})=>({home,away,date,group})));
   const names=await page.locator('#teamFilter option').evaluateAll(nodes=>nodes.map(n=>n.value).filter(v=>v!=='ALL'));
   assert.equal(names.length,12);
   for(const name of names){
    await page.locator('#teamFilter').selectOption(name);
    const actual=await page.locator('#allGames .game').evaluateAll(cards=>cards.map(card=>card.getAttribute('aria-label')).sort());
    const expected=reference.filter(g=>g.home===name||g.away===name).map(g=>`${g.home} vs ${g.away}`).sort();
    assert.deepEqual(actual,expected);
   }
   await page.locator('#teamFilter').selectOption(names[0]);
   for(const group of ['ALL','A','B']){
    await page.locator(`[data-group="${group}"]`).click();
    const date=reference[0].date;await setDate(date);
    assert.equal(await page.locator('#allGames .game').count(),reference.filter(g=>(g.home===names[0]||g.away===names[0])&&g.date===date&&(group==='ALL'||g.group===group)).length);
    if(group==='B')assert.ok(await page.locator('.schedule-empty').isVisible());
   }
   await page.locator('#clearScheduleFilters').click();
   if(width<=820){
    const pills=page.locator('#datePills');assert.ok(await pills.isVisible());
    assert.ok(await pills.evaluate(n=>n.scrollWidth>n.clientWidth));
    const values=await pills.locator('button').evaluateAll(nodes=>nodes.map(n=>n.dataset.scheduleDate));
    for(const date of values){await setDate(date);assert.equal(await page.locator('#dateFilter').inputValue(),date);assert.equal(await pills.locator('[aria-pressed="true"]').getAttribute('data-schedule-date'),date);await noOverflow()}
    const last=pills.locator('button').last();await last.focus();await page.keyboard.press('Home');assert.equal(await page.locator('#dateFilter').inputValue(),'ALL');
    await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#dateFilter').inputValue(),values[1]);
    await page.keyboard.press('End');assert.equal(await page.locator('#dateFilter').inputValue(),values.at(-1));
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.scheduleDate),values.at(-1));
    await page.locator(`[data-locale="${locale==='zh'?'en':'zh'}"]`).click();assert.equal(await page.locator('#dateFilter').inputValue(),values.at(-1));
    await page.locator(`[data-locale="${locale}"]`).click();
   }else assert.ok(await page.locator('#dateFilter').isVisible());
   await page.locator('#teamFilter').selectOption(names[0]);await nav('schedule');
   assert.equal(await page.locator('#teamFilter').inputValue(),'ALL');assert.equal(await page.locator('#dateFilter').inputValue(),defaultDate);
   assert.equal(await page.locator('#groupFilters .active').getAttribute('data-group'),'ALL');
   await page.locator('#clearScheduleFilters').click();await page.locator('#teamFilter').selectOption(names[0]);
   await noOverflow();
   if([390,1440].includes(width))await page.screenshot({path:path.join(evidence,`schedule-${width}-${locale}-${theme}.png`),fullPage:true});
   for(const route of ['home','standings','teams']){await nav(route);await noOverflow();assert.equal(await page.locator('html').getAttribute('data-theme'),theme)}
   await page.locator('#teamGrid .team-card').first().click();await noOverflow();
   await nav('home');await page.locator('#homeVenueButton').click();assert.ok(await page.locator('#venueDialog').isVisible());await noOverflow();
   assert.ok(await page.locator('#venueDialog .venue-map').isVisible());
   await page.locator('[data-close-info="venueDialog"]').click();await page.locator('#leagueOverview').click();assert.ok(await page.locator('#overviewDialog').isVisible());await page.locator('[data-close-info="overviewDialog"]').click();
   await page.locator('#themeToggle').focus();await page.keyboard.press('Enter');
   const toggled=theme==='light'?'dark':'light';assert.equal(await page.locator('html').getAttribute('data-theme'),toggled);
   await page.reload();assert.equal(await page.locator('html').getAttribute('data-theme'),toggled);
   await page.emulateMedia({colorScheme:theme});assert.equal(await page.locator('html').getAttribute('data-theme'),toggled);
   assert.deepEqual(errors,[]);results.push({width,locale,theme,teams:names.length,dateKeyboard:width<=820,minimumContrast:Math.min(...contrast.map(p=>p.ratio)),errors});await context.close();
  }
  // Storage access can be denied in privacy-restricted browsers.
  const context=await browser.newContext(),page=await context.newPage();
  await page.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('storage blocked')}})});
  await page.goto(url);await page.locator('#themeToggle').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await context.close();
  const report={ok:true,artifact:url,combinations:results.length,teamFilterChecks:results.reduce((n,r)=>n+r.teams,0),storageBlocked:true,results};
  fs.writeFileSync(path.join(evidence,'feature-browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
