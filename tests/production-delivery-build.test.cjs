const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),test=require('node:test'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
test('Production build explicitly enables Storage; legacy default, invalid-mode denial and tag-only workflow remain intact',()=>{
 const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'wuri-production-build-'));
 try{
 for(const f of [...new Set([...execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean),'referee.html','assets/css/reporting.css','assets/js/reporting-core.js','assets/js/referee.js','assets/js/result-review.js','assets/js/report-links.js','assets/vendor/qrcode.js','assets/vendor/qrcode.LICENSE.txt'])]){fs.mkdirSync(path.dirname(path.join(fixture,f)),{recursive:true});fs.copyFileSync(path.join(root,f),path.join(fixture,f))}
 const git=(...a)=>execFileSync('git',a,{cwd:fixture,stdio:'pipe'});git('init','--quiet');git('add','.');git('-c','user.name=Build verification','-c','user.email=verification@example.invalid','commit','--quiet','-m','isolated build fixture');git('tag','v0.8.2');
 const env={...process.env,NODE_ENV:'test',SNAPSHOT_TEST_FIXTURE:'official',SNAPSHOT_SOURCE_TAG:'v0.8.2',SUPABASE_PRODUCTION_URL:'https://zofiiibgnjuodgrzhkpn.supabase.co',SUPABASE_PRODUCTION_PUBLISHABLE_KEY:'production-publishable-fixture-only-000001'};
 const run=delivery=>execFileSync(process.execPath,['scripts/build-supabase-pages.cjs','production'],{cwd:fixture,env:{...env,PUBLIC_SNAPSHOT_DELIVERY:delivery},stdio:'pipe'});
 const read=()=>fs.readFileSync(path.join(fixture,'production-pages-dist/assets/js/config.js'),'utf8');
 run('storage');assert.match(read(),/"pointerUrl": "https:\/\/zofiiibgnjuodgrzhkpn.supabase.co\/functions\/v1\/public-snapshot-pointer"/);assert.doesNotMatch(read(),/vppjcjfbcoxzofcuxmzz/);
 run('');assert.doesNotMatch(read(),/pointerUrl/);assert.throws(()=>run('typo'),/Invalid public snapshot delivery/);
 const workflow=fs.readFileSync(path.join(root,'.github/workflows/pages.yml'),'utf8');assert.match(workflow,/PUBLIC_SNAPSHOT_DELIVERY:\s*storage/);assert.match(workflow,/tags:\s*\n\s*- 'v\*'/);assert.doesNotMatch(workflow,/branches:\s*\n\s*- main/);
 }finally{fs.rmSync(fixture,{recursive:true,force:true})}
});
