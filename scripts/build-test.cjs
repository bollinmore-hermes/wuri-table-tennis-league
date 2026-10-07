const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const out=path.join(root,'test-dist');
const publicOut=path.join(out,'public');
const adminOut=path.join(out,'admin');
const url=(process.env.SUPABASE_TEST_URL||'').trim();
const publishableKey=(process.env.SUPABASE_TEST_PUBLISHABLE_KEY||'').trim();
const deployment=/^(1|true)$/i.test(process.env.TEST_DEPLOYMENT||'');
const configured=Boolean(url&&publishableKey);
const jwtRole=key=>{
  if(!/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key))return null;
  try{return JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString('utf8')).role||null}catch{return 'invalid'}
};
if(Boolean(url)!==Boolean(publishableKey))throw new Error('SUPABASE_TEST_URL and SUPABASE_TEST_PUBLISHABLE_KEY must be provided together');
if(deployment&&!configured)throw new Error('TEST_DEPLOYMENT requires real Test Supabase configuration');
if(configured&&!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url))throw new Error('SUPABASE_TEST_URL must be a Supabase HTTPS project URL');
if(configured&&publishableKey.length<20)throw new Error('SUPABASE_TEST_PUBLISHABLE_KEY is too short');
if(/^sb_secret_/i.test(publishableKey)||jwtRole(publishableKey)==='service_role'||/service[_-]?role|postgres(?:ql)?:|jwt[_-]?secret|database[_-]?password/i.test(`${url}\n${publishableKey}`))throw new Error('Privileged secret material is forbidden in browser builds');

const config={mode:configured?'supabase':'disabled',supabaseUrl:configured?url:'',supabasePublishableKey:configured?publishableKey:'',seasonCode:'2026-autumn-second-half'};
const configSource=`window.LEAGUE_CONFIG = Object.freeze(${JSON.stringify(config,null,2)});\n`;
const copy=(relative,destination)=>{const source=path.join(root,relative),target=path.join(destination,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.cpSync(source,target,{recursive:true})};
fs.rmSync(out,{recursive:true,force:true});
for(const dir of [publicOut,adminOut])fs.mkdirSync(dir,{recursive:true});

for(const file of ['index.html','event-rules.html','assets/css/event-rules.css','assets/js/event-rules-data.js','assets/js/event-rules.js','assets/js/theme.js','assets/js/official-data.js','assets/js/league-repository.js','assets/js/app.js','assets/js/standings-image.js','assets/vendor/supabase.js'])copy(file,publicOut);
copy('assets/team-logos',publicOut);
let publicHtml=fs.readFileSync(path.join(publicOut,'index.html'),'utf8');
publicHtml=publicHtml.replace('<script src="assets/js/official-data.js"></script>','<script src="assets/js/config.js"></script>\n<script src="assets/vendor/supabase.js"></script>\n<script src="assets/js/official-data.js"></script>');
fs.writeFileSync(path.join(publicOut,'index.html'),publicHtml);
fs.mkdirSync(path.join(publicOut,'assets/js'),{recursive:true});
fs.writeFileSync(path.join(publicOut,'assets/js/config.js'),configSource);

for(const file of ['admin.html','assets/css/admin-v2.css','assets/js/admin.js','assets/js/admin-auth.js','assets/js/publication-ui.js','assets/js/admin-repository.js','assets/js/excel-import.js','assets/js/official-data.js','assets/vendor/xlsx.full.min.js','assets/vendor/supabase.js','templates/wuri-league-demo-import.xlsx'])copy(file,adminOut);
copy('assets/team-logos',adminOut);
let adminHtml=fs.readFileSync(path.join(adminOut,'admin.html'),'utf8').replaceAll('href="index.html"','href="../public/index.html"');
fs.writeFileSync(path.join(adminOut,'index.html'),adminHtml);
fs.unlinkSync(path.join(adminOut,'admin.html'));
fs.mkdirSync(path.join(adminOut,'assets/js'),{recursive:true});
fs.writeFileSync(path.join(adminOut,'assets/js/config.js'),configSource);
for(const dir of [publicOut,adminOut])fs.writeFileSync(path.join(dir,'.nojekyll'),'');

const builtConfig=[path.join(publicOut,'assets/js/config.js'),path.join(adminOut,'assets/js/config.js')].map(file=>fs.readFileSync(file,'utf8')).join('\n');
if(/service[_-]?role|postgres(?:ql)?:|jwt[_-]?secret|database[_-]?password/i.test(builtConfig))throw new Error('Generated browser config contains forbidden secret markers');
console.log(JSON.stringify({ok:true,output:out,mode:config.mode,public:'test-dist/public',admin:'test-dist/admin',deploymentReady:configured},null,2));
