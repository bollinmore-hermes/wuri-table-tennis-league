'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../assets/js/app.js'),'utf8');
function load(stored=null,blocked=false){
  const data=new Map(stored?[['wuriLeagueFollow:2026-autumn-second-half',stored]]:[]);
  const ctx=vm.createContext({config:{seasonCode:'2026-autumn-second-half'},localStorage:{getItem(k){if(blocked)throw Error('blocked');return data.get(k)},setItem(k,v){if(blocked)throw Error('blocked');data.set(k,v)},removeItem(k){if(blocked)throw Error('blocked');data.delete(k)}},Intl,Date});
  const start=source.indexOf('// Follow-team preference and pure summary helpers.');
  assert.notEqual(start,-1,'follow-team implementation must exist');
  vm.runInContext(source.slice(start,source.indexOf('// Follow-team UI.',start)),ctx);
  return {ctx,data,run:s=>vm.runInContext(s,ctx)};
}
test('32: opt-in, persistent selection, replacement and cancellation',()=>{
  const b=load();assert.equal(b.run('followedTeamCode'),null);
  b.run('saveFollowedTeam("A01")');assert.equal(b.data.get('wuriLeagueFollow:2026-autumn-second-half'),'A01');
  assert.equal(load('A01').run('followedTeamCode'),'A01');
  b.run('saveFollowedTeam("B02")');assert.equal(b.run('followedTeamCode'),'B02');
  b.run('saveFollowedTeam(null)');assert.equal(b.data.size,0);
});
test('32: blocked storage preserves current-tab selection without throwing',()=>{
  const b=load(null,true);b.run('saveFollowedTeam("A01")');assert.equal(b.run('followedTeamCode'),'A01');assert.equal(b.run('followStorageAvailable'),false);
  b.run('saveFollowedTeam(null)');assert.equal(b.run('followedTeamCode'),null);
});
const matches=[
  {id:'past',date:'2026-10-12',time:'15:00',home:'One',away:'Two'},
  {id:'earlier',date:'2026-10-13',time:'10:00',home:'One',away:'Two'},
  {id:'done',date:'2026-10-13',time:'18:00',home:'One',away:'Two'},
  {id:'next',date:'2026-10-13',time:'16:00',home:'Two',away:'One',table:2},
  {id:'later',date:'2026-10-14',time:'15:00',home:'One',away:'Two'}
];
test('32: next match uses Taiwan date/time, omits completed matches, sorts without mutating',()=>{
  const b=load();b.ctx.matches=[...matches].reverse();b.ctx.results={done:{home:3,away:0}};
  assert.equal(b.run('nextFollowedMatch("One",matches,results,new Date("2026-10-13T07:30:00Z")).id'),'next');
  assert.equal(b.ctx.matches[0].id,'later');
  assert.equal(b.run('nextFollowedMatch("One",matches,results,new Date("2026-10-13T16:30:00Z")).id'),'later');
});
test('32: no future match and missing time/table remain safe',()=>{
  const b=load();b.ctx.matches=matches;b.ctx.results={};
  assert.equal(b.run('nextFollowedMatch("Unknown",matches,results,new Date("2026-10-13T07:30:00Z"))'),null);
  assert.equal(b.run('nextFollowedMatch("One",matches,results,new Date("2026-12-30T07:30:00Z"))'),null);
  b.ctx.matches=[{id:'missing',date:'2026-10-13',home:'One',away:'Two'}];
  assert.equal(b.run('nextFollowedMatch("One",matches,results,new Date("2026-10-13T07:30:00Z")).id'),'missing');
});
test('32 feedback: home has summary only, initially hidden, with no selection controls',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.doesNotMatch(html,/followTeamSelect|clearFollowTeam/);
  assert.match(html,/id="followTeamCard"[^>]+hidden/);
  assert.match(html,/id="followTeamSummary"[^>]+aria-live="polite"/);
});

class TestNode{
  constructor(tag='div',text=''){this.tagName=tag.toUpperCase();this.textContent=String(text);this.children=[];this.dataset={};this.attributes={};this.style={};this.value='';this.classList={toggle(){},add(){},remove(){}}}
  append(...items){for(const item of items.flat(Infinity))if(item!==null&&item!==undefined)this.children.push(item instanceof TestNode?item:new TestNode('#text',item))}
  replaceChildren(...items){this.children=[];this.textContent='';this.append(...items)}
  setAttribute(k,v){this.attributes[k]=v}
  addEventListener(k,fn){(this.listeners??={})[k]=fn}
  focus(){this.focused=true}
}
function uiLoad(stored=null,disabled=false){
  const ids=new Map(),data=new Map(stored?[['wuriLeagueFollow:2026-autumn-second-half',stored]]:[]);
  const ctx=vm.createContext({Intl,Date,Node:TestNode,scrollTo(){},localStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},document:{documentElement:new TestNode(),createElement:t=>new TestNode(t),createTextNode:t=>new TestNode('#text',t),createDocumentFragment:()=>new TestNode(),getElementById:id=>{if(!ids.has(id))ids.set(id,new TestNode());return ids.get(id)},querySelectorAll:()=>[],querySelector:()=>null}});
  ctx.window=ctx;if(disabled)ctx.LEAGUE_CONFIG={mode:'disabled',seasonCode:'2026-autumn-second-half'};
  for(const name of ['official-data.js','league-repository.js','app.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/js',name),'utf8'),ctx);
  return {ctx,ids,data,run:s=>vm.runInContext(s,ctx),text:()=>nodeText(ids.get('followTeamSummary'))};
}
function nodeText(n){return n.textContent+n.children.map(nodeText).join(' ')}
test('32: UI keeps rank independent of standings sort, changes locale and opens correct team',()=>{
  const b=uiLoad('A01');assert.match(b.text(),/快樂Da桌球/);assert.match(b.text(),/A 組・第 \d 名/);assert.match(b.text(),/桌號待公布/);
  const before=b.text();b.run('standingsSort.A={key:"l",dir:"asc"};renderFollowedTeam()');assert.equal(b.text(),before);
  b.run('applyLocale("en")');assert.match(b.text(),/Group A · Rank/);assert.match(b.text(),/Table to be announced/);
  const identity=b.ids.get('followTeamSummary').children[0].children[0];identity.children.at(-1).listeners.click();assert.equal(b.run('activeTeamDetail.name'),'快樂Da桌球');
});
test('32 feedback: no follow or obsolete team hides home without erasing saved choice',()=>{
  for(const stored of [null,'removed']){const b=uiLoad(stored);assert.equal(b.ids.get('followTeamCard').hidden,true);assert.equal(b.text(),'');if(stored)assert.equal(b.data.get('wuriLeagueFollow:2026-autumn-second-half'),stored)}
  const disabled=uiLoad('A01',true);assert.equal(disabled.ids.get('followTeamCard').hidden,true);assert.equal(disabled.data.get('wuriLeagueFollow:2026-autumn-second-half'),'A01');
  const b=uiLoad('A01');b.run('games=[];renderFollowedTeam()');assert.match(b.text(),/目前沒有後續賽程/);
});
test('32 feedback: detail follow button replaces and cancels without rebuilding focused control',()=>{
  const b=uiLoad();b.run('goToTeam(teams.A[0],"A")');
  const button=b.run('activeFollowButton');assert.equal(button.textContent,'關注此隊');assert.equal(button.attributes['aria-pressed'],'false');
  button.focus();button.listeners.click();assert.equal(b.run('activeFollowButton'),button);assert.equal(button.focused,true);assert.equal(button.textContent,'取消關注');assert.equal(button.attributes['aria-pressed'],'true');assert.equal(b.ids.get('followTeamCard').hidden,false);
  b.run('goToTeam(teams.B[0],"B")');const other=b.run('activeFollowButton');assert.equal(other.textContent,'關注此隊');other.listeners.click();assert.equal(b.run('followedTeamCode'),'B01');assert.match(b.text(),/我們這一隊/);
  other.listeners.click();assert.equal(b.run('followedTeamCode'),null);assert.equal(other.textContent,'關注此隊');assert.equal(b.ids.get('followTeamCard').hidden,true);assert.equal(b.data.has('wuriLeagueFollow:2026-autumn-second-half'),false);
});
test('32 feedback: detail control localizes, warns when storage blocked and rejects removed teams',()=>{
  const b=uiLoad('A01');b.run('goToTeam(teams.A[0],"A");applyLocale("en")');assert.equal(b.run('activeFollowButton.textContent'),'Unfollow');
  b.run('applyLocale("zh");localStorage.setItem=()=>{throw Error("blocked")};localStorage.removeItem=()=>{throw Error("blocked")}');b.run('activeFollowButton').listeners.click();assert.match(b.run('activeFollowNotice.textContent'),/無法儲存/);assert.equal(b.run('followedTeamCode'),null);
  b.run('followTeamRecords=[]');b.run('activeFollowButton').listeners.click();assert.equal(b.run('activeFollowButton.disabled'),true);assert.equal(b.run('followedTeamCode'),null);
});
