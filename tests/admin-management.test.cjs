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

test('local admin can edit, disable and restore another user but cannot lock out self',async()=>{
  const repo=await local();
  let user=(await repo.load()).users.find(item=>item.id==='local-scorer');
  await repo.manageUser({...user,display_name:'賽務暱稱',role:'admin',active:false});
  user=(await repo.load()).users.find(item=>item.id==='local-scorer');
  assert.deepEqual({display_name:user.display_name,role:user.role,active:user.active},{display_name:'賽務暱稱',role:'admin',active:false});
  await repo.manageUser({...user,active:true});
  assert.equal((await repo.load()).users.find(item=>item.id==='local-scorer').active,true);
  await assert.rejects(()=>repo.manageUser({id:'local-admin',display_name:'本人',role:'scorer',active:true}),/本人/);
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

test('editing a match preserves its original group',async()=>{
  const repo=await local();
  const data=await repo.load();
  const original=data.matches[0];
  await repo.saveMatch({...original,group:original.group==='A'?'B':'A',venue:'更新場地',expected_version:original.version});
  const updated=(await repo.load()).matches.find(match=>match.match_code===original.match_code);
  assert.equal(updated.group,original.group);
  assert.equal(updated.venue,'更新場地');
});

test('Supabase repository supports session resume and password recovery without exposing credentials',async()=>{
  const calls=[];
  const user={id:'user-1',email:'admin@example.com'};
  const client={
    auth:{
      async getSession(){calls.push(['getSession']);return {data:{session:{user}},error:null}},
      async resetPasswordForEmail(email,options){calls.push(['resetPasswordForEmail',email,options]);return {data:{},error:null}},
      async updateUser(input){calls.push(['updateUser',input]);return {data:{user},error:null}},
      async signOut(){calls.push(['signOut']);return {error:null}}
    },
    async rpc(name){calls.push(['rpc',name]);return {data:{role:'admin',display_name:'管理員'},error:null}}
  };
  const repo=new Repository.SupabaseRepository(client,{},official.season.code);
  assert.deepEqual(await repo.resume(),{user,role:'admin',name:'管理員'});
  await repo.requestPasswordReset('admin@example.com','https://example.com/admin/');
  await repo.updatePassword('long-secure-password');
  await repo.logout();
  assert.deepEqual(calls,[
    ['getSession'],
    ['rpc','get_my_profile'],
    ['resetPasswordForEmail','admin@example.com',{redirectTo:'https://example.com/admin/'}],
    ['updateUser',{password:'long-secure-password'}],
    ['signOut']
  ]);
});

test('Supabase admin repository manages invitations, profile edits and password reset requests',async()=>{
  const calls=[];
  const invited={id:'user-2',email:'score@example.com',display_name:'賽務人員',role:'scorer',active:true,invitation_status:'invited'};
  const client={
    async rpc(name,args){calls.push(['rpc',name,args]);if(name==='get_admin_dataset')return {data:{teams:[],matches:[],results:[],snapshots:[],players:[],audits:[]},error:null};if(name==='get_admin_users')return {data:[invited],error:null};throw new Error(name)},
    functions:{async invoke(name,options){calls.push(['invoke',name,options]);if(name==='invite-league-user')return {data:{invitation:invited},error:null};if(options.body.action==='update')return {data:{user:invited},error:null};return {data:{password_reset:{id:'user-2',email:'score@example.com',delivery:'requested'}},error:null}}}
  };
  const repo=new Repository.SupabaseRepository(client,{},official.season.code);
  repo.role='admin';
  assert.deepEqual((await repo.load()).users,[invited]);
  assert.deepEqual(await repo.inviteUser({email:'score@example.com',display_name:'賽務人員',role:'scorer'}),invited);
  assert.deepEqual(await repo.manageUser({id:'user-2',display_name:'新暱稱',role:'admin',active:false}),invited);
  assert.deepEqual(await repo.requestUserPasswordReset('user-2'),{id:'user-2',email:'score@example.com',delivery:'requested'});
  assert.deepEqual(calls,[
    ['rpc','get_admin_dataset',{p_season_code:'2026-autumn-second-half'}],
    ['rpc','get_admin_users',{}],
    ['invoke','invite-league-user',{body:{email:'score@example.com',display_name:'賽務人員',role:'scorer'}}],
    ['invoke','manage-league-user',{body:{action:'update',user_id:'user-2',display_name:'新暱稱',role:'admin',active:false}}],
    ['invoke','manage-league-user',{body:{action:'reset_password',user_id:'user-2'}}]
  ]);
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
  assert.match(html,/id="sidebarBackdrop"/);
  assert.match(html,/id="forgotPassword"/);
  assert.match(html,/id="passwordRecovery"/);
  assert.match(html,/id="openInviteUser"[^>]*data-admin-only[^>]*data-remote-only/);
  assert.match(html,/id="inviteUserDialog"/);
  assert.match(html,/id="editUserDialog"/);
  assert.match(html,/id="editUserDisplayName"/);
  assert.match(html,/id="editUserRole"[\s\S]*?value="scorer"[\s\S]*?value="admin"/);
  assert.match(html,/id="editUserActive"/);
  assert.match(html,/id="inviteEmail"[^>]*type="email"/);
  assert.match(html,/id="inviteRole"[\s\S]*?value="scorer"[\s\S]*?value="admin"/);
  assert.match(html,/id="newPassword"[^>]*autocomplete="new-password"/);
  assert.match(js,/resetPasswordForEmail|requestPasswordReset/);
  assert.match(js,/PASSWORD_RECOVERY/);
  assert.match(js,/updatePassword/);
  assert.match(js,/type==='recovery'\|\|type==='invite'/);
  assert.match(js,/repo\.inviteUser/);
  assert.match(js,/repo\.manageUser/);
  assert.match(js,/repo\.requestUserPasswordReset/);
  assert.match(js,/self|本人/);
  assert.match(js,/data-remote-only/);
  assert.match(js,/function lockBackground\(/);
  assert.match(js,/editingMatch\?\.group\|\|el\('matchGroupInput'\)\.value/);
  assert.match(js,/matchGroupInput'\)\.disabled=Boolean\(match\)/);
  assert.match(css,/body\.scroll-locked/);
  assert.match(css,/\.sidebar-backdrop\.open/);
  assert.match(css,/@media\(max-width:760px\)[\s\S]*?\.stats\{grid-template-columns:1fr 1fr/);
  assert.doesNotMatch(css,/@media\(max-width:390px\)\{\.stats\{grid-template-columns:1fr\}/);
});

test('score entry is the only score-writing surface and schedule remains read-only',()=>{
  const html=fs.readFileSync(path.join(root,'admin.html'),'utf8');
  const js=fs.readFileSync(path.join(root,'assets/js/admin.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'assets/css/admin-v2.css'),'utf8');
  const functionBody=(name,nextName)=>{
    const start=js.indexOf(`function ${name}(`);
    const end=js.indexOf(`function ${nextName}(`,start);
    assert.notEqual(start,-1,`missing ${name}`);
    assert.notEqual(end,-1,`missing ${nextName}`);
    return js.slice(start,end);
  };
  const schedule=functionBody('renderSchedule','resultActions');
  const resultActionsBody=functionBody('resultActions','renderResults');

  assert.match(html,/data-page="results"[^>]*>[\s\S]*?比分登錄/);
  assert.match(html,/id="page-results"[\s\S]*?<h2>比分登錄<\/h2>/);
  assert.doesNotMatch(html,/賽果管理/);
  assert.match(js,/results:'比分登錄'/);
  assert.doesNotMatch(schedule,/openScoreDialog/);
  assert.doesNotMatch(schedule,/>登錄<|['"]登錄['"]|['"]賽果['"]/);
  assert.ok(schedule.includes("text:result?`${result.home_score}–${result.away_score}`:'—'"));
  assert.match(schedule,/result\?\.locked/);
  assert.match(schedule,/已鎖定/);
  assert.match(resultActionsBody,/openScoreDialog\(match\)/);
  assert.match(html,/<span>備註（最多 500 字）<\/span><textarea id="scoreNote" rows="4" maxlength="500"><\/textarea>/);
  assert.match(css,/button,input,select,textarea\{font:inherit\}/);
  assert.match(css,/\.field textarea\{[^}]*width:100%[^}]*min-height:110px[^}]*resize:vertical/);
  assert.match(css,/@media\(max-width:760px\)\{[\s\S]*?\.field textarea\{min-height:130px\}/);
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
