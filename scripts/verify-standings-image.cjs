/* Run with PLAYWRIGHT_MODULE_PATH pointing to an installed Playwright module. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const pw=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const baselineHTML=execFileSync('git',['show','origin/main:index.html'],{cwd:path.join(__dirname,'..'),encoding:'utf8'});
const url=process.env.STANDINGS_TEST_URL||'http://127.0.0.1:8755/pages-dist/';
const output=process.env.STANDINGS_EVIDENCE_DIR||path.join(__dirname,'../evidence/issue-54');
async function main(){
 fs.mkdirSync(output,{recursive:true});const results=[];
 for(const engine of ['chromium','webkit']){
  const browser=await pw[engine].launch({headless:true});
  try{
   const context=await browser.newContext({...pw.devices[engine==='webkit'?'iPhone 13':'Pixel 5'],viewport:{width:390,height:844},deviceScaleFactor:1});
   if(engine==='chromium')await context.grantPermissions(['clipboard-read','clipboard-write']);
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url+'#standings');await page.waitForSelector('#standingsA tbody tr');
   const baselinePage=await context.newPage();await baselinePage.route('**/*',route=>route.request().resourceType()==='document'?route.fulfill({contentType:'text/html',body:baselineHTML}):route.continue());
   await baselinePage.goto(url+'#standings');await baselinePage.waitForSelector('#standingsA tbody tr');
   // Suppress theme transitions only in verification so baseline colors are deterministic.
   for(const p of [page,baselinePage])await p.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important}'});
   for(const width of [390,820,1280])for(const locale of ['zh','en'])for(const theme of ['light','dark']){
    await page.setViewportSize({width,height:900});await page.click(`[data-locale="${locale}"]`);
    await page.evaluate(theme=>window.WuriLeagueTheme.set(theme),theme);
    await baselinePage.setViewportSize({width,height:900});await baselinePage.click(`[data-locale="${locale}"]`);await baselinePage.evaluate(theme=>window.WuriLeagueTheme.set(theme),theme);
    for(const group of ['A','B']){
     const geometry=g=>{const table=document.getElementById('standings'+g),r=table.getBoundingClientRect();return {width:r.width,height:r.height,cells:[...table.querySelectorAll('th,td')].map(n=>{const b=n.getBoundingClientRect(),s=getComputedStyle(n);return {width:b.width,height:b.height,text:n.textContent,font:s.font,color:s.color}})}};
     assert.deepEqual(await page.evaluate(geometry,group),await baselinePage.evaluate(geometry,group),'original table layout, text, fonts and colors must stay unchanged');
     const placement=await page.evaluate(g=>{const button=document.querySelector(`[data-copy-standings="${g}"]`),b=button.getBoundingClientRect(),h=button.parentElement.getBoundingClientRect();return {rightHalf:b.left>h.left+h.width/2,topAligned:Math.abs(b.top-h.top)<2}} ,group);
     assert.deepEqual(placement,{rightHalf:true,topAligned:true},'copy icon must stay in the top-right on mobile too');
     const before=await page.evaluate(g=>{
      const table=document.getElementById('standings'+g),wrap=table.parentElement;wrap.scrollLeft=wrap.scrollWidth;
      return {scroll:wrap.scrollLeft,width:table.getBoundingClientRect().width,height:table.getBoundingClientRect().height,rows:table.tBodies[0].rows.length,columns:table.rows[0].cells.length,html:table.innerHTML};
     },group);
     assert.equal(before.rows,6);assert.equal(before.columns,7);
     const png=await page.evaluate(async g=>{
      const table=document.getElementById('standings'+g),blob=await window.WuriStandingsImage.renderPNG(window.WuriStandingsImage.freezeTable(table));
      const data=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(blob)});
      const img=new Image();img.src=data;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const x=c.getContext('2d');x.drawImage(img,0,0);
      const pixels=x.getImageData(0,0,c.width,c.height).data;let opaque=0,colors=new Set();for(let i=0;i<pixels.length;i+=16){if(pixels[i+3])opaque++;colors.add([pixels[i],pixels[i+1],pixels[i+2],pixels[i+3]].join(','))}
      return {data,width:img.width,height:img.height,opaque,samples:Math.ceil(pixels.length/16),colors:colors.size};
     },group);
     assert.equal(png.width,Math.ceil(before.width)*2);assert.equal(png.height,Math.ceil(before.height)*2);assert.equal(png.opaque,png.samples,"export background must be opaque");assert.ok(png.colors>100,'PNG must include content, not a blank surface');
     const after=await page.evaluate(g=>{const t=document.getElementById('standings'+g);return {scroll:t.parentElement.scrollLeft,html:t.innerHTML}},group);
     assert.equal(after.scroll,before.scroll);assert.equal(after.html,before.html);
     if(width===390&&locale==='zh'&&theme==='light')fs.writeFileSync(path.join(output,`${engine}-${group}-full-table.png`),Buffer.from(png.data.split(',')[1],'base64'));
     results.push({engine,width,locale,theme,group,pngWidth:png.width,pngHeight:png.height,rows:before.rows,columns:before.columns,scrollPreserved:true,baselineLayoutUnchanged:true});
    }
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no document overflow');
   }
   // Actual button event and native PNG clipboard; WebKit readback uses a trusted paste gesture.
   await page.setViewportSize({width:390,height:844});await page.click('[data-locale="zh"]');
   if(engine==='webkit')await page.evaluate(()=>{const target=document.createElement('div');target.id='verifyPaste';target.contentEditable='true';target.textContent='Native clipboard verification';document.body.prepend(target);target.addEventListener('paste',event=>{window.__nativePaste=[...event.clipboardData.items].map(item=>({mime:item.type,bytes:item.getAsFile()?.size}));event.preventDefault()})});
   await page.click('[data-copy-standings="A"]');await page.waitForFunction(()=>document.getElementById('standingsCopyStatusA').textContent.includes('已複製'));
   let receipt;
   if(engine==='chromium')receipt=await page.evaluate(async()=>{const items=await navigator.clipboard.read();const b=await items[0].getType('image/png');return {mime:b.type,bytes:b.size}});
   else {await page.click('#verifyPaste');await page.keyboard.press('Meta+V');await page.waitForFunction(()=>window.__nativePaste?.some(item=>item.bytes));receipt=await page.evaluate(()=>window.__nativePaste.find(item=>item.mime==='image/png'&&item.bytes));await page.evaluate(()=>document.getElementById('verifyPaste').remove())}
   assert.equal(receipt.mime,'image/png');assert.ok(receipt.bytes>1000);results.push({engine,clipboard:engine==='chromium'?'native-write-and-read':'native-write-and-paste',...receipt});
   // Permission denial followed by retry: no automatic fallback or stuck button.
   await page.evaluate(()=>{Object.defineProperty(navigator.clipboard,'write',{configurable:true,value:async()=>{throw new DOMException('denied','NotAllowedError')}})});
   await page.click('[data-copy-standings="B"]');await page.waitForFunction(()=>document.getElementById('standingsCopyStatusB').textContent.includes('失敗'));
   assert.equal(await page.locator('[data-copy-standings="B"]').isDisabled(),false);
   await page.evaluate(()=>{Object.defineProperty(navigator.clipboard,'write',{configurable:true,value:async items=>{window.__retryPNG=await items[0].getType('image/png')}})});
   await page.click('[data-copy-standings="B"]');await page.waitForFunction(()=>document.getElementById('standingsCopyStatusB').textContent.includes('已複製'));
   // Sorting is used as rendered, not reset to official order.
   await page.click('[data-sort-group="A"][data-sort-key="w"]');
   const frozen=await page.evaluate(()=>{const table=document.getElementById('standingsA');const f=window.WuriStandingsImage.freezeTable(table);return {live:table.textContent,frozen:f.clone.textContent}});assert.equal(frozen.live,frozen.frozen);
   await page.screenshot({path:path.join(output,`${engine}-mobile.png`),fullPage:true});
   assert.deepEqual(errors,[]);await context.close();
  }finally{await browser.close()}
 }
 fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify({ok:true,results},null,2));
 console.log(JSON.stringify({ok:true,matrixCases:results.filter(r=>r.width).length,clipboard:results.filter(r=>r.clipboard),output},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
