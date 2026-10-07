const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const Auth=require('../assets/js/admin-auth.js');
const {SupabaseRepository}=require('../assets/js/admin-repository.js');
const config={supabaseUrl:'https://test-project.supabase.co',supabasePublishableKey:'public-browser-key'};

test('OAuth uses PKCE but retains automatic invitation/recovery detection',()=>{
  assert.deepEqual(Auth.clientOptions(),{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}});
});
test('OAuth redirect contains only the current origin/path and an explicit callback marker',()=>{
  assert.equal(Auth.redirectTo('https://example.com/test/admin/?next=https://evil.test#access_token=secret'),'https://example.com/test/admin/?oauth=google');
  assert.throws(()=>Auth.redirectTo('javascript:alert(1)'));
});
test('provider settings fail closed, use only the public key, and never enable signup',async()=>{
  const calls=[];
  const request=async(url,options)=>{calls.push([url,options]);return {ok:true,json:async()=>({external:{google:true},disable_signup:true})}};
  assert.equal(await Auth.googleAvailable(config,request),true);
  assert.equal(calls[0][0],'https://test-project.supabase.co/auth/v1/settings');
  assert.equal(calls[0][1].headers.apikey,'public-browser-key');
  for(const response of [{external:{google:false}},{external:{google:'true'}},{}])assert.equal(await Auth.googleAvailable(config,async()=>({ok:true,json:async()=>response})),false);
  assert.equal(await Auth.googleAvailable(config,async()=>{throw Error('offline')}),false);
});
test('callback parser distinguishes Google, invitation, recovery, and provider cancellation without reflecting secrets',()=>{
  assert.deepEqual(Auth.callback('https://x.test/admin/?oauth=google&code=secret-code'),{google:true,error:null});
  assert.equal(Auth.callback('https://x.test/admin/#type=invite').google,false);
  assert.equal(Auth.callback('https://x.test/admin/#type=recovery').google,false);
  const cancelled=Auth.callback('https://x.test/admin/?oauth=google#error=access_denied&error_description=secret');
  assert.match(cancelled.error,/取消/);
  assert.doesNotMatch(cancelled.error,/secret/);
  assert.match(Auth.callback('https://x.test/admin/?oauth=google&error_code=signup_disabled').error,/邀請/);
});
test('auth URL cleanup preserves unrelated parameters and clears only authentication material',()=>{
  assert.equal(Auth.cleanUrl('https://x.test/admin/?theme=dark&oauth=google&code=secret#access_token=secret&refresh_token=secret&type=invite'),'/admin/?theme=dark');
  assert.equal(Auth.cleanUrl('https://x.test/admin/#help'),'/admin/#help');
});
test('Google starts through SDK, requests account selection, and never copies roles',async()=>{
  let input;
  const repo=new SupabaseRepository({auth:{signInWithOAuth:async value=>{input=value;return {data:{url:'https://test-project.supabase.co/auth/v1/authorize?provider=google'},error:null}}}},{});
  assert.equal(await repo.loginWithGoogle('https://example.com/admin/?oauth=google'),'https://test-project.supabase.co/auth/v1/authorize?provider=google');
  assert.deepEqual(input,{provider:'google',options:{redirectTo:'https://example.com/admin/?oauth=google',skipBrowserRedirect:true,queryParams:{prompt:'select_account'}}});
  assert.equal(repo.role,null);
});
test('OAuth respects RPC role; uninvited, disabled, missing and invalid profiles clear local role and session',async()=>{
  for(const outcome of [{data:null,error:{code:'42501'}},{data:null,error:null},{data:{role:'admin',active:false},error:null},{data:{role:'owner',active:true},error:null}]){
    let signedOut=0;
    const repo=new SupabaseRepository({rpc:async()=>outcome,auth:{signOut:async options=>{assert.deepEqual(options,{scope:'local'});signedOut++;return {error:null}}}},{});
    repo.role='admin';
    await assert.rejects(()=>repo._authenticatedUser({id:'oauth-user',user_metadata:{role:'admin'}}),/邀請|授權/);
    assert.equal(repo.role,null);assert.equal(signedOut,1);
  }
  const user={id:'existing-invited-user',user_metadata:{role:'admin'}};
  const repo=new SupabaseRepository({rpc:async()=>({data:{role:'scorer',active:true,display_name:'賽務'},error:null})},{});
  assert.deepEqual(await repo._authenticatedUser(user),{user,role:'scorer',name:'賽務'});
});
test('provider/network failures use safe errors rather than SDK payloads',async()=>{
  const repo=new SupabaseRepository({auth:{signInWithOAuth:async()=>({data:null,error:{message:'secret provider payload'}})}},{});
  await assert.rejects(()=>repo.loginWithGoogle('https://example.com/admin/'),error=>!error.message.includes('secret'));
});
test('all admin builders ship the helper and UI retains password login/recovery',()=>{
  const html=fs.readFileSync(path.join(root,'admin.html'),'utf8');
  assert.match(html,/id="googleLogin"[^>]*type="button"/);
  assert.match(html,/id="oauthLogin"[^>]*class="hidden"/);
  assert.match(html,/assets\/js\/admin-auth\.js/);
  assert.match(html,/id="remoteLogin"/);assert.match(html,/id="passwordRecovery"/);
  for(const f of ['build-test.cjs','build-supabase-pages.cjs','build-admin-demo.cjs'])assert.match(fs.readFileSync(path.join(root,'scripts',f),'utf8'),/assets\/js\/admin-auth\.js/);
  const source=fs.readFileSync(path.join(root,'assets/js/admin.js'),'utf8');
  assert.match(source,/auth\.initialize\(/);
  assert.match(source,/Auth\.cleanUrl/);
  assert.match(source,/await repo\.resume\(/);
  assert.doesNotMatch(source,/exchangeCodeForSession/); // SDK detects and exchanges exactly once.
});
