import {createClient} from 'npm:@supabase/supabase-js@2';
import {isAllowedOrigin,normalizeInvitation,parseAllowedOrigins} from './core.mjs';

const defaultOrigins=['https://bollinmore-hermes.github.io','http://127.0.0.1:8765','http://localhost:8765'];
const allowedOrigins=parseAllowedOrigins(Deno.env.get('INVITE_ALLOWED_ORIGINS'));
const origins=allowedOrigins.length?allowedOrigins:defaultOrigins;

function response(origin,status,body){
  const headers={'Content-Type':'application/json; charset=utf-8','Vary':'Origin'};
  if(isAllowedOrigin(origin,origins)){
    headers['Access-Control-Allow-Origin']=origin;
    headers['Access-Control-Allow-Headers']='authorization, x-client-info, apikey, content-type';
    headers['Access-Control-Allow-Methods']='POST, OPTIONS';
  }
  return new Response(status===204?null:JSON.stringify(body),{status,headers});
}

Deno.serve(async request=>{
  const origin=request.headers.get('origin')||'';
  if(!isAllowedOrigin(origin,origins))return response(origin,403,{error:'origin_not_allowed'});
  if(request.method==='OPTIONS')return response(origin,204,{});
  if(request.method!=='POST')return response(origin,405,{error:'method_not_allowed'});

  const supabaseUrl=Deno.env.get('SUPABASE_URL')||'';
  const anonKey=Deno.env.get('SUPABASE_ANON_KEY')||'';
  const serviceRoleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  const redirectTo=Deno.env.get('INVITE_REDIRECT_URL')||'';
  if(!supabaseUrl||!anonKey||!serviceRoleKey||!redirectTo)return response(origin,500,{error:'server_not_configured'});

  const authorization=request.headers.get('authorization')||'';
  const token=authorization.replace(/^Bearer\s+/i,'');
  if(!token||token===authorization)return response(origin,401,{error:'authentication_required'});

  const userClient=createClient(supabaseUrl,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const serviceClient=createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await userClient.auth.getUser(token);
  if(userError||!userData.user)return response(origin,401,{error:'invalid_session'});

  const actorId=userData.user.id;
  const {data:profile,error:profileError}=await serviceClient.from('profiles').select('role,active').eq('id',actorId).maybeSingle();
  if(profileError)return response(origin,500,{error:'authorization_check_failed'});
  if(!profile?.active||profile.role!=='admin')return response(origin,403,{error:'admin_role_required'});

  let invitation;
  try{invitation=normalizeInvitation(await request.json())}catch{return response(origin,400,{error:'invalid_invitation'});}

  const {data:quota,error:quotaError}=await serviceClient.rpc('consume_user_invite_quota',{p_actor_id:actorId});
  if(quotaError)return response(origin,500,{error:'quota_check_failed'});
  if(quota!==true)return response(origin,429,{error:'invite_rate_limited'});

  const {data:inviteData,error:inviteError}=await serviceClient.auth.admin.inviteUserByEmail(invitation.email,{
    redirectTo,
    data:{display_name:invitation.displayName}
  });
  if(inviteError||!inviteData.user){
    const duplicate=/already|registered|exists/i.test(inviteError?.message||'');
    return response(origin,duplicate?409:502,{error:duplicate?'user_already_exists':'invite_delivery_failed'});
  }

  const invitedUserId=inviteData.user.id;
  const {data:completed,error:completionError}=await serviceClient.rpc('complete_user_invitation',{
    p_actor_id:actorId,
    p_user_id:invitedUserId,
    p_email:invitation.email,
    p_display_name:invitation.displayName,
    p_role:invitation.role
  });
  if(completionError){
    const {error:rollbackError}=await serviceClient.auth.admin.deleteUser(invitedUserId);
    return response(origin,500,{error:rollbackError?'invitation_partially_failed':'invitation_rolled_back'});
  }

  return response(origin,201,{invitation:completed});
});
