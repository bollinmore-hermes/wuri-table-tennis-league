const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'pages-dist');
fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(out,{recursive:true});
for(const file of ['index.html','admin.html','team-logos.html'])fs.copyFileSync(path.join(root,file),path.join(out,file));
for(const dir of ['assets','templates'])fs.cpSync(path.join(root,dir),path.join(out,dir),{recursive:true});
fs.writeFileSync(path.join(out,'.nojekyll'),'');
const required=['index.html','admin.html','team-logos.html','assets/css/admin.css','assets/js/admin.js','assets/js/excel-import.js','assets/vendor/xlsx.full.min.js','assets/vendor/supabase.js','templates/wuri-league-demo-import.xlsx','assets/team-logos/A01-happy-da.svg'];
const missing=required.filter(f=>!fs.existsSync(path.join(out,f)));
if(missing.length){console.error(JSON.stringify({ok:false,missing},null,2));process.exit(1)}
console.log(JSON.stringify({ok:true,output:out,requiredFiles:required.length},null,2));
