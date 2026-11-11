// Explicitly Test-only fixture creation. Contains no credentials or copied user data.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),{randomBytes}=require('node:crypto');
if(process.argv[2]!=='--test-only'||!process.argv[3]||!path.isAbsolute(process.argv[3])||!process.env.TMPDIR)throw Error('Use --test-only <absolute-manifest-path> with approved TMPDIR');
if(fs.existsSync(process.argv[3]))throw Error('Fixture manifest already exists; verify existing fixtures instead of recreating');
const suffix=randomBytes(4).toString('hex'),definitions=[['api','封存 API 驗證（合成資料，非正式成績）'],['acceptance','封存操作驗收（合成資料，非正式成績）']];
const fixtures=definitions.map(([kind,name])=>({kind,name,seasonCode:`issue-37-${kind}-${suffix}`,teams:[`I37-${suffix}-${kind==='api'?'P':'H'}A`,`I37-${suffix}-${kind==='api'?'P':'H'}B`],matchCode:`I37-${suffix}-${kind}`}));
let sql='begin;\n';for(const f of fixtures){sql+=`do $$ declare sid uuid;gid uuid;mid uuid;begin
insert into public.seasons(code,name,status,start_date,end_date) values('${f.seasonCode}','${f.name}','active','2026-01-01','2026-01-01') returning id into sid;
insert into public.groups(season_id,code,name) values(sid,'A','A 組') returning id into gid;
insert into public.teams(team_code,name,short_name) values('${f.teams[0]}','合成驗收隊 A','合成 A'),('${f.teams[1]}','合成驗收隊 B','合成 B');
insert into public.season_teams(season_id,team_id,group_id,display_name,display_order) select sid,id,gid,name,row_number() over(order by team_code) from public.teams where team_code in ('${f.teams[0]}','${f.teams[1]}');
insert into public.matches(season_id,group_id,match_code,match_date,match_time,home_team_id,away_team_id,status,published) select sid,gid,'${f.matchCode}','2026-01-01','10:00',h.id,a.id,'final',true from public.teams h,public.teams a where h.team_code='${f.teams[0]}' and a.team_code='${f.teams[1]}' returning id into mid;
insert into public.match_results(match_id,home_score,away_score,published) values(mid,3,0,true);
end $$;\n`;}sql+='commit;\n';
const filename=path.join(process.env.TMPDIR,'issue37-fixtures-'+suffix+'.sql');fs.writeFileSync(filename,sql);
execFileSync('npx',['supabase','db','query','--linked','--project-ref','vppjcjfbcoxzofcuxmzz','--file',filename],{stdio:'pipe'});
fs.writeFileSync(process.argv[3],JSON.stringify(fixtures,null,2));console.log(JSON.stringify(fixtures,null,2));
