import {createClient} from 'npm:@supabase/supabase-js@2';
import {isAllowedOrigin,normalizeUserManagementRequest,parseAllowedOrigins} from './core.mjs';

const defaultOrigins=['https://bollinmore-hermes.github.io','http://127.0.0.1:8765','http://localhost:8765'];
const configured=parseAllowedOrigins(Deno.env.get('USER_MANAGEMENT_ALLOWED_ORIGINS')||Deno.env.get('INVITE_ALLOWED_ORIGINS'));
const origins=configured.length?configured:defaultOrigins;

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
  const resetRedirect=Deno.env.get('PASSWORD_RESET_REDIRECT_URL')||Deno.env.get('INVITE_REDIRECT_URL')||'';
  if(!supabaseUrl||!anonKey||!serviceRoleKey||!resetRedirect)return response(origin,500,{error:'server_not_configured'});

  const authorization=request.headers.get('authorization')||'';
  const token=authorization.replace(/^Bearer\s+/i,'');
  if(!token||token===authorization)return response(origin,401,{error:'authentication_required'});

  const userClient=createClient(supabaseUrl,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const serviceClient=createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await userClient.auth.getUser(token);
  if(userError||!userData.user)return response(origin,401,{error:'invalid_session'});
  const actorId=userData.user.id;
  const {data:actor,error:actorError}=await serviceClient.from('profiles').select('role,active').eq('id',actorId).maybeSingle();
  if(actorError)return response(origin,500,{error:'authorization_check_failed'});
  if(!actor?.active||actor.role!=='admin')return response(origin,403,{error:'admin_role_required'});

  let command;
  try{command=normalizeUserManagementRequest(await request.json())}catch{return response(origin,400,{error:'invalid_user_management_request'});}
  if(command.action==='update'&&command.userId===actorId&&(!command.active||command.role!=='admin'))return response(origin,409,{error:'self_lockout_forbidden'});
  if(command.action==='delete'&&command.userId===actorId)return response(origin,409,{error:'self_delete_forbidden'});

  const {data:targetProfile,error:targetProfileError}=await serviceClient.from('profiles').select('id,email,display_name,role,active').eq('id',command.userId).maybeSingle();
  if(targetProfileError)return response(origin,500,{error:'target_lookup_failed'});
  if(!targetProfile)return response(origin,404,{error:'user_not_found'});
  const {data:targetAuth,error:targetAuthError}=await serviceClient.auth.admin.getUserById(command.userId);
  if(targetAuthError||!targetAuth.user)return response(origin,404,{error:'auth_user_not_found'});

  const {data:quota,error:quotaError}=await serviceClient.rpc('consume_user_management_quota',{p_actor_id:actorId,p_operation:command.action});
  if(quotaError)return response(origin,500,{error:'quota_check_failed'});
  if(quota!==true)return response(origin,429,{error:'user_management_rate_limited'});

  if(command.action==='reset_password'){
    if(!targetProfile.active)return response(origin,409,{error:'inactive_user_reset_forbidden'});
    const email=String(targetProfile.email||targetAuth.user.email||'').trim().toLowerCase();
    if(!email)return response(origin,409,{error:'user_email_missing'});
    const {error:resetError}=await userClient.auth.resetPasswordForEmail(email,{redirectTo:resetRedirect});
    if(resetError)return response(origin,502,{error:'password_reset_delivery_failed'});
    const {data:recorded,error:recordError}=await serviceClient.rpc('record_user_password_reset',{p_actor_id:actorId,p_user_id:command.userId});
    if(recordError)return response(origin,500,{error:'password_reset_audit_failed'});
    return response(origin,200,{password_reset:recorded});
  }

  if(command.action==='delete'){
    const snapshot={
      id:targetProfile.id,
      email:String(targetProfile.email||targetAuth.user.email||'').trim().toLowerCase(),
      display_name:targetProfile.display_name,
      role:targetProfile.role,
      active:targetProfile.active
    };
    const {data:audit,error:auditError}=await serviceClient.from('audit_logs').insert({
      user_id:actorId,
      action:'delete_user_requested',
      detail:command.userId,
      before_data:snapshot,
      after_data:{deleted:false}
    }).select('id').single();
    if(auditError||!audit)return response(origin,500,{error:'user_delete_audit_failed'});
    const {error:deleteError}=await serviceClient.auth.admin.deleteUser(command.userId,false);
    if(deleteError){
      await serviceClient.from('audit_logs').update({action:'delete_user_failed',after_data:{deleted:false,error:'auth_user_delete_failed'}}).eq('id',audit.id);
      return response(origin,502,{error:'auth_user_delete_failed'});
    }
    const {error:finalizeError}=await serviceClient.from('audit_logs').update({action:'delete_user',after_data:{deleted:true}}).eq('id',audit.id);
    if(finalizeError)return response(origin,500,{error:'user_deleted_audit_finalize_failed'});
    return response(origin,200,{deleted_user:{id:command.userId}});
  }

  const oldMetadata=targetAuth.user.user_metadata||{};
  const {error:authUpdateError}=await serviceClient.auth.admin.updateUserById(command.userId,{
    ban_duration:command.active?'none':'876000h',
    user_metadata:{...oldMetadata,display_name:command.displayName}
  });
  if(authUpdateError)return response(origin,502,{error:'auth_user_update_failed'});
  const {data:updated,error:updateError}=await serviceClient.rpc('complete_user_management_update',{
    p_actor_id:actorId,p_user_id:command.userId,p_display_name:command.displayName,p_role:command.role,p_active:command.active
  });
  if(updateError){
    await serviceClient.auth.admin.updateUserById(command.userId,{
      ban_duration:targetProfile.active?'none':'876000h',user_metadata:oldMetadata
    });
    const selfLockout=/self lockout/i.test(updateError.message||'');
    return response(origin,selfLockout?409:500,{error:selfLockout?'self_lockout_forbidden':'user_update_rolled_back'});
  }
  return response(origin,200,{user:updated});
});
