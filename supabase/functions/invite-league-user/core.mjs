export function normalizeInvitation(input){
  if(!input||typeof input!=='object')throw new Error('invalid invitation');
  const email=String(input.email??'').trim().toLowerCase();
  const displayName=String(input.display_name??input.displayName??'').trim();
  const role=String(input.role??'');
  const emailPattern=/^[^\s@<>\u0000-\u001f\u007f]+@[^\s@<>\u0000-\u001f\u007f]+\.[^\s@<>\u0000-\u001f\u007f]+$/;
  if(!emailPattern.test(email)||email.length>320)throw new Error('invalid email');
  if(!displayName||displayName.length>100||/[\u0000-\u001f\u007f]/.test(displayName))throw new Error('invalid display name');
  if(!['admin','scorer'].includes(role))throw new Error('invalid role');
  return {email,displayName,role};
}

export function parseAllowedOrigins(value){
  return String(value??'').split(',').map(item=>item.trim()).filter(Boolean);
}

export function isAllowedOrigin(origin,allowedOrigins){
  if(!origin||origin==='null')return false;
  return allowedOrigins.includes(origin);
}
