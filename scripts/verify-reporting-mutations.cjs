'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.private','mutation-'+randomUUID());fs.mkdirSync(base,{recursive:true});
const cases=[
{name:'block uncertain resubmission',file:'assets/js/reporting-core.js',old:'if(this.blocked)throw',changed:'if(false)throw'},
{name:'never auto-select conflicting reports',file:'assets/js/reporting-core.js',old:'reports.length===1',changed:'reports.length>0'},
{name:'match/request receipt binding',file:'assets/js/reporting-core.js',old:'if(!receipt||receipt.match_code!==this.payload.match_code||receipt.request_id!==this.requestId)',changed:'if(false)'},
{name:'manual score edits change adopted source',file:'assets/js/result-review.js',old:"d[key]=s.value;d.source='custom';",changed:'d[key]=s.value;d.source=d.source;'}
];const results=[];
for(const [i,c]of cases.entries()){
 const dir=path.join(base,String(i));for(const file of ['assets/js/reporting-core.js','assets/js/result-review.js','tests/daily-reporting.test.cjs','tests/result-review-ui.test.cjs','supabase/migrations/014_daily_score_reporting.sql']){const dest=path.join(dir,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,file),dest)}
 const target=path.join(dir,c.file),source=fs.readFileSync(target,'utf8');if(!source.includes(c.old))throw Error('Mutation target absent: '+c.name);fs.writeFileSync(target,source.replace(c.old,c.changed));
 const run=spawnSync(process.execPath,['--test','--test-reporter=tap','tests/daily-reporting.test.cjs','tests/result-review-ui.test.cjs'],{cwd:dir,encoding:'utf8',env:{...process.env,NODE_PATH:path.join(root,'node_modules')}});if(run.status===0||!/not ok/.test(run.stdout))throw Error('Regression failed to detect: '+c.name);results.push({mutation:c.name,detected:true,exitCode:run.status});
}
const clean=spawnSync(process.execPath,['--test','--test-reporter=tap','tests/daily-reporting.test.cjs','tests/result-review-ui.test.cjs'],{cwd:root,encoding:'utf8'});if(clean.status!==0)throw Error('Unmutated focused suite failed');
const evidence={ok:true,isolatedMutations:true,productionSourcesUntouched:true,cases:results,cleanSuitePass:true};fs.mkdirSync(path.join(root,'docs/evidence/issue-53'),{recursive:true});fs.writeFileSync(path.join(root,'docs/evidence/issue-53/mutations.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
