const assert=require('node:assert/strict');

const projectRef='vppjcjfbcoxzofcuxmzz';
const expectedUrl=`https://${projectRef}.supabase.co`;
const seasonCode='2026-autumn-second-half';
const allowedOrigin='https://bollinmore-hermes.github.io';
const deniedOrigin='https://bollinmore-hermes.github.io.evil.example';

function required(name){
  const value=String(process.env[name]||'').trim();
  if(!value)throw new Error(`${name} is required`);
  return value;
}

async function request(name,url,{method='GET',headers={},body,expect}={}){
  const response=await fetch(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload={non_json:true}}
  const result={name,status:response.status,ok:expect(response,payload)};
  if(payload?.code)result.code=payload.code;
  if(payload?.error&&typeof payload.error==='string')result.error=payload.error;
  if(!result.ok)result.observed=payload;
  return {result,response,payload};
}

const denied=response=>[401,403,404].includes(response.status);
const permissionDenied=(response,payload)=>denied(response)&&(!payload?.code||payload.code==='42501'||payload.code==='PGRST301');

async function main(){
  const supabaseUrl=required('SUPABASE_TEST_URL').replace(/\/$/,'');
  const publishableKey=required('SUPABASE_TEST_PUBLISHABLE_KEY');
  assert.equal(supabaseUrl,expectedUrl,'security verification must target the fixed Test project');
  assert.ok(publishableKey.length>20,'publishable key is unexpectedly short');
  assert.doesNotMatch(publishableKey,/^sb_secret_|service[_-]?role/i,'privileged key is forbidden');

  const baseHeaders={apikey:publishableKey,Authorization:`Bearer ${publishableKey}`,'Content-Type':'application/json'};
  const results=[];
  const run=async(...args)=>{const output=await request(...args);results.push(output.result);return output};

  for(const table of ['seasons','matches','profiles','audit_logs']){
    await run(`anon direct table denied: ${table}`,`${supabaseUrl}/rest/v1/${table}?select=*&limit=1`,{headers:baseHeaders,expect:permissionDenied});
  }

  const publicLeague=await run('anon public RPC allowed',`${supabaseUrl}/rest/v1/rpc/get_public_league`,{
    method:'POST',headers:baseHeaders,body:{p_season_code:seasonCode},expect:response=>response.status===200
  });
  if(publicLeague.result.ok){
    const data=publicLeague.payload||{};
    publicLeague.result.summary={
      teams:Array.isArray(data.teams)?data.teams.length:null,
      matches:Array.isArray(data.matches)?data.matches.length:null,
      results:Array.isArray(data.results)?data.results.length:null,
      exposesInternalIds:/\b(?:id|user_id|updated_by)\b/.test(JSON.stringify(data))
    };
    publicLeague.result.ok=publicLeague.result.summary.exposesInternalIds===false;
  }

  for(const [rpc,body] of [
    ['get_admin_dataset',{p_season_code:seasonCode}],
    ['get_my_profile',{}],
    ['get_admin_users',{}],
    ['import_league_data',{p_payload:{season_code:seasonCode}}],
    ['consume_user_invite_quota',{p_actor_id:'00000000-0000-4000-8000-000000000000'}],
    ['consume_user_management_quota',{p_actor_id:'00000000-0000-4000-8000-000000000000',p_operation:'update'}]
  ]){
    await run(`anon RPC denied: ${rpc}`,`${supabaseUrl}/rest/v1/rpc/${rpc}`,{method:'POST',headers:baseHeaders,body,expect:permissionDenied});
  }

  const functionHeaders={apikey:publishableKey,'Content-Type':'application/json'};
  for(const functionName of ['invite-league-user','manage-league-user']){
    const endpoint=`${supabaseUrl}/functions/v1/${functionName}`;
    await run(`allowed-origin preflight: ${functionName}`,endpoint,{
      method:'OPTIONS',headers:{...functionHeaders,Origin:allowedOrigin},expect:response=>response.status===204&&response.headers.get('access-control-allow-origin')===allowedOrigin
    });
    await run(`disallowed origin denied: ${functionName}`,endpoint,{
      method:'POST',headers:{...functionHeaders,Origin:deniedOrigin},body:{},expect:(response,payload)=>response.status===403&&payload?.error==='origin_not_allowed'
    });
    await run(`anonymous function call denied: ${functionName}`,endpoint,{
      method:'POST',headers:{...functionHeaders,Origin:allowedOrigin},body:{},expect:(response,payload)=>response.status===401&&payload?.error==='authentication_required'
    });
  }

  const email=String(process.env.SUPABASE_TEST_ADMIN_EMAIL||'').trim();
  const password=String(process.env.SUPABASE_TEST_ADMIN_PASSWORD||'');
  if(email&&password){
    const auth=await run('Test admin password sign-in',`${supabaseUrl}/auth/v1/token?grant_type=password`,{
      method:'POST',headers:{apikey:publishableKey,'Content-Type':'application/json'},body:{email,password},expect:(response,payload)=>response.status===200&&Boolean(payload?.access_token)
    });
    if(auth.result.ok){
      delete auth.result.observed;
      const token=auth.payload.access_token;
      const authenticatedHeaders={apikey:publishableKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
      const profile=await run('admin profile allowed',`${supabaseUrl}/rest/v1/rpc/get_my_profile`,{
        method:'POST',headers:authenticatedHeaders,body:{},expect:(response,payload)=>response.status===200&&payload?.role==='admin'&&payload?.active===true
      });
      if(profile.result.ok)profile.result.profile={role:profile.payload.role,active:profile.payload.active};
      await run('admin dataset allowed',`${supabaseUrl}/rest/v1/rpc/get_admin_dataset`,{
        method:'POST',headers:authenticatedHeaders,body:{p_season_code:seasonCode},expect:response=>response.status===200
      });
      await run('admin user listing allowed',`${supabaseUrl}/rest/v1/rpc/get_admin_users`,{
        method:'POST',headers:authenticatedHeaders,body:{},expect:response=>response.status===200
      });
      for(const table of ['seasons','profiles','audit_logs']){
        await run(`authenticated direct table denied: ${table}`,`${supabaseUrl}/rest/v1/${table}?select=*&limit=1`,{headers:authenticatedHeaders,expect:permissionDenied});
      }
      await run('browser admin cannot call service-only invitation quota RPC',`${supabaseUrl}/rest/v1/rpc/consume_user_invite_quota`,{
        method:'POST',headers:authenticatedHeaders,body:{p_actor_id:'00000000-0000-4000-8000-000000000000'},expect:permissionDenied
      });
      await run('browser admin cannot call service-only management quota RPC',`${supabaseUrl}/rest/v1/rpc/consume_user_management_quota`,{
        method:'POST',headers:authenticatedHeaders,body:{p_actor_id:'00000000-0000-4000-8000-000000000000',p_operation:'update'},expect:permissionDenied
      });
    }
  }else{
    results.push({name:'authenticated admin matrix',status:'skipped',ok:true,reason:'SUPABASE_TEST_ADMIN_EMAIL/PASSWORD not set'});
  }

  const failed=results.filter(result=>!result.ok);
  console.log(JSON.stringify({
    ok:failed.length===0,
    environment:'test',
    projectRef,
    performedAt:new Date().toISOString(),
    results,
    limitations:[
      'No scorer, inactive-user, unprofiled-user, or write-path mutation was performed.',
      'Email delivery, invite completion, and password-reset delivery are outside this read-only verifier.'
    ]
  },null,2));
  if(failed.length)process.exitCode=1;
}

main().catch(error=>{
  console.error(JSON.stringify({ok:false,error:error.message},null,2));
  process.exitCode=1;
});
