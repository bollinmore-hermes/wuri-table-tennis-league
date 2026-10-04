'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../assets/js/app.js'),'utf8');
const calculation=source.slice(source.indexOf('function leaguePoints('),source.indexOf('function trendHTML('));
function fixture(){
  const names=['我們這一隊','劉家昌','烏日少年','海納百川','南門金龍','富士山'];
  // Public match results only; no roster or private account data.
  const rows=[['2026-08-30',1,2,0,3],['2026-08-30',3,4,3,0],['2026-08-30',1,3,3,0],['2026-08-30',2,4,3,0],['2026-08-30',1,4,1,2],['2026-08-30',2,3,3,0],['2026-09-13',3,5,3,0],['2026-09-13',4,6,0,3],['2026-09-13',3,6,1,2],['2026-09-13',4,5,2,1],['2026-09-13',5,6,0,3],['2026-10-04',1,5,2,1],['2026-10-04',2,6,1,2],['2026-10-04',1,6,1,2],['2026-10-04',2,5,3,0]];
  const games=rows.map(([date,h,a],i)=>({id:String(i),group:'B',date,home:names[h-1],away:names[a-1]}));
  const scores=Object.fromEntries(rows.map((row,i)=>[String(i),{home:row[3],away:row[4]}]));
  const ctx=vm.createContext({teams:{A:[],B:names},games,scores,officialStandings:{B:{rows:{'我們這一隊':{trend:-3},'海納百川':{trend:0}}}},standingsSort:{B:{key:'pts',dir:'desc'}},validScore:(h,a)=>Number.isInteger(h)&&Number.isInteger(a)&&([h,a].includes(3)&&Math.min(h,a)===0||Math.max(h,a)===2&&Math.min(h,a)===1)});
  vm.runInContext(calculation,ctx);
  return ctx;
}
const standings=(ctx,sort="{key:'pts',dir:'desc'}")=>JSON.parse(vm.runInContext(`JSON.stringify(standings('B',${sort}))`,ctx));
test('October 4: fifth to third is +2, fourth to fifth is -1, not stale snapshot movements',()=>{
  const rows=standings(fixture());
  assert.equal(rows[2].name,'我們這一隊');assert.equal(rows[2].trend,2);
  assert.equal(rows[4].name,'海納百川');assert.equal(rows[4].trend,-1);
  assert.equal(rows[3].trend,-1);
});
test('movement is independent of selected table sort',()=>{
  const ctx=fixture(),expected=Object.fromEntries(standings(ctx).map(r=>[r.name,r.trend]));
  for(const key of ['pts','w','l','pct'])for(const dir of ['asc','desc']){
    const actual=Object.fromEntries(standings(ctx,JSON.stringify({key,dir})).map(r=>[r.name,r.trend]));
    assert.deepEqual(actual,expected);
  }
});
test('compare the whole latest group matchday, independent of match input order',()=>{
  const ctx=fixture(),before=standings(ctx);ctx.games.reverse();assert.deepEqual(standings(ctx),before);
});
test('future scheduled or invalid results cannot advance the movement reference date',()=>{
  const ctx=fixture(),before=standings(ctx);ctx.games.push({id:'future',group:'B',date:'2026-11-01',home:'我們這一隊',away:'海納百川'});
  assert.deepEqual(standings(ctx),before);ctx.scores.future={home:0,away:0};assert.deepEqual(standings(ctx),before);
});
test('latest matchday is group-specific, not the latest date in another group',()=>{
  const ctx=fixture(),before=standings(ctx);ctx.games.push({id:'other',group:'A',date:'2026-11-01',home:'A1',away:'A2'});ctx.scores.other={home:3,away:0};assert.deepEqual(standings(ctx),before);
});
test('no historical result baseline means no invented first-matchday movement',()=>{
  const ctx=fixture();ctx.games=ctx.games.filter(g=>g.date==='2026-08-30');assert.ok(standings(ctx).every(r=>r.trend===0));
  ctx.games=[];assert.ok(standings(ctx).every(r=>r.trend===0));
});
test('partially registered matchday compares against before that date, not before last match',()=>{
  const ctx=fixture();ctx.games=ctx.games.filter(g=>g.date<'2026-10-04'||g.id==='11');
  const rows=standings(ctx);assert.equal(rows.find(r=>r.name==='我們這一隊').trend,1);
  assert.equal(rows.find(r=>r.name==='海納百川').trend,-1);
});
