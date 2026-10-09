'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base='https://bollinmore-hermes.github.io/wuri-table-tennis-league-test/',sha=process.argv[2]||execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(!/^[0-9a-f]{40}$/.test(sha))throw Error('Exact source SHA required');
async function get(file){const response=await fetch(new URL(file+'?issue53='+sha,base));assert.equal(response.status,200,'live route '+file);return response.text()}
(async()=>{
 const manifest=JSON.parse(await get('release-manifest.json'));assert.equal(manifest.sourceCommit,sha);assert.equal(manifest.projectRef,'vppjcjfbcoxzofcuxmzz');
 const identity=[];
 for(const route of ['','admin/','referee/']){
   const source=await get(route+'assets/js/config.js'),match=source.match(/Object\.freeze\((\{[\s\S]*\})\)/);assert(match,'config wrapper '+route);
   const cfg=JSON.parse(match[1]);assert.equal(cfg.environment,'test');assert.equal(cfg.projectRef,'vppjcjfbcoxzofcuxmzz');assert.equal(new URL(cfg.supabaseUrl).hostname,'vppjcjfbcoxzofcuxmzz.supabase.co');assert(!source.includes('zofiiibgnjuodgrzhkpn'));
   identity.push({route:route||'/',environment:cfg.environment,projectRef:cfg.projectRef});
 }
 const admin=await get('admin/'),referee=await get('referee/');assert(admin.includes('賽果核對'));assert(admin.includes('回報連結管理'));assert(!admin.includes('id="scoreDialog"'));assert(referee.includes('裁判賽後比分回報'));assert(!referee.includes('result-review.js'));assert(!referee.includes('report-links.js'));
 const compared=[];
 for(const [route,file]of [
 ['admin/','assets/js/admin.js'],['admin/','assets/js/result-review.js'],['admin/','assets/js/report-links.js'],['admin/','assets/js/reporting-core.js'],['admin/','assets/css/reporting.css'],['admin/','assets/vendor/qrcode.js'],['admin/','assets/vendor/qrcode.LICENSE.txt'],
 ['referee/','assets/js/referee.js'],['referee/','assets/js/reporting-core.js'],['referee/','assets/css/reporting.css']
 ]){assert.equal(await get(route+file),fs.readFileSync(path.join(root,file),'utf8'),'served bytes mismatch: '+route+file);compared.push(route+file)}
 const evidence={ok:true,sourceCommit:sha,base,releaseManifestSourceVerified:true,identity,changedLiveAssetsByteEqual:compared,reviewInlinePopupAbsent:true,refereeNoPrivilegedUiModules:true,productionOperationsPerformed:false};
 const out=path.join(root,'.private/hosted-evidence');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'live.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
})().catch(error=>{console.error(JSON.stringify({ok:false,error:error.message}));process.exitCode=1});
