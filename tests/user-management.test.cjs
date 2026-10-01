const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const test=require('node:test');

const root=path.resolve(__dirname,'..');
const migrationPath=path.join(root,'supabase/migrations/007_user_management.sql');
const functionDir=path.join(root,'supabase/functions/manage-league-user');

async function loadCore(){return import(pathToFileURL(path.join(functionDir,'core.mjs')).href)}

test('user management input normalizes updates and reset requests',async()=>{
  const {normalizeUserManagementRequest}=await loadCore();
  assert.deepEqual(normalizeUserManagementRequest({action:'update',user_id:'9303aa45-bb24-4590-b45e-9a1e2eb8a662',display_name:'  新 暱稱  ',role:'scorer',active:false}),{
    action:'update',userId:'9303aa45-bb24-4590-b45e-9a1e2eb8a662',displayName:'新 暱稱',role:'scorer',active:false
  });
  assert.deepEqual(normalizeUserManagementRequest({action:'reset_password',user_id:'9303aa45-bb24-4590-b45e-9a1e2eb8a662'}),{
    action:'reset_password',userId:'9303aa45-bb24-4590-b45e-9a1e2eb8a662'
  });
  assert.deepEqual(normalizeUserManagementRequest({action:'delete',user_id:'9303aa45-bb24-4590-b45e-9a1e2eb8a662'}),{
    action:'delete',userId:'9303aa45-bb24-4590-b45e-9a1e2eb8a662'
  });
  for(const input of [
    {action:'update',user_id:'bad',display_name:'名稱',role:'admin',active:true},
    {action:'update',user_id:'9303aa45-bb24-4590-b45e-9a1e2eb8a662',display_name:'',role:'admin',active:true},
    {action:'update',user_id:'9303aa45-bb24-4590-b45e-9a1e2eb8a662',display_name:'名稱',role:'owner',active:true},
    {action:'update',user_id:'9303aa45-bb24-4590-b45e-9a1e2eb8a662',display_name:'名稱',role:'admin',active:'false'},
    {action:'reset_password',user_id:'9303aa45-bb24-4590-b45e-9a1e2eb8a662',role:'admin'},
    {action:'delete',user_id:'bad'},
    {action:'delete',user_id:'9303aa45-bb24-4590-b45e-9a1e2eb8a662',role:'admin'}
  ])assert.throws(()=>normalizeUserManagementRequest(input),/invalid/i);
});

test('permanent user deletion migration preserves historical references and rate-limits deletion',()=>{
  const sql=fs.readFileSync(path.join(root,'supabase/migrations/008_permanent_user_deletion.sql'),'utf8');
  for(const relation of ['audit_logs','teams','matches','match_results','players']){
    assert.match(sql,new RegExp(`alter table public\\.${relation}[\\s\\S]*references auth\\.users\\(id\\) on delete set null`,'i'),relation);
  }
  assert.match(sql,/operation in \('update','reset_password','delete'\)/i);
  assert.match(sql,/p_operation='delete'/i);
  assert.match(sql,/grant execute on function public\.consume_user_management_quota\(uuid,text\) to service_role/i);
});

test('user management migration is service-only, audited and prevents self lockout',()=>{
  const sql=fs.readFileSync(migrationPath,'utf8');
  for(const name of ['complete_user_management_update','record_user_password_reset','consume_user_management_quota']){
    assert.match(sql,new RegExp(`create or replace function public\\.${name}\\(`,'i'));
    assert.match(sql,new RegExp(`revoke all on function public\\.${name}\\([^;]+ from public,anon,authenticated`,'i'));
    assert.match(sql,new RegExp(`grant execute on function public\\.${name}\\([^;]+ to service_role`,'i'));
  }
  assert.match(sql,/p_actor_id\s*=\s*p_user_id[\s\S]*self lockout/i);
  assert.match(sql,/'update_user'/i);
  assert.match(sql,/'reset_user_password'/i);
  assert.match(sql,/p_operation\s*=\s*'reset_password'/i);
});

test('management Edge Function authenticates active admin and synchronizes Auth safely',()=>{
  const source=fs.readFileSync(path.join(functionDir,'index.ts'),'utf8');
  assert.match(source,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source,/auth\.getUser\(/);
  assert.match(source,/role[^\n]+admin/);
  assert.match(source,/getUserById/);
  assert.match(source,/updateUserById/);
  assert.match(source,/ban_duration/);
  assert.match(source,/resetPasswordForEmail/);
  assert.match(source,/complete_user_management_update/);
  assert.match(source,/record_user_password_reset/);
  assert.match(source,/self_lockout_forbidden/);
  assert.match(source,/self_delete_forbidden/);
  assert.match(source,/deleteUser\(command\.userId,false\)/);
  assert.match(source,/'delete_user_requested'/);
  assert.match(source,/'delete_user_failed'/);
  assert.match(source,/'delete_user'/);
  assert.doesNotMatch(source,/Access-Control-Allow-Origin['"]?\s*:\s*['"]\*['"]/);
});
