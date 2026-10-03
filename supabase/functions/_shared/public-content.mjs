// Canonical public JSON v1. Public numeric fields must be safe integers.
const encoder=new TextEncoder();
const compareUTF8=(a,b)=>{const x=encoder.encode(a),y=encoder.encode(b);for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return x[i]-y[i];return x.length-y.length};
export function canonicalPublicJSON(value){
 if(value===null)return 'null';
 if(Array.isArray(value))return '['+value.map(canonicalPublicJSON).sort(compareUTF8).join(',')+']';
 if(typeof value==='object')return '{'+Object.keys(value).sort(compareUTF8).map(k=>JSON.stringify(k)+':'+canonicalPublicJSON(value[k])).join(',')+'}';
 if(typeof value==='number'&&!Number.isSafeInteger(value))throw new Error('Non-integer public number');
 if(!['string','number','boolean'].includes(typeof value))throw new Error('Invalid public content');
 return JSON.stringify(value);
}
export async function contentHash(data){
 const subtle=globalThis.crypto?.subtle||(await import('node:crypto')).webcrypto.subtle;
 return Array.from(new Uint8Array(await subtle.digest('SHA-256',encoder.encode(canonicalPublicJSON(data)))),v=>v.toString(16).padStart(2,'0')).join('');
}
export const HASH_ALGORITHM='public-json-sha256-v1';
