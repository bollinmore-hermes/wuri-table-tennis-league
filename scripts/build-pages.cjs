const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const out=path.join(root,'pages-dist');
const publicFiles=['index.html','assets/js/app.js'];
const publicDirectories=['assets/team-logos'];
const forbiddenPaths=[
  'admin.html','assets/js/admin.js','assets/js/excel-import.js','assets/js/config.js',
  'assets/css/admin.css','assets/vendor/xlsx.full.min.js','assets/vendor/supabase.js','templates'
];
const forbiddenContent=[
  [/Mock Login/i,'Mock Login'],[/LEAGUE_SESSION/,'LEAGUE_SESSION'],
  [/wuriLeagueScores/,'localStorage score key'],[/scoreDialog|scoreForm|clearScore/,'score controls'],
  [/\/Users\/[A-Za-z0-9._-]+\//,'local absolute path']
];

fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(out,{recursive:true});
for(const file of publicFiles){
  const source=path.join(root,file);
  if(!fs.statSync(source).isFile())throw new Error(`Missing public source file: ${file}`);
  fs.mkdirSync(path.dirname(path.join(out,file)),{recursive:true});
  fs.copyFileSync(source,path.join(out,file));
}
for(const directory of publicDirectories){
  const source=path.join(root,directory);
  if(!fs.statSync(source).isDirectory())throw new Error(`Missing public source directory: ${directory}`);
  fs.cpSync(source,path.join(out,directory),{recursive:true});
}
fs.writeFileSync(path.join(out,'.nojekyll'),'');

const walk=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  const absolute=path.join(directory,entry.name);
  return entry.isDirectory()?walk(absolute):[absolute];
});
const builtFiles=walk(out).map(file=>path.relative(out,file).split(path.sep).join('/')).sort();
const leakedPaths=forbiddenPaths.filter(item=>builtFiles.some(file=>file===item||file.startsWith(`${item}/`)));
const textFiles=builtFiles.filter(file=>/\.(?:html|js|css|json|svg|txt)$/i.test(file));
const contentLeaks=[];
for(const file of textFiles){
  const content=fs.readFileSync(path.join(out,file),'utf8');
  for(const [pattern,label] of forbiddenContent)if(pattern.test(content))contentLeaks.push(`${file}: ${label}`);
}
const required=['index.html','assets/js/app.js','assets/team-logos/A01-happy-da.svg'];
const missing=required.filter(file=>!builtFiles.includes(file));
if(missing.length||leakedPaths.length||contentLeaks.length){
  console.error(JSON.stringify({ok:false,missing,leakedPaths,contentLeaks},null,2));
  process.exit(1);
}
console.log(JSON.stringify({ok:true,output:out,files:builtFiles.length,excludedAdminAssets:forbiddenPaths.length},null,2));
