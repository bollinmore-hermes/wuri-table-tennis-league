const fs=require('node:fs'),path=require('node:path');
const publicFiles=['archives.html','assets/css/season-archives.css','assets/js/season-archive-domain.js','assets/js/season-archive-view.js','assets/js/season-archives.js'];
const adminFiles=['season-archive-admin.html','assets/css/season-archives.css','assets/js/league-repository.js','assets/js/season-archive-domain.js','assets/js/season-archive-view.js','assets/js/season-archive-admin.js'];
function copy(root,out,files){for(const file of files){const target=path.join(out,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target)}}
function publicArchive(root,out,{configured=true}={}){copy(root,out,publicFiles);if(!configured){const file=path.join(out,'archives.html');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('<script src="assets/js/config.js"></script>',''))}}
function adminArchive(root,out){copy(root,out,adminFiles)}
module.exports={publicArchive,adminArchive,publicFiles,adminFiles};
