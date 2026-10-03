'use strict';
const fs=require('node:fs');const path=require('node:path');
let normalizePublicSnapshot;
const {execFileSync}=require('node:child_process');
const targets={test:{projectRef:'vppjcjfbcoxzofcuxmzz',site:'https://bollinmore-hermes.github.io/wuri-table-tennis-league-test/'},production:{projectRef:'zofiiibgnjuodgrzhkpn',site:'https://bollinmore-hermes.github.io/wuri-table-tennis-league/'}};
async function main(){
 const mode=process.argv[2],environment=process.env.DEPLOYMENT_TARGET,target=targets[environment];if(!target)throw new Error('Invalid deployment target');
 normalizePublicSnapshot=mode==='resolve'?(snapshot,config)=>{if(snapshot?.schemaVersion!==1||!/^[a-f0-9]{64}$/.test(snapshot.metadata?.snapshotId||''))throw new Error('Invalid existing snapshot');for(const key of ['environment','projectRef','sourceCommit'])if(snapshot.metadata[key]!==config[key])throw new Error('Mixed published identity')}:require('../assets/js/league-repository.js').normalizePublicSnapshot;
 const baselinePath=process.env.SNAPSHOT_BASELINE||path.resolve('.snapshot-baseline.json');
 const read=async(file)=>{const r=await fetch(`${target.site}${file}?gate=${Date.now()}`,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('Existing published identity unavailable; do not deploy');const text=await r.text();if(Buffer.byteLength(text)>2000000)throw new Error('Response too large');return JSON.parse(text)};
 const identity=async()=>{
  const manifest=await read('release-manifest.json');
  if(manifest.schemaVersion!==1||manifest.environment!==environment||manifest.projectRef!==target.projectRef||!/^[a-f0-9]{40}$/.test(manifest.sourceCommit||''))throw new Error('Invalid existing published identity');
  if(environment==='production'&&!/^v\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(manifest.sourceTag||''))throw new Error('Production must use an existing release tag');
  const snapshot=await read('public-league.json');normalizePublicSnapshot(snapshot,{...manifest,seasonCode:snapshot.metadata?.seasonCode});
  return {...manifest,snapshotId:snapshot.metadata.snapshotId};
 };
 if(mode==='resolve'){
  const baseline=await identity();
  if(environment==='production'){
   let endpoint=`https://api.github.com/repos/bollinmore-hermes/wuri-table-tennis-league/git/ref/tags/${baseline.sourceTag}`;let commit=null;
   for(let depth=0;depth<5;depth++){const r=await fetch(endpoint,{redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('Cannot verify published release tag');const value=await r.json();const object=value.object;if(object?.type==='commit'){commit=object.sha;break}if(object?.type!=='tag'||!/^[a-f0-9]{40}$/.test(object.sha))throw new Error('Invalid release tag');endpoint=`https://api.github.com/repos/bollinmore-hermes/wuri-table-tennis-league/git/tags/${object.sha}`}
   if(commit!==baseline.sourceCommit)throw new Error('Published source is not the release tag target');
  }
  if(process.env.EXPECTED_COMMIT&&process.env.EXPECTED_COMMIT!==baseline.sourceCommit)throw new Error('Code release changed since publication request');
  if(environment==='production'&&process.env.EXPECTED_TAG&&process.env.EXPECTED_TAG!==baseline.sourceTag)throw new Error('Release tag changed since publication request');
  fs.writeFileSync(baselinePath,JSON.stringify(baseline));
  if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`source_commit=${baseline.sourceCommit}\nsource_tag=${baseline.sourceTag||''}\n`);
  console.log(JSON.stringify({environment,sourceCommit:baseline.sourceCommit,sourceTag:baseline.sourceTag}));return;
 }
 const baseline=JSON.parse(fs.readFileSync(baselinePath,'utf8'));
 if(mode==='check'){
  const live=await identity();for(const key of ['sourceCommit','sourceTag','snapshotId'])if(live[key]!==baseline[key])throw new Error('Published site changed during build; refuse stale deployment');
  const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();if(sha!==baseline.sourceCommit)throw new Error('Checkout does not match published source');
  if(environment==='production'&&execFileSync('git',['rev-parse',`${baseline.sourceTag}^{commit}`],{encoding:'utf8'}).trim()!==sha)throw new Error('Production tag mismatch');
  console.log('Published source and snapshot race gate passed');return;
 }
 if(mode==='verify'){
  const expected=JSON.parse(fs.readFileSync(path.join(`${environment}-pages-dist`,'public-league.json'),'utf8'));
  for(let attempt=0;attempt<6;attempt++){
   try{const live=await read('public-league.json');normalizePublicSnapshot(live,{...baseline,seasonCode:expected.metadata.seasonCode});if(live.metadata.snapshotId!==expected.metadata.snapshotId||live.metadata.requestId!==expected.metadata.requestId)throw new Error('Published snapshot not yet visible');console.log(JSON.stringify({verified:true,sourceCommit:live.metadata.sourceCommit,snapshotId:live.metadata.snapshotId,generatedAt:live.metadata.generatedAt}));return}catch(error){if(attempt===5)throw error;await new Promise(resolve=>setTimeout(resolve,5000))}
  }
 }
 throw new Error('Unknown gate mode');
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
