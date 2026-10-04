'use strict';
const {createHash}=require('node:crypto');
const {toPublicDataset,normalizePublicSnapshot}=require('../assets/js/league-repository.js');
async function createSnapshot({environment,projectRef,seasonCode,sourceCommit,sourceTag=null,url,key,requestId=null,fetcher=globalThis.fetch,fixture=null}){
 if(!/^[a-f0-9]{40}$/.test(sourceCommit))throw new Error('Missing exact snapshot source commit');
 if(requestId!==null&&!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(requestId))throw new Error('Invalid publication request ID');
 const {contentHash,HASH_ALGORITHM}=await import('../supabase/functions/_shared/public-content.mjs');
 let payload=fixture,expectedHash=null;
 if(!payload){
  const response=await fetcher(`${url}/rest/v1/rpc/get_public_league_snapshot`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({p_season_code:seasonCode}),redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!response.ok||response.redirected)throw new Error(`Public snapshot query failed (HTTP ${response.status}); existing site must remain unchanged`);
  const text=await response.text();if(Buffer.byteLength(text)>2000000)throw new Error('Public response exceeds limit');const envelope=JSON.parse(text);if(envelope.hashAlgorithm!==HASH_ALGORITHM||!/^[a-f0-9]{64}$/.test(envelope.contentHash||''))throw new Error('Missing verified public content hash');payload=envelope.data;expectedHash=envelope.contentHash;
 }
 const data=toPublicDataset(payload);
 const hash=await contentHash(data);if(expectedHash&&hash!==expectedHash)throw new Error('Database/public projection hash mismatch; do not publish');
 const metadata={environment,projectRef,seasonCode,sourceCommit,sourceTag,generatedAt:new Date().toISOString(),requestId,contentHash:hash,hashAlgorithm:HASH_ALGORITHM};
 metadata.snapshotId=createHash('sha256').update(JSON.stringify({metadata,data})).digest('hex');
 const snapshot={schemaVersion:1,metadata,data};normalizePublicSnapshot(snapshot,metadata);return snapshot;
}
module.exports={createSnapshot};
