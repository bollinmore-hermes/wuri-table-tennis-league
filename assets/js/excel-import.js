(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.LeagueExcel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const specs={
    Teams:['team_code','name','short_name','group','active'],
    Schedule:['match_code','group','date','time','home_team_code','away_team_code','venue','status'],
    Results:['match_code','home_score','away_score','status','note'],
    StandingsSnapshot:['group','snapshot_date','team_code','points','wins','losses','rank','rank_change']
  };
  const keyMap={Teams:'teams',Schedule:'matches',Results:'results',StandingsSnapshot:'snapshots'};
  const str=v=>v==null?'':String(v).trim();
  const integer=v=>{if(v===''||v==null)return null;const n=Number(v);return Number.isInteger(n)?n:NaN};
  function isoDate(v){if(v instanceof Date&&!Number.isNaN(v.valueOf()))return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;const s=str(v);if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;if(/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s)){const [y,m,d]=s.split('/');return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`}return s}
  function bool(v){if(typeof v==='boolean')return v;return ['true','1','yes','y','是'].includes(str(v).toLowerCase())}
  function sheetRows(XLSX,wb,name){const ws=wb.Sheets[name];if(!ws)throw new Error(`缺少工作表：${name}`);const matrix=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true});if(!matrix.length)throw new Error(`${name} 沒有資料`);const headers=matrix[0].map(str);const missing=specs[name].filter(h=>!headers.includes(h));if(missing.length)throw new Error(`${name} 缺少欄位：${missing.join('、')}`);return matrix.slice(1).filter(row=>row.some(v=>str(v)!=='')).map((row,idx)=>{const item={_row:idx+2};headers.forEach((h,i)=>{if(h)item[h]=row[i]});return item})}
  function workbookToPayload(XLSX,wb){const raw={};Object.keys(specs).forEach(name=>raw[keyMap[name]]=sheetRows(XLSX,wb,name));return normalize(raw)}
  function normalize(raw){return {
    teams:(raw.teams||[]).map(r=>({_row:r._row,team_code:str(r.team_code),name:str(r.name),short_name:str(r.short_name)||str(r.name),group:str(r.group).toUpperCase(),active:bool(r.active)})),
    matches:(raw.matches||[]).map(r=>({_row:r._row,match_code:str(r.match_code),group:str(r.group).toUpperCase(),date:isoDate(r.date),time:str(r.time),home_team_code:str(r.home_team_code),away_team_code:str(r.away_team_code),venue:str(r.venue),status:str(r.status)||'scheduled'})),
    results:(raw.results||[]).map(r=>({_row:r._row,match_code:str(r.match_code),home_score:integer(r.home_score),away_score:integer(r.away_score),status:str(r.status)||'final',note:str(r.note)})),
    snapshots:(raw.snapshots||[]).map(r=>({_row:r._row,group:str(r.group).toUpperCase(),snapshot_date:isoDate(r.snapshot_date),team_code:str(r.team_code),points:integer(r.points),wins:integer(r.wins),losses:integer(r.losses),rank:integer(r.rank),rank_change:integer(r.rank_change)}))
  }}
  function validScore(h,a){return Number.isInteger(h)&&Number.isInteger(a)&&Math.max(h,a)===3&&Math.min(h,a)>=0&&Math.min(h,a)<=2}
  function validate(payload,current={teams:[],matches:[]}){const errors=[],warnings=[];const err=(sheet,row,message)=>errors.push({sheet,row,message});
    const allTeams=[...(current.teams||[]),...payload.teams],codes=new Set(),names=new Set();
    payload.teams.forEach(t=>{if(!t.team_code)err('Teams',t._row,'team_code 不可空白');if(!t.name)err('Teams',t._row,'name 不可空白');if(!['A','B'].includes(t.group))err('Teams',t._row,'group 必須是 A 或 B');if(codes.has(t.team_code))err('Teams',t._row,`team_code 重複：${t.team_code}`);if(names.has(t.name))err('Teams',t._row,`球隊名稱重複：${t.name}`);codes.add(t.team_code);names.add(t.name)});
    const knownTeams=new Set(allTeams.map(t=>t.team_code)),matchCodes=new Set(),allMatches=[...(current.matches||[]),...payload.matches];
    payload.matches.forEach(m=>{if(!m.match_code)err('Schedule',m._row,'match_code 不可空白');if(matchCodes.has(m.match_code))err('Schedule',m._row,`match_code 重複：${m.match_code}`);matchCodes.add(m.match_code);if(!['A','B'].includes(m.group))err('Schedule',m._row,'group 必須是 A 或 B');if(!/^\d{4}-\d{2}-\d{2}$/.test(m.date))err('Schedule',m._row,'date 必須是 YYYY-MM-DD');if(!/^\d{1,2}:\d{2}$/.test(m.time))err('Schedule',m._row,'time 必須是 HH:MM');if(!knownTeams.has(m.home_team_code))err('Schedule',m._row,`找不到主隊：${m.home_team_code}`);if(!knownTeams.has(m.away_team_code))err('Schedule',m._row,`找不到客隊：${m.away_team_code}`);if(m.home_team_code===m.away_team_code)err('Schedule',m._row,'主客隊不可相同')});
    const knownMatches=new Set(allMatches.map(m=>m.match_code));payload.results.forEach(r=>{if(!knownMatches.has(r.match_code))err('Results',r._row,`找不到賽事：${r.match_code}`);if(!validScore(r.home_score,r.away_score))err('Results',r._row,'比分必須是 3–0、3–1、3–2 或主客對調')});
    payload.snapshots.forEach(s=>{if(!knownTeams.has(s.team_code))err('StandingsSnapshot',s._row,`找不到球隊：${s.team_code}`);if(!['A','B'].includes(s.group))err('StandingsSnapshot',s._row,'group 必須是 A 或 B');if(!/^\d{4}-\d{2}-\d{2}$/.test(s.snapshot_date))err('StandingsSnapshot',s._row,'snapshot_date 必須是 YYYY-MM-DD');for(const f of ['points','wins','losses','rank'])if(!Number.isInteger(s[f])||s[f]<0)err('StandingsSnapshot',s._row,`${f} 必須是非負整數`) });
    if(payload.results.some(r=>r.note.includes('示範資料')))warnings.push('Results 包含明確標示的示範賽果，匯入後不可視為官方紀錄。');
    return {valid:errors.length===0,errors,warnings};
  }
  function diff(payload,current={}){const defs=[['teams','team_code'],['matches','match_code'],['results','match_code'],['snapshots',x=>`${x.group}|${x.snapshot_date}|${x.team_code}`]];const out={};for(const [name,key] of defs){const fn=typeof key==='function'?key:x=>x[key];const old=new Map((current[name]||[]).map(x=>[fn(x),x]));let added=0,updated=0;for(const row of payload[name])old.has(fn(row))?updated++:added++;out[name]={total:payload[name].length,added,updated}}return out}
  function clean(payload){return Object.fromEntries(Object.entries(payload).map(([k,rows])=>[k,rows.map(({_row,...r})=>r)]))}
  function merge(current,payload){const defs=[['teams','team_code'],['matches','match_code'],['results','match_code'],['snapshots',x=>`${x.group}|${x.snapshot_date}|${x.team_code}`]],out={...current};for(const [name,key] of defs){const fn=typeof key==='function'?key:x=>x[key],map=new Map((current[name]||[]).map(x=>[fn(x),x]));for(const row of clean(payload)[name])map.set(fn(row),{...(map.get(fn(row))||{}),...row});out[name]=[...map.values()]}return out}
  return {specs,workbookToPayload,normalize,validate,validScore,diff,clean,merge};
});
