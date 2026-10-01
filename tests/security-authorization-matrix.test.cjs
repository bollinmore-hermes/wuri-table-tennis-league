const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');

const root=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const migrations={
  backend:read('supabase/migrations/004_test_management_backend.sql'),
  roster:read('supabase/migrations/005_player_roster_management.sql'),
  invitations:read('supabase/migrations/006_user_invitations.sql'),
  users:read('supabase/migrations/007_user_management.sql')
};

function body(sql,name){
  const match=sql.match(new RegExp(`create(?: or replace)? function public\\.${name}\\([^]*?as \\$\\$([^]*?)\\$\\$;`,'i'));
  assert.ok(match,`missing ${name}`);
  return match[1];
}

function assertAdminOnly(sql,name){
  const source=body(sql,name);
  assert.match(source,/select\s+public\.current_app_role\(\)\s+into\s+app_role/i,`${name} must resolve the application role`);
  assert.match(source,/app_role\s+is\s+distinct\s+from\s+'admin'/i,`${name} must fail closed for NULL/non-admin roles`);
}

test('authorization matrix revokes direct table access from both browser roles',()=>{
  const combined=Object.values(migrations).join('\n');
  for(const table of ['seasons','groups','teams','season_teams','matches','match_results','standings_snapshots','profiles','audit_logs','players','user_invite_rate_limits','user_management_rate_limits']){
    assert.match(combined,new RegExp(`revoke all on table [^;]*public\\.${table}[^;]* from [^;]*anon`,'i'),`${table} must be denied to anon`);
    assert.match(combined,new RegExp(`revoke all on table [^;]*public\\.${table}[^;]* from [^;]*authenticated`,'i'),`${table} must be denied to authenticated`);
  }
});

test('only the curated public league RPC is executable by anonymous users',()=>{
  const combined=Object.values(migrations).join('\n');
  assert.match(combined,/grant execute on function public\.get_public_league\(text\) to anon,authenticated/i);
  assert.doesNotMatch(combined,/grant execute on function public\.(?:get_admin|get_my_profile|create_|update_|disable_|save_|lock_|set_|import_|consume_|complete_|record_)[^(]*\([^;]*\) to [^;]*anon/i);
});

test('authenticated management RPC boundary has fail-closed application-role checks',()=>{
  for(const name of ['create_team','update_team','disable_team','create_match','update_match','set_match_status','lock_match_result','set_profile_role','import_league_data'])assertAdminOnly(migrations.backend,name);
  for(const name of ['save_player','disable_player','save_team','save_match'])assertAdminOnly(migrations.roster,name);

  for(const [sql,name] of [[migrations.backend,'get_admin_dataset'],[migrations.roster,'get_admin_dataset'],[migrations.backend,'save_match_result']]){
    const source=body(sql,name);
    assert.match(source,/select\s+public\.current_app_role\(\)\s+into\s+app_role/i);
    assert.match(source,/app_role\s+is\s+null\s+or\s+app_role\s+not\s+in\s*\(\s*'admin'\s*,\s*'scorer'\s*\)/i,`${name} must deny unprofiled/inactive users`);
  }
  assert.match(body(migrations.backend,'save_match_result'),/locked[^]*app_role\s*=\s*'admin'/i,'only admin may override a locked result');
});

test('profile lookup denies anonymous, unprofiled and inactive sessions',()=>{
  const source=body(migrations.backend,'get_my_profile');
  assert.match(source,/auth\.uid\(\)\s+is\s+null[^]*authentication required/i);
  assert.match(source,/where p\.id=auth\.uid\(\) and p\.active and p\.role in \('admin','scorer'\)/i);
  assert.match(source,/if result is null then raise exception 'profile role required'/i);
});

test('invitation and user-management privileged RPCs are service-role only',()=>{
  for(const [sql,names] of [
    [migrations.invitations,['consume_user_invite_quota','complete_user_invitation']],
    [migrations.users,['consume_user_management_quota','complete_user_management_update','record_user_password_reset']]
  ])for(const name of names){
    assert.match(sql,new RegExp(`revoke all on function public\\.${name}\\([^;]+ from public,anon,authenticated`,'i'),`${name} browser revoke`);
    assert.match(sql,new RegExp(`grant execute on function public\\.${name}\\([^;]+ to service_role`,'i'),`${name} service grant`);
  }
});

test('admin user listing is authenticated at the SQL boundary and admin-only in the function',()=>{
  assert.match(migrations.invitations,/revoke all on function public\.get_admin_users\(\) from public,anon/i);
  assert.match(migrations.invitations,/grant execute on function public\.get_admin_users\(\) to authenticated/i);
  assertAdminOnly(migrations.invitations,'get_admin_users');
});

test('Edge Functions deny untrusted origins before evaluating credentials',()=>{
  for(const relative of ['supabase/functions/invite-league-user/index.ts','supabase/functions/manage-league-user/index.ts']){
    const source=read(relative);
    const originCheck=source.indexOf("if(!isAllowedOrigin(origin,origins))");
    const authorizationRead=source.indexOf("request.headers.get('authorization')");
    assert.ok(originCheck>=0&&authorizationRead>originCheck,`${relative} must reject origin first`);
    assert.match(source,/if\(!token\|\|token===authorization\)return response\(origin,401,\{error:'authentication_required'\}\)/);
    assert.match(source,/!.*\.active\|\|.*\.role!=='admin'/);
    assert.doesNotMatch(source,/Access-Control-Allow-Origin['"]?\s*:\s*['"]\*/);
  }
});

test('read-only Test verifier is pinned to Test and declares destructive-test limitations',()=>{
  const source=read('scripts/verify-test-security.cjs');
  assert.match(source,/vppjcjfbcoxzofcuxmzz/);
  assert.match(source,/security verification must target the fixed Test project/);
  assert.match(source,/No scorer, inactive-user, unprofiled-user, or write-path mutation was performed/);
  assert.doesNotMatch(source,/SUPABASE_(?:SERVICE_ROLE|SECRET)|serviceRoleKey/);
});
