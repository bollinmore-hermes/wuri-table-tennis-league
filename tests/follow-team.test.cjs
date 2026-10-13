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
test('32: homepage provides optional labelled controls and live summary',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.match(html,/label[^>]+for="followTeamSelect"/);assert.match(html,/id="followTeamSelect"/);assert.match(html,/id="followTeamSummary"[^>]+aria-live="polite"/);
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
test('32: stale selection, no future games, blocked data and clear focus are safe',()=>{
  const stale=uiLoad('removed');assert.match(stale.text(),/原關注球隊/);assert.equal(stale.data.get('wuriLeagueFollow:2026-autumn-second-half'),'removed');
  const b=uiLoad('A01');b.run('games=[];renderFollowedTeam()');assert.match(b.text(),/目前沒有後續賽程/);
  b.ids.get('clearFollowTeam').listeners.click();assert.match(b.text(),/選擇一支球隊/);assert.equal(b.data.size,1);assert.equal(b.ids.get('followTeamSelect').focused,true);
  const disabled=uiLoad('A01',true);assert.match(disabled.text(),/聯賽資料尚未載入/);assert.equal(disabled.ids.get('followTeamSelect').disabled,true);assert.equal(disabled.data.get('wuriLeagueFollow:2026-autumn-second-half'),'A01');
});
test('32: select options retain identity during unchanged refresh and invalid input is ignored',()=>{
  const b=uiLoad('A01'),select=b.ids.get('followTeamSelect'),option=select.children[0];
  b.run('renderHome()');assert.equal(select.children[0],option);
  select.value='not-a-team';select.listeners.change({target:select});assert.equal(b.run('followedTeamCode'),'A01');
  select.value='B01';select.listeners.change({target:select});assert.match(b.text(),/我們這一隊/);
});
