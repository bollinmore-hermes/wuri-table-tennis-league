const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const test=require('node:test');

const root=path.resolve(__dirname,'..');
const migrationPath=path.join(root,'supabase/migrations/006_user_invitations.sql');
const functionDir=path.join(root,'supabase/functions/invite-league-user');

async function loadCore(){
  return import(pathToFileURL(path.join(functionDir,'core.mjs')).href);
}

test('invitation input accepts only normalized email, display name and known roles',async()=>{
  const {normalizeInvitation}=await loadCore();
  assert.deepEqual(normalizeInvitation({email:'  Admin+Test@Example.COM ',display_name:'  測試 管理員  ',role:'admin'}),{
    email:'admin+test@example.com',displayName:'測試 管理員',role:'admin'
  });
  assert.deepEqual(normalizeInvitation({email:'score@example.com',displayName:'賽務人員',role:'scorer'}),{
    email:'score@example.com',displayName:'賽務人員',role:'scorer'
  });
  for(const input of [
    {email:'not-an-email',display_name:'名稱',role:'admin'},
    {email:'a@example.com',display_name:'',role:'admin'},
    {email:'a@example.com',display_name:'名稱',role:'owner'},
    {email:'a@example.com',display_name:'x'.repeat(101),role:'admin'},
    {email:'a@example.com\nBcc:x@example.com',display_name:'名稱',role:'admin'}
  ])assert.throws(()=>normalizeInvitation(input),/invalid/i);
});

test('invitation origin policy is explicit and rejects lookalike origins',async()=>{
  const {isAllowedOrigin}=await loadCore();
  const allowed=['https://bollinmore-hermes.github.io','http://127.0.0.1:8765','http://localhost:8765'];
  assert.equal(isAllowedOrigin('https://bollinmore-hermes.github.io',allowed),true);
  assert.equal(isAllowedOrigin('https://bollinmore-hermes.github.io.evil.example',allowed),false);
  assert.equal(isAllowedOrigin('null',allowed),false);
  assert.equal(isAllowedOrigin('',allowed),false);
});

test('invitation migration keeps privileged completion RPC service-only and rate-limited',()=>{
  const sql=fs.readFileSync(migrationPath,'utf8');
  assert.match(sql,/alter table public\.profiles add column if not exists email text/i);
  assert.match(sql,/create table if not exists public\.user_invite_rate_limits/i);
  for(const name of ['consume_user_invite_quota','complete_user_invitation']){
    assert.match(sql,new RegExp(`create or replace function public\\.${name}\\(`,'i'));
    assert.match(sql,new RegExp(`revoke all on function public\\.${name}\\([^;]+ from public,anon,authenticated`,'i'));
    assert.match(sql,new RegExp(`grant execute on function public\\.${name}\\([^;]+ to service_role`,'i'));
  }
  assert.match(sql,/app_role is distinct from 'admin'/i);
  assert.match(sql,/attempts\s*>?=\s*5/i);
  assert.match(sql,/'invite_user'/i);
  assert.match(sql,/create or replace function public\.get_admin_users\(\)/i);
  assert.match(sql,/grant execute on function public\.get_admin_users\(\) to authenticated/i);
});

test('Edge Function authenticates the caller, checks admin profile and keeps secrets server-side',()=>{
  const source=fs.readFileSync(path.join(functionDir,'index.ts'),'utf8');
  assert.match(source,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source,/auth\.getUser\(/);
  assert.match(source,/\.from\(['"]profiles['"]\)/);
  assert.match(source,/role[^\n]+admin/);
  assert.match(source,/consume_user_invite_quota/);
  assert.match(source,/inviteUserByEmail/);
  assert.match(source,/complete_user_invitation/);
  assert.match(source,/deleteUser/);
  assert.doesNotMatch(source,/Access-Control-Allow-Origin['"]?\s*:\s*['"]\*['"]/);
});
