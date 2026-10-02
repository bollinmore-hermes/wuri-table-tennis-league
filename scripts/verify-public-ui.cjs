// Optional browser verification: NODE_PATH=<playwright install> node scripts/verify-public-ui.cjs <artifact URL> <evidence directory>
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const url=process.argv[2],evidence=process.argv[3];
if(!url||!evidence)throw new Error('Provide the built artifact URL and evidence directory');
fs.mkdirSync(evidence,{recursive:true});
(async()=>{
  const browser=await chromium.launch();
  const results=[];
  try{
    for(const width of (process.env.UI_WIDTHS||'320,390,768,900,1024,1440').split(',').map(Number))for(const locale of ['zh','en']){
      console.log(`Checking ${width}px / ${locale}`);
      const context=await browser.newContext({viewport:{width,height:900},isMobile:width<540,hasTouch:width<540});
      const page=await context.newPage(),errors=[];
      page.setDefaultTimeout(10000);
      await page.addInitScript(()=>{const original=window.scrollTo.bind(window);window.scrollTo=options=>original({...options,behavior:'instant'})});
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(url);
      await page.addStyleTag({content:'html{scroll-behavior:auto!important}'});
      await page.locator(`[data-locale="${locale}"]`).click();
      const nav=route=>page.locator(`nav [data-page="${route}"]`).click();
      const noOverflow=async(label)=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}/${locale}: ${label} document overflow`);
      assert.deepEqual(await page.evaluate(()=>WuriLeagueApp.getSummary()),{teams:12,matches:60,results:26});
      assert.deepEqual(await page.locator('.compact-table tbody').evaluateAll(bodies=>bodies.map(body=>body.rows.length)),[6,6]);
      await noOverflow('home');
      assert.ok(await page.locator('nav .nav-btn').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).whiteSpace==='nowrap'&&node.scrollWidth<=node.clientWidth)),'navigation labels must fit');
      const teams=await page.locator('#teamGrid .team-card').evaluateAll(cards=>cards.map(card=>({name:card.dataset.team,group:card.dataset.tgroup})));
      await nav('schedule');
      const defaultDate=await page.locator('#dateFilter').inputValue();
      for(const source of ['home','schedule','standings','teams']){
        await nav('schedule');
        await page.locator('[data-group="A"]').click();
        await page.locator('#dateFilter').selectOption('ALL');
        await nav(source);await nav('schedule');
        assert.equal(await page.locator('#dateFilter').inputValue(),defaultDate);
        assert.equal(await page.locator('#groupFilters .active').getAttribute('data-group'),'ALL');
        await noOverflow('schedule');
        await nav('teams');
        await page.locator('[data-team-group="B"]').click();
        await page.locator('#teamGrid .team-card').first().click();
        await nav(source);await nav('teams');
        assert.equal(await page.locator('#teamDetail').textContent(),'');
        assert.equal(await page.locator('#teamGrid .team-card').count(),12);
        assert.equal(await page.locator('#teamFilters .active').getAttribute('data-team-group'),'ALL');
        await noOverflow('teams');
        await nav(source);await page.locator('.brand').click();
        assert.equal(await page.locator('.page.active').getAttribute('id'),'home');
      }
      for(const team of teams){
        // Exercise each actual standings link, not only the exported render helper.
        await nav('standings');
        await page.locator(`#standings${team.group} [data-team-link]`).filter({hasText:team.name}).click();
        assert.equal(await page.locator('.team-detail h2').textContent(),team.name);
        assert.ok(await page.locator('[data-back-teams]').evaluate(button=>{const rect=button.getBoundingClientRect();return rect.top>=document.querySelector('header').getBoundingClientRect().bottom&&rect.bottom<=innerHeight}),'back button must be visible below sticky header');
        assert.equal(await page.locator('#teamFilters .active').getAttribute('data-team-group'),team.group);
        assert.equal(await page.locator('.opponent-table th').nth(1).textContent(),locale==='zh'?'勝率':'Win%');
        const rows=await page.locator('.opponent-table tbody tr').evaluateAll(rows=>rows.map(row=>({pct:row.cells[1].textContent,played:Number(row.cells[2].textContent),wins:Number(row.cells[3].textContent)})));
        assert.equal(rows.length,5);
        const rates=rows.map(row=>row.played?row.wins/row.played:-1);
        assert.deepEqual(rates,[...rates].sort((a,b)=>b-a));
        const layout=await page.locator('.opponent-table').evaluate(table=>({width:table.getBoundingClientRect().width,wrapper:table.parentElement.clientWidth,cellOverflow:[...table.querySelectorAll('th,td')].some(cell=>cell.scrollWidth>cell.clientWidth+1)}));
        assert.ok(layout.width<=layout.wrapper+1,'opponent table must fit its wrapper');
        assert.equal(layout.cellOverflow,false,`${width}/${locale}/${team.name}: opponent cells overflow`);
        await noOverflow(`team detail ${team.name}`);
        if(team===teams[0]&&(width===390||width===1440))await page.screenshot({path:path.join(evidence,`detail-${width}-${locale}.png`),fullPage:true});
        await page.locator('[data-back-teams]').click();
        assert.equal(await page.locator('#teamDetail').textContent(),'');
        assert.equal(await page.locator('#teamGrid .team-card').count(),12);
        assert.equal(await page.locator('#teamFilters .active').getAttribute('data-team-group'),'ALL');
        assert.equal(await page.evaluate(()=>document.activeElement?.dataset.teamGroup),'ALL');
      }
      for(const key of ['Enter','Space']){
        await nav('teams');await page.locator('.brand').focus();await page.keyboard.press(key);
        assert.equal(await page.locator('.page.active').getAttribute('id'),'home');
      }
      await nav('home');
      if(width===390||width===1440)await page.screenshot({path:path.join(evidence,`home-${width}-${locale}.png`),fullPage:true});
      assert.deepEqual(errors,[]);
      const broken=await page.locator('img').evaluateAll(images=>images.filter(image=>image.complete&&image.naturalWidth===0).map(image=>image.src));
      assert.deepEqual(broken,[]);
      results.push({width,locale,teamDetails:teams.length,homeRows:[6,6],navigationSources:4,keyboard:true,tableAndDocumentOverflow:false,pageErrors:errors});
      await context.close();
    }
    const response=await fetch(new URL('admin.html',url));
    assert.equal(response.status,404,'read-only artifact must not serve admin.html');
    const report={ok:true,artifact:url,combinations:results.length,teamDetails:results.reduce((n,row)=>n+row.teamDetails,0),results};
    fs.writeFileSync(path.join(evidence,'browser-report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
