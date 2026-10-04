const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const out=path.join(root,'admin-demo-dist');
const files=[
  'admin.html','assets/css/admin-v2.css','assets/js/admin.js','assets/js/publication-ui.js','assets/js/admin-repository.js',
  'assets/js/excel-import.js','assets/js/official-data.js','assets/vendor/xlsx.full.min.js',
  'assets/vendor/supabase.js','templates/wuri-league-demo-import.xlsx'
];
const copy=relative=>{const source=path.join(root,relative),target=path.join(out,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.cpSync(source,target,{recursive:true})};
fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(out,{recursive:true});
for(const file of files)copy(file);
copy('assets/team-logos');
const source=fs.readFileSync(path.join(out,'admin.html'),'utf8').replace('href="index.html"','href="#"');
fs.writeFileSync(path.join(out,'index.html'),source);
fs.unlinkSync(path.join(out,'admin.html'));
fs.writeFileSync(path.join(out,'assets/js/config.js'),`window.LEAGUE_CONFIG = Object.freeze(${JSON.stringify({mode:'local',supabaseUrl:'',supabasePublishableKey:'',seasonCode:'2026-autumn-second-half'},null,2)});\n`);
fs.writeFileSync(path.join(out,'.nojekyll'),'');
const text=fs.readFileSync(path.join(out,'index.html'),'utf8');
for(const required of ['assets/css/admin-v2.css','assets/js/admin-repository.js','assets/js/admin.js'])if(!text.includes(required))throw new Error(`Demo entry is missing ${required}`);
console.log(JSON.stringify({ok:true,output:out,mode:'local',files:files.length+15},null,2));
