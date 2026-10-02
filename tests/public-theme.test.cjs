const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../assets/js/theme.js'),'utf8');
function load({stored=null,dark=false,blocked=false}={}){
  const storage=new Map(stored?[['wuriLeagueTheme',stored]]:[]),root={dataset:{}},system={matches:dark,addEventListener(type,callback){this.change=callback}};
  const sandbox={document:{documentElement:root},Event:class Event{},localStorage:{getItem(key){if(blocked)throw Error('blocked');return storage.get(key)},setItem(key,value){if(blocked)throw Error('blocked');storage.set(key,value)}},matchMedia:()=>system,dispatchEvent(){}};
  sandbox.window=sandbox;vm.runInNewContext(source,sandbox);
  return {theme:sandbox.WuriLeagueTheme,root,storage,system};
}
test('issue 40: first visit follows system and responds to later system changes',()=>{
  const browser=load({dark:true});assert.equal(browser.root.dataset.theme,'dark');
  browser.system.matches=false;browser.system.change();assert.equal(browser.root.dataset.theme,'light');
});
test('issue 40: manual preference persists and overrides system',()=>{
  const browser=load({dark:true});browser.theme.set('light');assert.equal(browser.storage.get('wuriLeagueTheme'),'light');
  browser.system.change();assert.equal(browser.root.dataset.theme,'light');
  assert.equal(load({stored:'dark',dark:false}).root.dataset.theme,'dark');
});
test('issue 40: invalid preferences and blocked storage remain usable',()=>{
  assert.equal(load({stored:'invalid'}).root.dataset.theme,'light');
  const browser=load({blocked:true});browser.theme.set('dark');assert.equal(browser.root.dataset.theme,'dark');
  browser.theme.set('invalid');assert.equal(browser.root.dataset.theme,'dark');
});
test('theme bootstrap is shipped by every public build',()=>{
  for(const script of ['build-pages.cjs','build-test.cjs','build-supabase-pages.cjs'])assert.match(fs.readFileSync(path.join(__dirname,'../scripts',script),'utf8'),/assets\/js\/theme\.js/);
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.ok(html.indexOf('assets/js/theme.js')<html.indexOf('<style>'));
});
