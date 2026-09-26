const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const test=require('node:test');
const root=path.resolve(__dirname,'..');
const official=require('../assets/js/official-data.js');
const {StaticLeagueRepository,SupabaseLeagueRepository}=require('../assets/js/league-repository.js');

const standings=group=>{
  const rows=Object.fromEntries(official.teams.filter(team=>team.group===group).map(team=>[team.team_code,{code:team.team_code,points:0,wins:0,losses:0}]));
  const matchByCode=new Map(official.matches.map(match=>[match.match_code,match]));
  for(const result of official.results){const match=matchByCode.get(result.match_code);if(match.group!==group)continue;const home=rows[match.home_team_code],away=rows[match.away_team_code],winner=result.home_score>result.away_score?home:away,loser=winner===home?away:home,top=Math.max(result.home_score,result.away_score);winner.wins++;loser.losses++;winner.points+=top===3?3:2;loser.points+=top===3?0:1}
  return Object.values(rows).sort((a,b)=>b.points-a.points||b.wins-a.wins||a.code.localeCompare(b.code));
};

test('static repository exposes canonical immutable 12/60/26 dataset',async()=>{
  const repo=new StaticLeagueRepository(official),data=await repo.getPublicLeague();
  assert.deepEqual([data.teams.length,data.matches.length,data.results.length],[12,60,26]);
  assert.equal(Object.isFrozen(data),true);
  assert.deepEqual(standings('A').map(row=>row.points),[15,11,8,6,4,1]);
  assert.deepEqual(standings('B').map(row=>row.points),[9,8,7,4,4,1]);
});

test('Supabase repository calls only public RPC and validates response',async()=>{
  const calls=[];
  const repo=new SupabaseLeagueRepository({seasonCode:official.season.code,client:{async rpc(name,args){calls.push([name,args]);return {data:official,error:null}}}});
  const data=await repo.getPublicLeague();
  assert.deepEqual(calls,[['get_public_league',{p_season_code:'2026-autumn-second-half'}]]);
  assert.deepEqual([data.teams.length,data.matches.length,data.results.length],[12,60,26]);
});

test('Supabase repository fails closed on RPC and malformed data',async()=>{
  const failed=new SupabaseLeagueRepository({seasonCode:'test',client:{async rpc(){return {data:null,error:{message:'private detail'}}}}});
  await assert.rejects(()=>failed.getPublicLeague(),/^Error: Public league data unavailable$/);
  const malformed=new SupabaseLeagueRepository({seasonCode:'test',client:{async rpc(){return {data:{teams:[],matches:[],results:[{match_code:'unknown',home_score:3,away_score:0}]},error:null}}}});
  await assert.rejects(()=>malformed.getPublicLeague(),/Invalid public result/);
});

test('test build contains public/admin and only generated publishable config',()=>{
  const env={...process.env,SUPABASE_TEST_URL:'https://wuri-test.supabase.co',SUPABASE_TEST_PUBLISHABLE_KEY:'test-publishable-browser-key-000001'};
  execFileSync(process.execPath,['scripts/build-test.cjs'],{cwd:root,env,stdio:'pipe'});
  for(const file of ['test-dist/public/index.html','test-dist/public/assets/js/config.js','test-dist/admin/index.html','test-dist/admin/assets/js/config.js'])assert.equal(fs.existsSync(path.join(root,file)),true,file);
  const configs=['public','admin'].map(side=>fs.readFileSync(path.join(root,'test-dist',side,'assets/js/config.js'),'utf8')).join('\n');
  assert.match(configs,/"mode": "supabase"/);
  assert.match(configs,/test-publishable-browser-key-000001/);
  assert.doesNotMatch(configs,/service[_-]?role|database[_-]?password|jwt[_-]?secret|postgres(?:ql)?:/i);
  const productionFiles=fs.readdirSync(path.join(root,'pages-dist'),{recursive:true}).map(String);
  assert.equal(productionFiles.some(file=>file.includes('admin')),false);
});

test('test build without secrets is structurally testable but disabled, deployment fails closed',()=>{
  const env={...process.env};delete env.SUPABASE_TEST_URL;delete env.SUPABASE_TEST_PUBLISHABLE_KEY;delete env.TEST_DEPLOYMENT;
  execFileSync(process.execPath,['scripts/build-test.cjs'],{cwd:root,env,stdio:'pipe'});
  assert.match(fs.readFileSync(path.join(root,'test-dist/public/assets/js/config.js'),'utf8'),/"mode": "disabled"/);
  assert.throws(()=>execFileSync(process.execPath,['scripts/build-test.cjs'],{cwd:root,env:{...env,TEST_DEPLOYMENT:'1'},stdio:'pipe'}),/TEST_DEPLOYMENT requires real Test Supabase configuration/);
  const serviceRoleJwt=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url'),'signature'].join('.');
  assert.throws(()=>execFileSync(process.execPath,['scripts/build-test.cjs'],{cwd:root,env:{...env,SUPABASE_TEST_URL:'https://wuri-test.supabase.co',SUPABASE_TEST_PUBLISHABLE_KEY:serviceRoleJwt},stdio:'pipe'}),/Privileged secret material is forbidden/);
  assert.throws(()=>execFileSync(process.execPath,['scripts/build-test.cjs'],{cwd:root,env:{...env,SUPABASE_TEST_URL:'https://wuri-test.supabase.co',SUPABASE_TEST_PUBLISHABLE_KEY:'sb_secret_not-for-browser-000001'},stdio:'pipe'}),/Privileged secret material is forbidden/);
});

test('official seed generation is deterministic and carries canonical counts',()=>{
  execFileSync(process.execPath,['scripts/generate-official-seed.cjs'],{cwd:root,stdio:'pipe'});
  const first=fs.readFileSync(path.join(root,'supabase/seed-official.sql'),'utf8');
  execFileSync(process.execPath,['scripts/generate-official-seed.cjs'],{cwd:root,stdio:'pipe'});
  const second=fs.readFileSync(path.join(root,'supabase/seed-official.sql'),'utf8');
  assert.equal(first,second);
  assert.match(first,/12 teams, 60 matches, 26 results/);
  assert.match(first,/on conflict\(team_code\) do update/i);
  assert.match(first,/on conflict\(match_code\) do update/i);
  assert.match(first,/on conflict\(match_id\) do update/i);
});

test('004 backend contract exposes one public RPC and fail-closed audited writes',()=>{
  const sql=fs.readFileSync(path.join(root,'supabase/migrations/004_test_management_backend.sql'),'utf8');
  assert.match(sql,/grant execute on function public\.get_public_league\(text\) to anon,authenticated/i);
  assert.doesNotMatch(sql,/grant execute on function public\.(?:create|update|disable|save|lock|set_|import|get_admin)[^(]*\([^;]+\) to anon/i);
  for(const name of ['create_team','update_team','disable_team','create_match','update_match','set_match_status','save_match_result','lock_match_result','get_admin_dataset','import_league_data','set_profile_role']){
    assert.match(sql,new RegExp(`function public\\.${name}\\(`,'i'),name);
    assert.match(sql,new RegExp(`revoke all on function public\\.${name}\\([^;]+ from public,anon`,'i'),`${name} revoke`);
  }
  assert.match(sql,/app_role is null or app_role not in \('admin','scorer'\)/i);
  assert.match(sql,/version conflict/);
  assert.match(sql,/locked/);
  assert.match(sql,/audit_logs/);
  assert.match(sql,/batch limit exceeded/);
  assert.match(sql,/snapshot_count>500/);
  assert.match(sql,/where not public\.matches\.locked returning id into mid/i);
  assert.match(sql,/where not public\.match_results\.locked returning match_id into tid/i);
  assert.match(sql,/allowed_mime_types[^;]+image\/png[^;]+image\/webp/is);
  assert.match(sql,/team logos admin insert[^;]+to authenticated[^;]+current_app_role\(\)[^;]+admin/is);
  assert.match(sql,/Pixel dimensions must be validated/);
});
