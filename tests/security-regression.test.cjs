const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const test=require('node:test');

const root=path.resolve(__dirname,'..');
const appPath=path.join(root,'assets/js/app.js');
const appSource=fs.readFileSync(appPath,'utf8');

class FakeNode{
  constructor(tag='#fragment',text=''){this.tagName=tag.toUpperCase();this.textContent=String(text);this.children=[];this.attributes={};this.dataset={};this.style={};this.className='';this.value='';this.hidden=false;this.classList={toggle(){},add(){},remove(){}}}
  append(...items){for(const item of items.flat(Infinity)){if(item!==null&&item!==undefined)this.children.push(item instanceof FakeNode?item:new FakeNode('#text',item))}}
  replaceChildren(...items){this.children=[];this.textContent='';this.append(...items)}
  setAttribute(name,value){this.attributes[name]=String(value)}
  addEventListener(){}
}
function walk(node){return [node,...node.children.flatMap(walk)]}
function loadPublicApp(){
  const ids=new Map();
  const document={
    documentElement:new FakeNode('html'),
    createElement:tag=>new FakeNode(tag),
    createTextNode:text=>new FakeNode('#text',text),
    createDocumentFragment:()=>new FakeNode('#fragment'),
    getElementById:id=>{if(!ids.has(id))ids.set(id,new FakeNode('div'));return ids.get(id)},
    querySelectorAll:()=>[]
  };
  const storage=new Map();
  const sandbox={console,Intl,Date,Object,Array,Number,String,Math,JSON,Node:FakeNode,document,localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value))},scrollTo(){}};
  sandbox.window=sandbox;
  vm.runInNewContext(appSource,sandbox,{filename:'assets/js/app.js'});
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

test('official public data remains 12 teams, 60 matches, 26 results',()=>{
  const summary=loadPublicApp().WuriLeagueApp.getSummary();
  assert.deepEqual(JSON.parse(JSON.stringify(summary)),{teams:12,matches:60,results:26});
});

test('production artifact is fail-closed and contains no management surface',()=>{
  execFileSync(process.execPath,['scripts/build-pages.cjs'],{cwd:root,stdio:'pipe'});
  const out=path.join(root,'pages-dist');
  const walkFiles=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walkFiles(path.join(dir,entry.name)):[path.join(dir,entry.name)]);
  const files=walkFiles(out).map(file=>path.relative(out,file).split(path.sep).join('/'));
  for(const forbidden of ['admin.html','assets/js/admin.js','assets/js/excel-import.js','assets/css/admin.css','assets/vendor/xlsx.full.min.js','assets/vendor/supabase.js','templates'])assert.equal(files.some(file=>file===forbidden||file.startsWith(`${forbidden}/`)),false,forbidden);
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
