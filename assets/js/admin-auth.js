(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.LeagueAdminAuth=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const authParams=['oauth','code','error','error_code','error_description','access_token','refresh_token','expires_in','expires_at','token_type','type','provider_token','provider_refresh_token','sb_flow_id'];
function clientOptions(){return {auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}}}
function redirectTo(href){const url=new URL(href);if(!['https:','http:'].includes(url.protocol))throw new Error('無效登入網址');return `${url.origin}${url.pathname}?oauth=google`}
function errorMessage(code){if(code==='access_denied')return 'Google 登入已取消，請重試或使用 Email 與密碼登入。';if(['signup_disabled','user_not_found','identity_not_found'].includes(code))return '此帳號尚未獲邀請或授權，請聯絡管理員。';return 'Google 登入未完成，請重新登入；若持續失敗，請聯絡管理員。'}
function callback(href){const url=new URL(href),hash=new URLSearchParams(url.hash.slice(1)),google=url.searchParams.get('oauth')==='google';const code=hash.get('error_code')||url.searchParams.get('error_code')||hash.get('error')||url.searchParams.get('error');return {google,error:code?errorMessage(code):null}}
function cleanUrl(href){const url=new URL(href);for(const key of authParams)url.searchParams.delete(key);const hash=new URLSearchParams(url.hash.slice(1));if(authParams.some(key=>hash.has(key)))url.hash='';return `${url.pathname}${url.search}${url.hash}`}
async function googleAvailable(config,request=globalThis.fetch){try{if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabaseUrl||''))return false;const key=config.supabasePublishableKey||config.supabaseAnonKey;if(!key)return false;const response=await request(`${config.supabaseUrl}/auth/v1/settings`,{headers:{apikey:key},cache:'no-store',signal:AbortSignal.timeout(5000)});if(!response.ok)return false;const settings=await response.json();return settings.external?.google===true}catch{return false}}
return {clientOptions,redirectTo,errorMessage,callback,cleanUrl,googleAvailable};
});
