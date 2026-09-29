const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function userId(value){const id=String(value??'').trim();if(!uuid.test(id))throw new Error('invalid user management request');return id}
function displayName(value){const name=String(value??'').trim();if(name.length<1||name.length>100||/[\u0000-\u001f\u007f]/.test(name))throw new Error('invalid user management request');return name}

export function normalizeUserManagementRequest(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('invalid user management request');
  const action=String(input.action??'');
  const id=userId(input.user_id??input.userId);
  if(action==='reset_password'){
    if(Object.keys(input).some(key=>!['action','user_id','userId'].includes(key)))throw new Error('invalid user management request');
    return {action,userId:id};
  }
  if(action!=='update')throw new Error('invalid user management request');
  const role=String(input.role??'');
  if(!['admin','scorer'].includes(role)||typeof input.active!=='boolean')throw new Error('invalid user management request');
  return {action,userId:id,displayName:displayName(input.display_name??input.displayName),role,active:input.active};
}

export function parseAllowedOrigins(value){return String(value??'').split(',').map(item=>item.trim()).filter(Boolean)}
export function isAllowedOrigin(origin,allowed){if(!origin||origin==='null')return false;try{const normalized=new URL(origin).origin;return allowed.some(item=>{try{return new URL(item).origin===normalized}catch{return false}})}catch{return false}}
