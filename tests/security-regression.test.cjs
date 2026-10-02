const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const test=require('node:test');

const root=path.resolve(__dirname,'..');
const appPath=path.join(root,'assets/js/app.js');
const appSource=fs.readFileSync(appPath,'utf8');
const officialSource=fs.readFileSync(path.join(root,'assets/js/official-data.js'),'utf8');
const repositorySource=fs.readFileSync(path.join(root,'assets/js/league-repository.js'),'utf8');

class FakeNode{
  constructor(tag='#fragment',text=''){this.tagName=tag.toUpperCase();this.textContent=String(text);this.children=[];this.attributes={};this.dataset={};this.style={};this.className='';this.value='';this.hidden=false;this.classList={toggle(){},add(){},remove(){}}}
  append(...items){for(const item of items.flat(Infinity)){if(item!==null&&item!==undefined)this.children.push(item instanceof FakeNode?item:new FakeNode('#text',item))}}
  prepend(...items){this.children.unshift(...items.flat(Infinity).filter(item=>item!==null&&item!==undefined).map(item=>item instanceof FakeNode?item:new FakeNode('#text',item)))}
  replaceChildren(...items){this.children=[];this.textContent='';this.append(...items)}
  setAttribute(name,value){this.attributes[name]=String(value)}
  addEventListener(type,handler){(this.listeners??={})[type]=handler}
  click(){this.listeners?.click?.({target:this,preventDefault(){}})}
}
function walk(node){return [node,...node.children.flatMap(walk)]}
function loadPublicApp(config){
  const ids=new Map();
  const main=new FakeNode('main');
  const document={
    documentElement:new FakeNode('html'),
    createElement:tag=>new FakeNode(tag),
    createTextNode:text=>new FakeNode('#text',text),
    createDocumentFragment:()=>new FakeNode('#fragment'),
    getElementById:id=>{if(!ids.has(id))ids.set(id,new FakeNode('div'));return ids.get(id)},
    querySelectorAll:()=>[],
    querySelector:selector=>selector==='main'?main:null
  };
  const storage=new Map();
  const sandbox={console,Intl,Date,Object,Array,Number,String,Math,JSON,Node:FakeNode,document,localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value))},scrollTo(){}};
  sandbox.window=sandbox;
  if(config)sandbox.LEAGUE_CONFIG=config;
  vm.runInNewContext(officialSource,sandbox,{filename:'assets/js/official-data.js'});
  vm.runInNewContext(repositorySource,sandbox,{filename:'assets/js/league-repository.js'});
  vm.runInNewContext(appSource,sandbox,{filename:'assets/js/app.js'});
  sandbox.__ids=ids;sandbox.__main=main;
  return sandbox;
}

test('untrusted team names and match codes remain inert DOM text',()=>{
  const browser=loadPublicApp();
  const payload='<img src=x onerror="globalThis.__xss=1"><script>globalThis.__xss=1</script>';
  const logo=browser.WuriLeagueApp.teamLogoHTML(payload,'team-card-logo');
  const card=browser.WuriLeagueApp.gameCardHTML({id:`x\" onerror=\"globalThis.__xss=1`,group:'A',date:'2026-10-01',time:'15:30',home:payload,away:payload});
  const nodes=[...walk(logo),...walk(card)];
  assert.equal(browser.__xss,undefined);
  assert.equal(nodes.some(node=>node.tagName==='SCRIPT'),false);
  assert.equal(nodes.some(node=>Object.keys(node.attributes).some(name=>name.toLowerCase().startsWith('on'))),false);
  assert.equal(nodes.some(node=>node.tagName==='IMG'&&node.attributes.src==='x'),false);
  assert.equal(nodes.some(node=>node.textContent.includes('<script>')),true);
});

test('public renderer avoids HTML string sinks and score mutation hooks',()=>{
  assert.doesNotMatch(appSource,/\b(?:innerHTML|outerHTML|insertAdjacentHTML)\b/);
  assert.doesNotMatch(appSource,/LEAGUE_SESSION|wuriLeagueScores|wuriLeagueAdminData|scoreDialog|scoreForm|clearScore|saveAndRender/);
  assert.match(appSource,/createTextNode|textContent/);
});

test('home schedule call-to-action is visually prominent and mobile friendly',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.match(html,/class="btn btn-primary schedule-cta"[^>]*data-jump="schedule"/);
  assert.match(html,/\.schedule-cta\{[^}]*min-height:48px[^}]*box-shadow:/);
  assert.match(html,/\.schedule-cta:before\{content:"📅"/);
  assert.match(html,/@media\(max-width:540px\)\{[^}]*[\s\S]*?\.schedule-cta\{width:100%\}/);
  assert.match(appSource,/allSchedule:"查看所有賽程"/);
  assert.match(appSource,/allSchedule:"View Full Schedule"/);
});

test('schedule has no venue container or trigger in either locale',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.doesNotMatch(html,/id="scheduleVenue"/);
  const browser=loadPublicApp();
  for(const locale of ['zh','en']){
    vm.runInNewContext(`applyLocale("${locale}")`,browser);
    browser.WuriLeagueApp.switchPage('schedule');
    assert.equal(browser.__ids.has('scheduleVenue'),false);
    assert.equal(browser.__ids.get('homeVenue').children.length,1);
  }
});

test('venue information is available on home with safe navigation',()=>{
  const browser=loadPublicApp();
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  for(const [page,id] of [['home','homeVenue']]){
    assert.match(html,new RegExp(`id="${page}"[\\s\\S]*?id="${id}"`));
    const nodes=walk(browser.__ids.get('venueContent'));
    const text=nodes.map(node=>node.textContent).join(' ');
    assert.match(text,/僑仁國小地下室/);
    assert.match(text,/414 臺中市烏日區仁德里中山路一段341號/);
    assert.match(text,/校園內可以停車/);
    assert.match(text,/王田交流道/);
    assert.match(text,/快官交流道/);
    assert.match(text,/台74線/);
    assert.match(text,/大眾運輸資訊待公告/);
    const links=nodes.filter(node=>node.tagName==='A');
    assert.equal(links.length,1);
    assert.equal(links[0].attributes.href,'https://maps.app.goo.gl/BmK9GhG99ada9C8x7');
    assert.equal(links[0].attributes.target,'_blank');
    assert.equal(links[0].attributes.rel,'noopener noreferrer');
    assert.equal(browser.__ids.get(id).children[0].attributes['aria-controls'],'venueDialog');
  }
  assert.match(html,/\.info-trigger\{[^}]*width:100%/);
  assert.match(html,/\.venue-map\{[^}]*min-height:48px/);
  assert.match(html,/\.venue-address\{[^}]*overflow-wrap:anywhere/);
});

test('venue opens in a shared popup while home information buttons stay on one row',()=>{
  const browser=loadPublicApp();
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.match(html,/<div class="home-info-row">\s*<button[^>]*id="leagueOverview"[\s\S]*?<\/button>\s*<div id="homeVenue"><\/div>/);
  for(const id of ['overviewDialog','venueDialog']){
    assert.match(html,new RegExp(`<dialog[^>]*id="${id}"[^>]*aria-labelledby=`));
  }
  for(const id of ['homeVenue']){
    const button=browser.__ids.get(id).children[0];
    assert.equal(button.tagName,'BUTTON');
    assert.equal(button.attributes['aria-haspopup'],'dialog');
    assert.equal(button.attributes['aria-controls'],'venueDialog');
    assert.equal(button.children[0].textContent,'場館交通');
    assert.equal(walk(button).some(node=>node.tagName==='A'),false);
  }
  assert.match(html,/\.home-info-row\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(html,/\.info-dialog\{[^}]*width:min\(760px/);
  assert.match(html,/\.info-dialog-body\{[^}]*overflow-y:auto/);
  assert.match(appSource,/showModal\(\)/);
  assert.match(appSource,/addEventListener\("close"/);
  assert.match(appSource,/\.focus\(/);
  vm.runInNewContext('applyLocale("en")',browser);
  assert.equal(browser.__ids.get('homeVenue').children[0].children[0].textContent,'Venue & travel');
});

test('league refresh does not replace the venue popup content or its trigger',()=>{
  const browser=loadPublicApp();
  const content=browser.__ids.get('venueContent').children[0];
  const button=browser.__ids.get('homeVenue').children[0];
  vm.runInNewContext('applyLocale("zh")',browser);
  assert.equal(browser.__ids.get('venueContent').children[0],content);
  assert.equal(browser.__ids.get('homeVenue').children[0],button);
});

test('venue remains available when league loading is disabled and supports English',()=>{
  const browser=loadPublicApp({mode:'disabled'});
  vm.runInNewContext('applyLocale("en")',browser);
  for(const id of ['homeVenue']){
    const text=walk(browser.__ids.get('venueContent')).map(node=>node.textContent).join(' ');
    assert.match(text,/Qiaoren Elementary School/);
    assert.match(text,/Parking is available on campus/);
    assert.match(text,/Public transport information to be announced/);
    assert.doesNotMatch(text,/undefined/);
  }
});

test('official public data remains 12 teams, 60 matches, 26 results',()=>{
  const summary=loadPublicApp().WuriLeagueApp.getSummary();
  assert.deepEqual(JSON.parse(JSON.stringify(summary)),{teams:12,matches:60,results:26});
});

test('schedule navigation defaults to the next matchday with a 19:00 cutoff',()=>{
  const browser=loadPublicApp();
  const select=browser.WuriLeagueApp.selectDefaultScheduleDate;
  const matchdays=['2026-10-04','2026-10-11'];

  assert.equal(select(matchdays,new Date(2026,9,4,18,59,59)),'2026-10-04');
  assert.equal(select(matchdays,new Date(2026,9,4,19,0,0)),'2026-10-04');
  assert.equal(select(matchdays,new Date(2026,9,4,19,0,1)),'2026-10-11');
  assert.equal(select(matchdays,new Date(2026,9,5,12,0,0)),'2026-10-11');
  assert.equal(select(matchdays,new Date(2026,9,12,12,0,0)),'ALL');
});

test('opening the schedule page applies its default date to the date filter',()=>{
  const browser=loadPublicApp();

  browser.WuriLeagueApp.switchPage('schedule',new Date(2026,9,4,19,0,0));
  assert.equal(browser.__ids.get('dateFilter').value,'2026-10-04');

  browser.WuriLeagueApp.switchPage('schedule',new Date(2026,9,4,19,0,1));
  assert.equal(browser.__ids.get('dateFilter').value,'2026-10-18');
});

test('issue 18: compact standings include every team in official points order',()=>{
  const browser=loadPublicApp();
  for(const group of ['A','B']){
    const rows=walk(browser.__ids.get(`home${group}`)).find(node=>node.tagName==='TBODY').children;
    assert.equal(rows.length,6);
    const names=rows.map(row=>walk(row).find(node=>node.dataset.teamLink).dataset.teamLink);
    const expected=vm.runInNewContext(`standings('${group}',{key:'pts',dir:'desc'}).map(row=>row.name)`,browser);
    assert.deepEqual(names,Array.from(expected));
  }
});

test('issue 19: every opponent table places win rate second and sorts exact rates stably',()=>{
  const browser=loadPublicApp();
  for(const group of ['A','B'])for(const name of vm.runInNewContext(`teams.${group}`,browser)){
    browser.WuriLeagueApp.showTeam(name,group,false);
    const table=walk(browser.__ids.get('teamDetail')).find(node=>node.className==='opponent-table');
    const header=walk(table).find(node=>node.tagName==='THEAD').children[0];
    assert.equal(header.children[1].textContent,'勝率');
    const rows=walk(table).find(node=>node.tagName==='TBODY').children;
    assert.equal(rows.length,5);
    assert.ok(rows.every(row=>row.children[1].className==='opponent-pct'));
    const stats=vm.runInNewContext(`opponentStats(${JSON.stringify(name)},'${group}')`,browser);
    const expected=Array.from(stats).sort((a,b)=>(b.played?b.wins/b.played:-1)-(a.played?a.wins/a.played:-1));
    const actual=rows.map(row=>walk(row.children[0]).find(node=>node.tagName==='SPAN'&&node.textContent&&node.className==='').textContent);
    assert.deepEqual(actual,expected.map(row=>row.opponent));
  }
  vm.runInNewContext(`teams.A=['Selected','Low','High','Tie','Unplayed'];games=[
    ...Array.from({length:201},(_,i)=>({id:'low'+i,home:'Selected',away:'Low'})),
    ...Array.from({length:199},(_,i)=>({id:'high'+i,home:'Selected',away:'High'})),
    {id:'tie',home:'Selected',away:'Tie'}];
    scores=Object.fromEntries(games.map((game,i)=>[game.id,{home:(game.id==='tie'||Number(game.id.replace(/\\D/g,''))<100)?3:0,away:(game.id==='tie'||Number(game.id.replace(/\\D/g,''))<100)?0:3}]));`,browser);
  const rows=vm.runInNewContext(`opponentStats('Selected','A')`,browser);
  assert.deepEqual(Array.from(rows,row=>row.opponent),['Tie','High','Low','Unplayed']);
});

test('issue 20: repeated schedule navigation resets group and date',()=>{
  const browser=loadPublicApp();
  for(let i=0;i<2;i++){
    vm.runInNewContext(`groupFilter='A';selectedDate='ALL'`,browser);
    browser.WuriLeagueApp.switchPage('schedule',new Date(2026,9,2,12));
    assert.equal(vm.runInNewContext('groupFilter',browser),'ALL');
    assert.equal(browser.__ids.get('dateFilter').value,'2026-10-04');
    assert.equal(walk(browser.__ids.get('allGames')).filter(node=>node.tagName==='ARTICLE').length,4);
  }
});

test('issues 20 and 21: team navigation and back button restore all teams',()=>{
  const browser=loadPublicApp();
  for(const group of ['A','B'])for(const name of vm.runInNewContext(`teams.${group}`,browser)){
    vm.runInNewContext(`goToTeam(${JSON.stringify(name)},'${group}')`,browser);
    assert.equal(vm.runInNewContext('teamGroup',browser),group);
    assert.equal(vm.runInNewContext('activeTeamDetail.name',browser),name);
    const back=walk(browser.__ids.get('teamDetail')).find(node=>node.dataset.backTeams!==undefined);
    assert.ok(back,'every detail needs a back button');
    assert.equal(back.textContent,'回到所有球隊');
    back.click();
    assert.equal(vm.runInNewContext('teamGroup',browser),'ALL');
    assert.equal(vm.runInNewContext('activeTeamDetail',browser),null);
    assert.equal(browser.__ids.get('teamDetail').children.length,0);
    assert.equal(walk(browser.__ids.get('teamGrid')).filter(node=>node.dataset.team).length,12);
  }
  vm.runInNewContext(`goToTeam(teams.A[0],'A');applyLocale('en')`,browser);
  assert.equal(walk(browser.__ids.get('teamDetail')).find(node=>node.dataset.backTeams!==undefined).textContent,'Back to all teams');
  browser.WuriLeagueApp.switchPage('teams');
  assert.equal(vm.runInNewContext('activeTeamDetail',browser),null);
});

test('issue 22: brand is a keyboard-accessible home button and home refreshes content',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.ok(/<button class="brand"[^>]*type="button"[^>]*data-page="home"/.test(html));
  assert.ok(/\.brand:focus-visible/.test(html));
  const browser=loadPublicApp();
  browser.__ids.get('nextGames').replaceChildren();
  browser.WuriLeagueApp.switchPage('home');
  assert.ok(browser.__ids.get('nextGames').children.length>0);
});

test('disabled public config renders a safe in-page zero state without throwing',()=>{
  const browser=loadPublicApp({mode:'disabled',supabaseUrl:'',supabasePublishableKey:'',seasonCode:'2026-autumn-second-half'});
  assert.deepEqual(JSON.parse(JSON.stringify(browser.WuriLeagueApp.getSummary())),{teams:0,matches:0,results:0});
  assert.match(browser.__ids.get('overviewSummary').textContent,/0.*0.*0/);
  const alerts=walk(browser.__main).filter(node=>node.attributes.role==='alert');
  assert.equal(alerts.length,1);
  assert.match(alerts[0].textContent,/資料來源尚未設定.*安全停用/);
});

test('production artifact is fail-closed and contains no management surface',()=>{
  execFileSync(process.execPath,['scripts/build-pages.cjs'],{cwd:root,env:{...process.env,PAGES_OUTPUT_SUFFIX:'security-test'},stdio:'pipe'});
  const out=path.join(root,'pages-dist-security-test');
  const walkFiles=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walkFiles(path.join(dir,entry.name)):[path.join(dir,entry.name)]);
  const files=walkFiles(out).map(file=>path.relative(out,file).split(path.sep).join('/'));
  for(const forbidden of ['admin.html','assets/js/admin.js','assets/js/admin-repository.js','assets/js/excel-import.js','assets/css/admin.css','assets/css/admin-v2.css','assets/vendor/xlsx.full.min.js','assets/vendor/supabase.js','templates'])assert.equal(files.some(file=>file===forbidden||file.startsWith(`${forbidden}/`)),false,forbidden);
  const text=files.filter(file=>/\.(?:html|js|css|json|svg|txt)$/i.test(file)).map(file=>fs.readFileSync(path.join(out,file),'utf8')).join('\n');
  assert.doesNotMatch(text,/Mock Login|LEAGUE_SESSION|wuriLeagueScores|scoreDialog|scoreForm|clearScore|\/Users\/[A-Za-z0-9._-]+\//i);
  assert.match(text,/WuriLeagueApp/);
});

test('security migration revokes anonymous RPC access and enforces input limits',()=>{
  const migration=fs.readFileSync(path.join(root,'supabase/migrations/003_security_hardening.sql'),'utf8');
  for(const signature of ['current_app_role()','get_admin_dataset()','import_league_data(jsonb)','save_match_result(text,int,int,text)']){
    assert.match(migration,new RegExp(`revoke all on function public\\.${signature.replace(/[()]/g,'\\$&')} from public,anon`,'i'));
    assert.match(migration,new RegExp(`grant execute on function public\\.${signature.replace(/[()]/g,'\\$&')} to authenticated`,'i'));
  }
  assert.match(migration,/batch limit exceeded/);
  assert.match(migration,/\[\[:cntrl:\]\]/);
  assert.match(migration,/pg_column_size\(p_payload\)>2097152/);
  assert.match(migration,/char_length\(coalesce\(p_note,''\)\)>500/);
});

test('security migration authorizes RPCs fail-closed with one role lookup per call',()=>{
  const migration=fs.readFileSync(path.join(root,'supabase/migrations/003_security_hardening.sql'),'utf8');
  const functionBody=name=>{
    const match=migration.match(new RegExp(`create or replace function public\\.${name}\\([^]*?as \\$\\$([^]*?)\\$\\$;`,'i'));
    assert.ok(match,`missing ${name} function`);
    return match[1];
  };
  const adminDataset=functionBody('get_admin_dataset');
  const importData=functionBody('import_league_data');
  const saveResult=functionBody('save_match_result');

  assert.doesNotMatch(migration,/current_app_role\(\)\s*(?:not\s+in|<>|!=)/i);
  for(const [name,body] of [['get_admin_dataset',adminDataset],['import_league_data',importData],['save_match_result',saveResult]]){
    assert.match(body,/app_role\s+text\s*;/i,`${name} must declare a local role`);
    assert.equal((body.match(/select\s+public\.current_app_role\(\)\s+into\s+app_role/gi)||[]).length,1,`${name} must read the role exactly once`);
    assert.equal((body.match(/current_app_role\(\)/gi)||[]).length,1,`${name} must reuse the local role`);
  }
  assert.match(adminDataset,/app_role\s+is\s+null\s+or\s+app_role\s+not\s+in\s*\(\s*'admin'\s*,\s*'scorer'\s*\)/i);
  assert.match(importData,/app_role\s+is\s+distinct\s+from\s+'admin'/i);
  assert.match(saveResult,/app_role\s+is\s+null\s+or\s+app_role\s+not\s+in\s*\(\s*'admin'\s*,\s*'scorer'\s*\)/i);
  assert.match(saveResult,/locked\s*=\s*true\)[^;]*app_role\s+is\s+distinct\s+from\s+'admin'/i);
});
