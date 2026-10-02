'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const official=require('../assets/js/official-data.js');
const {normalizeDataset}=require('../assets/js/league-repository.js');
const {LocalRepository,SupabaseRepository}=require('../assets/js/admin-repository.js');
const {prepare,mask,publicProjection}=require('../scripts/prepare-private-rosters.cjs');
const root=path.resolve(__dirname,'..'),copy=()=>JSON.parse(JSON.stringify(official));
const source=()=>({season_code:official.season.code,teams:official.teams.map(team=>({team_code:team.team_code,leader:'測試甲',players:['測試乙','測試丙']}))});
const storage=()=>{const m=new Map();return {getItem:key=>m.get(key)||null,setItem:(key,value)=>m.set(key,value)}};
test('#29 canonical public roster contains 12 leaders and 61 masked players',()=>{
 const data=normalizeDataset(official);assert.equal(data.roster.length,73);assert.equal(data.roster.filter(row=>row.roster_role==='leader').length,12);
 const counts={A01:3,A02:6,A03:6,A04:6,A05:5,A06:6,B01:4,B02:5,B03:5,B04:5,B05:5,B06:5};
 for(const team of official.teams){const rows=data.roster.filter(row=>row.team_code===team.team_code);assert.equal(rows.filter(row=>row.roster_role==='player').length,counts[team.team_code]);assert.equal(rows.filter(row=>row.roster_role==='leader').length,1);for(const row of rows){assert.match(row.display_name,/^[^＊]＊+[^＊]$/u);assert.equal('name' in row,false);assert(Object.isFrozen(row));}}
});
for(const [label,mutate] of [
 ['full-name field',row=>row.name='測試甲'],['unmasked display name',row=>row.display_name='測試甲'],['unknown team',row=>row.team_code='UNKNOWN'],['unknown role',row=>row.roster_role='coach'],['invalid order',row=>row.display_order=-1],['HTML payload',row=>row.display_name='<img src=x>'],['duplicate slot',(row,p)=>p.roster.push({...row})]
])test(`#29 rejects public roster ${label}`,()=>{const p=copy();mutate(p.roster[0],p);assert.throws(()=>normalizeDataset(p));});
test('#29 missing public roster is a compatible empty state',()=>{const p=copy();delete p.roster;assert.deepEqual(normalizeDataset(p).roster,[]);p.roster=null;assert.throws(()=>normalizeDataset(p));});
test('#29 preparation uses stable codes and preserves names, roles and order',()=>{
 const s=source(),p=prepare(s);assert.equal(p.length,12);assert.deepEqual(p[0].members,[{name:'測試甲',roster_role:'leader',display_order:0},{name:'測試乙',roster_role:'player',display_order:0},{name:'測試丙',roster_role:'player',display_order:1}]);assert.equal(publicProjection(p)[0].display_name,'測＊甲');assert.equal(mask('測試甲乙'),'測＊＊乙');assert.equal(mask('測甲'),'＊');assert.equal(mask('𠀀試乙'),'𠀀＊乙');
 const duplicate=source();duplicate.teams[1].team_code=duplicate.teams[0].team_code;assert.throws(()=>prepare(duplicate));const short=source();short.teams[0].leader='測甲';assert.throws(()=>prepare(short));
});
test('#29 local adapter returns no private names or audits to scorer and denies anonymous reads',async()=>{
 const repo=new LocalRepository({storage:storage(),official});await assert.rejects(()=>repo.load());await repo.login('admin');await repo.savePlayer({team_code:'A01',name:'測試甲',roster_role:'leader',display_order:0,public_visible:true});assert((await repo.load()).players.some(p=>p.name==='測試甲'));await repo.login('scorer');const data=await repo.load();assert.deepEqual(data.players,[]);assert.deepEqual(data.audits,[]);assert.deepEqual(data.users,[]);await assert.rejects(()=>repo.audits());await assert.rejects(()=>repo.savePlayer({team_code:'A01',name:'測試乙'}));await repo.logout();await assert.rejects(()=>repo.load());
});
test('#29 Supabase adapter sends explicit roster privacy and role fields',async()=>{
 const calls=[];const client={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='get_admin_dataset'?{}:null,error:null}}};const repo=new SupabaseRepository(client,null);await repo.savePlayer({team_code:'A01',name:'測試甲',roster_role:'leader',display_order:3,public_visible:true});assert.deepEqual(calls[0],{name:'save_player',args:{p_player_id:null,p_team_code:'A01',p_name:'測試甲',p_status:'active',p_expected_version:0,p_roster_role:'leader',p_display_order:3,p_public_visible:true,p_season_code:official.season.code}});
});
test('#29 full-name input defaults private and refuses short public names',async()=>{
 const repo=new LocalRepository({storage:storage(),official});await repo.login('admin');await repo.savePlayer({team_code:'A01',name:'測甲'});assert.equal((await repo.load()).players.find(p=>p.name==='測甲').public_visible,false);await assert.rejects(()=>repo.savePlayer({team_code:'A01',name:'測甲',public_visible:true}));
});
test('#29 SQL public projection and management boundary are explicit',()=>{
 const sql=fs.readFileSync(path.join(root,'supabase/migrations/009_private_rosters.sql'),'utf8');assert.match(sql,/'players',case when app_role='admin'/);assert.match(sql,/'display_name',public.mask_roster_name\(p.name\)/);assert.match(sql,/and p.public_visible/);assert.match(sql,/revoke all on table public.players from public,anon,authenticated/);assert.match(sql,/if app_role is distinct from 'admin'/);assert.match(sql,/drop function public.save_player\(uuid,text,text,text,integer\)/);assert.match(sql,/p.season_code=p_season_code/);
 const admin=fs.readFileSync(path.join(root,'assets/js/admin.js'),'utf8');assert.match(admin,/function openRoster\(code\)\{if\(!isAdmin\(\)\)return/);assert.match(admin,/名冊角色/);assert.match(admin,/公開遮罩姓名/);assert.match(fs.readFileSync(path.join(root,'.gitignore'),'utf8'),/^\.private\/$/m);
});
