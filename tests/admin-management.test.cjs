const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const test=require('node:test');

const root=path.resolve(__dirname,'..');
const Repository=require(path.join(root,'assets/js/admin-repository.js'));
const official=require(path.join(root,'assets/js/official-data.js'));

class MemoryStorage{
  constructor(){this.map=new Map()}
  getItem(key){return this.map.has(key)?this.map.get(key):null}
  setItem(key,value){this.map.set(key,String(value))}
}

async function local(role='admin'){
  const repo=new Repository.LocalRepository({storage:new MemoryStorage(),official,key:'test'});
  await repo.login(role);
  return repo;
}

test('local admin repository seeds official league and clearly marked demo players',async()=>{
  const repo=await local();
  const data=await repo.load();
  assert.equal(data.teams.length,12);
  assert.equal(data.matches.length,60);
  assert.equal(data.results.length,26);
  assert.equal(data.players.length,36);
  assert.equal(data.players.every(player=>player.is_demo&&player.name.startsWith('示範球員')),true);
});

test('admin can add, update and soft-delete a player with audit records',async()=>{
  const repo=await local();
  let data=await repo.load();
  const team=data.teams[0];
  await repo.savePlayer({team_code:team.team_code,name:'測試球員',status:'active',expected_version:0});
  data=await repo.load();
  let player=data.players.find(item=>item.name==='測試球員');
  assert.ok(player);
  await repo.savePlayer({...player,name:'測試球員修改',expected_version:player.version});
  data=await repo.load();
  player=data.players.find(item=>item.id===player.id);
  assert.equal(player.name,'測試球員修改');
  await repo.deletePlayer(player.id,player.version);
  data=await repo.load();
  player=data.players.find(item=>item.id===player.id);
  assert.equal(player.status,'inactive');
  assert.ok(player.deleted_at);
  assert.deepEqual(data.audits.slice(0,3).map(item=>item.action),['delete_player','update_player','create_player']);
});

test('scorer is read-only outside legal unlocked score entry',async()=>{
  const repo=await local('scorer');
  const data=await repo.load();
  await assert.rejects(()=>repo.savePlayer({team_code:data.teams[0].team_code,name:'不可新增'}),/只有管理員/);
  await assert.rejects(()=>repo.saveTeam({...data.teams[0]}),/只有管理員/);
  const pending=data.matches.find(match=>!data.results.some(result=>result.match_code===match.match_code));
  await assert.rejects(()=>repo.saveResult({match_code:pending.match_code,home_score:2,away_score:0}),/比分必須/);
  await repo.saveResult({match_code:pending.match_code,home_score:2,away_score:1,note:'賽務登錄'});
  assert.equal((await repo.load()).results.find(result=>result.match_code===pending.match_code).home_score,2);
});

test('admin lock prevents later scorer override in local adapter',async()=>{
  const storage=new MemoryStorage();
  const admin=new Repository.LocalRepository({storage,official,key:'test'});
  await admin.login('admin');
  const data=await admin.load(),pending=data.matches.find(match=>!data.results.some(result=>result.match_code===match.match_code));
  await admin.saveResult({match_code:pending.match_code,home_score:3,away_score:0,locked:true});
  const scorer=new Repository.LocalRepository({storage,official,key:'test'});
  await scorer.login('scorer');
  await assert.rejects(()=>scorer.saveResult({match_code:pending.match_code,home_score:0,away_score:3}),/已鎖定/);
});

test('admin UI contract uses numeric score selects, safe DOM rendering and role controls',()=>{
  const html=fs.readFileSync(path.join(root,'admin.html'),'utf8');
  const js=fs.readFileSync(path.join(root,'assets/js/admin.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'assets/css/admin-v2.css'),'utf8');
  assert.match(html,/assets\/js\/admin-repository\.js/);
  assert.match(html,/id="homeScore"[^>]*>[\s\S]*?<option>0<\/option>[\s\S]*?<option>3<\/option>/);
  assert.match(html,/id="awayScore"[^>]*>[\s\S]*?<option>0<\/option>[\s\S]*?<option>3<\/option>/);
  assert.match(html,/data-admin-only/);
  assert.doesNotMatch(js,/\b(?:innerHTML|outerHTML|insertAdjacentHTML)\b/);
  assert.match(css,/appearance:none/);
  assert.match(css,/\.score-box::after/);
  assert.match(js,/cfg\.environment/);
  assert.doesNotMatch(js,/remoteEnabled\?'Supabase Test'/);
});

test('player migration is fail-closed, soft-deleting and audited',()=>{
  const sql=fs.readFileSync(path.join(root,'supabase/migrations/005_player_roster_management.sql'),'utf8');
  assert.match(sql,/create table if not exists public\.players/i);
  assert.match(sql,/deleted_at timestamptz/i);
  for(const name of ['save_player','disable_player']){
    assert.match(sql,new RegExp(`create or replace function public\\.${name}\\(`,'i'));
    assert.match(sql,new RegExp(`revoke all on function public\\.${name}\\([^;]+ from public,anon`,'i'));
    assert.match(sql,new RegExp(`grant execute on function public\\.${name}\\([^;]+ to authenticated`,'i'));
  }
  for(const name of ['save_team','save_match']){
    assert.match(sql,new RegExp(`create or replace function public\\.${name}\\(`,'i'));
    assert.match(sql,new RegExp(`revoke all on function public\\.${name}\\([^;]+ from public,anon`,'i'));
    assert.match(sql,new RegExp(`grant execute on function public\\.${name}\\([^;]+ to authenticated`,'i'));
  }
  assert.equal((sql.match(/select\s+public\.current_app_role\(\)\s+into\s+app_role/gi)||[]).length>=3,true);
  assert.match(sql,/app_role is distinct from 'admin'/i);
  assert.match(sql,/action,detail,before_data,after_data[\s\S]*'delete_player'/i);
  assert.match(sql,/'players'.*?'users'.*?'audits'/s);
});

test('local admin demo build includes management assets while Pages remains read-only',()=>{
  execFileSync(process.execPath,['scripts/build-admin-demo.cjs'],{cwd:root,stdio:'pipe'});
  const demo=path.join(root,'admin-demo-dist');
  for(const file of ['index.html','assets/css/admin-v2.css','assets/js/admin.js','assets/js/admin-repository.js','assets/js/config.js','assets/team-logos/A01-happy-da.svg'])assert.equal(fs.existsSync(path.join(demo,file)),true,file);
  const config=fs.readFileSync(path.join(demo,'assets/js/config.js'),'utf8');
  assert.match(config,/"mode": "local"/);
  execFileSync(process.execPath,['scripts/build-pages.cjs'],{cwd:root,env:{...process.env,PAGES_OUTPUT_SUFFIX:'admin-test'},stdio:'pipe'});
  for(const file of ['assets/js/admin.js','assets/js/admin-repository.js','assets/css/admin-v2.css'])assert.equal(fs.existsSync(path.join(root,'pages-dist-admin-test',file)),false,file);
});
