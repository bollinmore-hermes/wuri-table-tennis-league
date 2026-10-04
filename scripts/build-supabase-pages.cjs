const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const {createSnapshot}=require('./public-snapshot.cjs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const targets={
  test:{
    label:'Test',
    projectRef:'vppjcjfbcoxzofcuxmzz',
    urlVariable:'SUPABASE_TEST_URL',
    keyVariable:'SUPABASE_TEST_PUBLISHABLE_KEY',
    output:'test-pages-dist'
  },
  production:{
    label:'Production',
    projectRef:'zofiiibgnjuodgrzhkpn',
    urlVariable:'SUPABASE_PRODUCTION_URL',
    keyVariable:'SUPABASE_PRODUCTION_PUBLISHABLE_KEY',
    output:'production-pages-dist'
  }
};

const environment=String(process.argv[2]||'').toLowerCase();
const target=targets[environment];
if(!target)throw new Error('Usage: node scripts/build-supabase-pages.cjs <test|production>');

const url=(process.env[target.urlVariable]||'').trim().replace(/\/$/,'');
const publishableKey=(process.env[target.keyVariable]||'').trim();
if(!url||!publishableKey)throw new Error(`${target.label} Pages build requires ${target.urlVariable} and ${target.keyVariable}`);
if(url!==`https://${target.projectRef}.supabase.co`)throw new Error(`${target.label} build must target ${target.projectRef}`);
if(publishableKey.length<20)throw new Error(`${target.keyVariable} is too short`);

const jwtRole=key=>{
  if(!/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key))return null;
  try{return JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString('utf8')).role||null}catch{return 'invalid'}
};
if(/^sb_secret_/i.test(publishableKey)||jwtRole(publishableKey)==='service_role'||/service[_-]?role|postgres(?:ql)?:|jwt[_-]?secret|database[_-]?password/i.test(`${url}\n${publishableKey}`))throw new Error('Privileged secret material is forbidden in browser builds');

async function main(){
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const sourceTag=environment==='production'?(process.env.SNAPSHOT_SOURCE_TAG||execFileSync('git',['describe','--exact-match','--tags','HEAD'],{cwd:root,encoding:'utf8'}).trim()):null;
if(sourceTag&&execFileSync('git',['rev-parse',`${sourceTag}^{commit}`],{cwd:root,encoding:'utf8'}).trim()!==sourceCommit)throw new Error('Release tag does not match checkout');
const snapshot=await createSnapshot({environment,projectRef:target.projectRef,seasonCode:'2026-autumn-second-half',sourceCommit,sourceTag,url,key:publishableKey,requestId:process.env.SNAPSHOT_REQUEST_ID||null,fixture:process.env.NODE_ENV==='test'&&process.env.SNAPSHOT_TEST_FIXTURE==='official'?require('../assets/js/official-data.js'):null});
const out=path.join(root,target.output);
const adminOut=path.join(out,'admin');
const config={
  mode:'supabase',
  environment,
  projectRef:target.projectRef,
  supabaseUrl:url,
  supabasePublishableKey:publishableKey,
  seasonCode:'2026-autumn-second-half'
};
config.sourceCommit=sourceCommit;config.sourceTag=sourceTag;
const configSource=`window.LEAGUE_CONFIG = Object.freeze(${JSON.stringify(config,null,2)});\n`;
const copy=(relative,destination)=>{
  const source=path.join(root,relative),targetPath=path.join(destination,relative);
  fs.mkdirSync(path.dirname(targetPath),{recursive:true});
  fs.cpSync(source,targetPath,{recursive:true});
};

fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(adminOut,{recursive:true});

for(const file of ['index.html','event-rules.html','assets/css/event-rules.css','assets/js/event-rules-data.js','assets/js/event-rules.js','assets/js/theme.js','assets/js/official-data.js','assets/js/league-repository.js','assets/js/app.js'])copy(file,out);
copy('assets/team-logos',out);
let publicHtml=fs.readFileSync(path.join(out,'index.html'),'utf8');
publicHtml=publicHtml.replace('<script src="assets/js/official-data.js"></script>','<script src="assets/js/config.js"></script>');
fs.unlinkSync(path.join(out,'assets/js/official-data.js'));
fs.writeFileSync(path.join(out,'index.html'),publicHtml);
fs.mkdirSync(path.join(out,'assets/js'),{recursive:true});
const publicConfig={mode:'snapshot',environment,projectRef:target.projectRef,seasonCode:config.seasonCode,sourceCommit,sourceTag,snapshotUrl:'public-league.json'};
const delivery=environment==='test'?'storage':(process.env.PUBLIC_SNAPSHOT_DELIVERY||'actions');
if(!['actions','storage'].includes(delivery))throw new Error('Invalid public snapshot delivery');
if(delivery==='storage')publicConfig.pointerUrl=`${url}/functions/v1/public-snapshot-pointer`;
fs.writeFileSync(path.join(out,'assets/js/config.js'),`window.LEAGUE_CONFIG = Object.freeze(${JSON.stringify(publicConfig,null,2)});\n`);
fs.writeFileSync(path.join(out,'public-league.json'),JSON.stringify(snapshot));
fs.writeFileSync(path.join(out,'release-manifest.json'),JSON.stringify({schemaVersion:1,environment,projectRef:target.projectRef,sourceCommit,sourceTag}));

for(const file of ['admin.html','assets/css/admin-v2.css','assets/js/admin.js','assets/js/publication-ui.js','assets/js/admin-repository.js','assets/js/excel-import.js','assets/js/official-data.js','assets/vendor/xlsx.full.min.js','assets/vendor/supabase.js','templates/wuri-league-demo-import.xlsx'])copy(file,adminOut);
copy('assets/team-logos',adminOut);
let adminHtml=fs.readFileSync(path.join(adminOut,'admin.html'),'utf8').replaceAll('href="index.html"','href="../index.html"');
fs.writeFileSync(path.join(adminOut,'index.html'),adminHtml);
fs.unlinkSync(path.join(adminOut,'admin.html'));
fs.mkdirSync(path.join(adminOut,'assets/js'),{recursive:true});
fs.writeFileSync(path.join(adminOut,'assets/js/config.js'),configSource);
fs.writeFileSync(path.join(out,'.nojekyll'),'');

const walk=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  const absolute=path.join(directory,entry.name);
  return entry.isDirectory()?walk(absolute):[absolute];
});
const text=walk(out).filter(file=>/\.(?:html|js|css|json|svg|txt)$/i.test(file)).map(file=>fs.readFileSync(file,'utf8')).join('\n');
const opposite=environment==='test'?targets.production.projectRef:targets.test.projectRef;
if(text.includes(opposite))throw new Error(`Generated ${target.label} artifact references the opposite Supabase project`);
if(/service[_-]?role|postgres(?:ql)?:|jwt[_-]?secret|database[_-]?password/i.test(text))throw new Error('Generated browser artifact contains forbidden secret markers');

console.log(JSON.stringify({ok:true,environment,projectRef:target.projectRef,sourceCommit,sourceTag,snapshotId:snapshot.metadata.snapshotId,output:target.output,public:'/',admin:'/admin/'},null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
