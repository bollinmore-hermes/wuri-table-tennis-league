(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.LeagueExcel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const specs={
    Teams:['team_code','name','short_name','group','active'],
    Schedule:['match_code','group','date','time','home_team_code','away_team_code','venue','status'],
    Results:['match_code','home_score','away_score','status','note'],
    StandingsSnapshot:['group','snapshot_date','team_code','points','wins','losses','rank','rank_change']
  };
  const keyMap={Teams:'teams',Schedule:'matches',Results:'results',StandingsSnapshot:'snapshots'};
  const officialTeams={
    '快樂Da桌球':{team_code:'A01',short_name:'快樂Da',group:'A'},'夢幻羽翼':{team_code:'A02',short_name:'夢幻羽翼',group:'A'},
    '好球隊':{team_code:'A03',short_name:'好球隊',group:'A'},'小三美日':{team_code:'A04',short_name:'小三美日',group:'A'},
    '叔叔沒練球':{team_code:'A05',short_name:'叔叔',group:'A'},'陽光男孩':{team_code:'A06',short_name:'陽光男孩',group:'A'},
    '我們這一隊':{team_code:'B01',short_name:'我們這隊',group:'B'},'劉家昌':{team_code:'B02',short_name:'劉家昌',group:'B'},
    '烏日少年':{team_code:'B03',short_name:'烏日少年',group:'B'},'海納百川':{team_code:'B04',short_name:'海納百川',group:'B'},
    '南門金龍':{team_code:'B05',short_name:'南門金龍',group:'B'},'富士山':{team_code:'B06',short_name:'富士山',group:'B'}
  };
  const str=v=>v==null?'':String(v).trim();
  const integer=v=>{if(v===''||v==null)return null;const n=Number(v);return Number.isInteger(n)?n:NaN};
  function isoDate(v){
    if(v instanceof Date&&!Number.isNaN(v.valueOf()))return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
    const s=str(v);let m=s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);if(m)return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
    m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);if(m){const y=m[3].length===2?`20${m[3]}`:m[3];return `${y}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`}
    return s;
  }
  function bool(v){if(typeof v==='boolean')return v;return ['true','1','yes','y','是'].includes(str(v).toLowerCase())}
  function sheetRows(XLSX,wb,name){const ws=wb.Sheets[name];if(!ws)throw new Error(`缺少工作表：${name}`);const matrix=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true});if(!matrix.length)throw new Error(`${name} 沒有資料`);const headers=matrix[0].map(str);const missing=specs[name].filter(h=>!headers.includes(h));if(missing.length)throw new Error(`${name} 缺少欄位：${missing.join('、')}`);return matrix.slice(1).filter(row=>row.some(v=>str(v)!=='')).map((row,idx)=>{const item={_row:idx+2};headers.forEach((h,i)=>{if(h)item[h]=row[i]});return item})}
  function normalize(raw){return {
    teams:(raw.teams||[]).map(r=>({_row:r._row,team_code:str(r.team_code),name:str(r.name),short_name:str(r.short_name)||str(r.name),group:str(r.group).toUpperCase(),active:bool(r.active)})),
    matches:(raw.matches||[]).map(r=>({_row:r._row,match_code:str(r.match_code),group:str(r.group).toUpperCase(),date:isoDate(r.date),time:str(r.time),home_team_code:str(r.home_team_code),away_team_code:str(r.away_team_code),venue:str(r.venue),status:str(r.status)||'scheduled'})),
    results:(raw.results||[]).map(r=>({_row:r._row,match_code:str(r.match_code),home_score:integer(r.home_score),away_score:integer(r.away_score),status:str(r.status)||'final',note:str(r.note)})),
    snapshots:(raw.snapshots||[]).map(r=>({_row:r._row,group:str(r.group).toUpperCase(),snapshot_date:isoDate(r.snapshot_date),team_code:str(r.team_code),points:integer(r.points),wins:integer(r.wins),losses:integer(r.losses),rank:integer(r.rank),rank_change:integer(r.rank_change)}))
  }}
  function validScore(h,a){return Number.isInteger(h)&&Number.isInteger(a)&&((h===3&&a===0)||(h===0&&a===3)||(h===2&&a===1)||(h===1&&a===2))}
  function parseScore(v){const m=str(v).replace(/[：–—]/g,'-').match(/^(\d)\s*-\s*(\d)$/);return m?[Number(m[1]),Number(m[2])]:null}
  function splitPair(v){const parts=str(v).split(/\s*(?:vs|VS|ｖｓ|對)\s*/);return parts.length===2?parts.map(str):null}
  function matrix(XLSX,wb,name){const ws=wb.Sheets[name];if(!ws)throw new Error(`缺少工作表：${name}`);return XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true})}
  function officialSchedule(XLSX,wb,sheet,group){
    const rows=matrix(XLSX,wb,sheet),dateRow=rows.findIndex(r=>r.filter(v=>/^\d{4}-\d{2}-\d{2}$/.test(isoDate(v))).length>=2);
    if(dateRow<0)throw new Error(`${sheet} 找不到比賽日期列`);
    const dates=rows[dateRow].map(isoDate),matches=[],results=[];
    dates.forEach((date,col)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;let sequence=0;
      for(let r=dateRow+1;r<Math.min(rows.length,dateRow+14);r++){
        const pair=splitPair(rows[r]?.[col]);if(!pair)continue;sequence++;
        const [home,away]=pair,ht=officialTeams[home],at=officialTeams[away];if(!ht||!at)throw new Error(`${sheet} 第 ${r+1} 列有未知球隊：${home}／${away}`);if(ht.group!==group||at.group!==group)throw new Error(`${sheet} 第 ${r+1} 列的球隊組別不符`);
        const match_code=`${group}-${date}-${sequence}`,time=sequence<=2?'15:30':sequence<=4?'16:00':'16:30';
        matches.push({_row:r+1,match_code,group,date,time,home_team_code:ht.team_code,away_team_code:at.team_code,venue:'',status:'scheduled'});
        const rawScore=rows[r+1]?.[col],score=parseScore(rawScore);if(score){results.push({_row:r+2,match_code,home_score:score[0],away_score:score[1],status:'final',note:'正式成績表匯入'})}
        else if(str(rawScore)&&!['-',':','：'].includes(str(rawScore)))throw new Error(`${sheet} 第 ${r+2} 列有無法辨識的比分：${str(rawScore)}`);
      }
    });
    return {matches,results};
  }
  function cleanTeamName(v){return str(v).replace(/[↑↓]\s*\d+\s*$/,'').trim()}
  function trend(v){const m=str(v).match(/([↑↓])\s*(\d+)\s*$/);return m?(m[1]==='↑'?1:-1)*Number(m[2]):0}
  function officialSnapshots(XLSX,wb){
    const rows=matrix(XLSX,wb,'即時排名'),out=[];
    for(const group of ['A','B']){
      let titleRow=-1,titleCol=-1;for(let r=0;r<rows.length;r++){const c=rows[r].findIndex(v=>str(v)===`${group}組即時排名`);if(c>=0){titleRow=r;titleCol=c}}
      if(titleRow<0)throw new Error(`即時排名找不到 ${group} 組區塊`);
      const header=rows[titleRow+1]||[],snapshot_date=isoDate(header[titleCol+1]);if(!/^\d{4}-\d{2}-\d{2}$/.test(snapshot_date))throw new Error(`即時排名 ${group} 組日期無效`);
      for(let i=1;i<=6;i++){const row=rows[titleRow+1+i]||[],rank=integer(row[titleCol]),rawName=str(row[titleCol+1]),name=cleanTeamName(rawName),team=officialTeams[name],points=integer(row[titleCol+2]),record=str(row[titleCol+3]).match(/^(\d+)-(\d+)$/);if(!team||team.group!==group)throw new Error(`即時排名第 ${titleRow+i+2} 列有未知球隊：${name}`);if(!record)throw new Error(`即時排名第 ${titleRow+i+2} 列勝敗格式無效`);out.push({_row:titleRow+i+2,group,snapshot_date,team_code:team.team_code,points,wins:Number(record[1]),losses:Number(record[2]),rank,rank_change:trend(rawName)})}
    }
    return out;
  }
  function officialWorkbookToPayload(XLSX,wb){
    const teams=Object.entries(officialTeams).map(([name,t],i)=>({_row:i+1,team_code:t.team_code,name,short_name:t.short_name,group:t.group,active:true}));
    const a=officialSchedule(XLSX,wb,'A組成績','A'),b=officialSchedule(XLSX,wb,'B組成績','B');
    return {teams,matches:[...a.matches,...b.matches],results:[...a.results,...b.results],snapshots:officialSnapshots(XLSX,wb)};
  }
  function workbookToPayload(XLSX,wb){const names=new Set(wb.SheetNames||[]);if(['A組成績','B組成績','即時排名'].every(n=>names.has(n)))return officialWorkbookToPayload(XLSX,wb);const raw={};Object.keys(specs).forEach(name=>raw[keyMap[name]]=sheetRows(XLSX,wb,name));return normalize(raw)}
  function calculateStandings(payload){const byCode=new Map(payload.teams.map(t=>[t.team_code,t])),stats={A:new Map(),B:new Map()};payload.teams.forEach(t=>stats[t.group]?.set(t.team_code,{team_code:t.team_code,points:0,wins:0,losses:0}));const matchByCode=new Map(payload.matches.map(m=>[m.match_code,m]));payload.results.forEach(r=>{if(!validScore(r.home_score,r.away_score))return;const m=matchByCode.get(r.match_code);if(!m)return;const h=stats[m.group]?.get(m.home_team_code),a=stats[m.group]?.get(m.away_team_code);if(!h||!a)return;const homeWon=r.home_score>r.away_score,winner=homeWon?h:a,loser=homeWon?a:h;winner.wins++;loser.losses++;if(Math.max(r.home_score,r.away_score)===3){winner.points+=3}else{winner.points+=2;loser.points+=1}});for(const group of ['A','B']){const sorted=[...stats[group].values()].sort((a,b)=>b.points-a.points||b.wins-a.wins||(b.wins/(b.wins+b.losses||1))-(a.wins/(a.wins+a.losses||1))||a.team_code.localeCompare(b.team_code));sorted.forEach((x,i)=>x.rank=i+1);stats[group]=sorted}return stats}
  function validate(payload,current={teams:[],matches:[]}){const errors=[],warnings=[];const err=(sheet,row,message)=>errors.push({sheet,row,message});
    const allTeams=[...(current.teams||[]),...payload.teams],codes=new Set(),names=new Set();
    payload.teams.forEach(t=>{if(!t.team_code)err('Teams',t._row,'team_code 不可空白');if(!t.name)err('Teams',t._row,'name 不可空白');if(!['A','B'].includes(t.group))err('Teams',t._row,'group 必須是 A 或 B');if(codes.has(t.team_code))err('Teams',t._row,`team_code 重複：${t.team_code}`);if(names.has(t.name))err('Teams',t._row,`球隊名稱重複：${t.name}`);codes.add(t.team_code);names.add(t.name)});
    const knownTeams=new Set(allTeams.map(t=>t.team_code)),matchCodes=new Set(),pairKeys=new Set(),allMatches=[...(current.matches||[]),...payload.matches];
    payload.matches.forEach(m=>{if(!m.match_code)err('Schedule',m._row,'match_code 不可空白');if(matchCodes.has(m.match_code))err('Schedule',m._row,`match_code 重複：${m.match_code}`);matchCodes.add(m.match_code);if(!['A','B'].includes(m.group))err('Schedule',m._row,'group 必須是 A 或 B');if(!/^\d{4}-\d{2}-\d{2}$/.test(m.date))err('Schedule',m._row,'date 必須是 YYYY-MM-DD');if(!/^\d{1,2}:\d{2}$/.test(m.time))err('Schedule',m._row,'time 必須是 HH:MM');if(!knownTeams.has(m.home_team_code))err('Schedule',m._row,`找不到主隊：${m.home_team_code}`);if(!knownTeams.has(m.away_team_code))err('Schedule',m._row,`找不到客隊：${m.away_team_code}`);if(m.home_team_code===m.away_team_code)err('Schedule',m._row,'主客隊不可相同');const pk=`${m.date}|${m.home_team_code}|${m.away_team_code}`;if(pairKeys.has(pk))err('Schedule',m._row,'同日對戰重複');pairKeys.add(pk)});
    const knownMatches=new Set(allMatches.map(m=>m.match_code));payload.results.forEach(r=>{if(!knownMatches.has(r.match_code))err('Results',r._row,`找不到賽事：${r.match_code}`);if(!validScore(r.home_score,r.away_score))err('Results',r._row,'比分必須是 3–0、0–3、2–1 或 1–2')});
    payload.snapshots.forEach(s=>{if(!knownTeams.has(s.team_code))err('StandingsSnapshot',s._row,`找不到球隊：${s.team_code}`);if(!['A','B'].includes(s.group))err('StandingsSnapshot',s._row,'group 必須是 A 或 B');if(!/^\d{4}-\d{2}-\d{2}$/.test(s.snapshot_date))err('StandingsSnapshot',s._row,'snapshot_date 必須是 YYYY-MM-DD');for(const f of ['points','wins','losses','rank'])if(!Number.isInteger(s[f])||s[f]<0)err('StandingsSnapshot',s._row,`${f} 必須是非負整數`) });
    if(payload.snapshots.length&&payload.results.length){const calculated=calculateStandings(payload),matchByCode=new Map(payload.matches.map(m=>[m.match_code,m]));for(const group of ['A','B']){const rows=payload.snapshots.filter(s=>s.group===group),cutoff=rows.map(s=>s.snapshot_date).sort().at(-1),latest=rows.filter(s=>s.snapshot_date===cutoff),covered=payload.results.filter(r=>matchByCode.get(r.match_code)?.group===group&&matchByCode.get(r.match_code)?.date<=cutoff);if(latest.length===6&&covered.length===latest.reduce((n,s)=>n+s.wins,0)){for(const s of latest){const row=calculated[group]?.find(x=>x.team_code===s.team_code);if(row&&(row.points!==s.points||row.wins!==s.wins||row.losses!==s.losses||row.rank!==s.rank))err('StandingsSnapshot',s._row,`與逐場賽果不一致：計算為第 ${row.rank} 名、${row.points} 分、${row.wins}-${row.losses}`)}}}}
    if(payload.results.some(r=>r.note.includes('示範資料')))warnings.push('Results 包含明確標示的示範賽果，匯入後不可視為官方紀錄。');
    return {valid:errors.length===0,errors,warnings};
  }
  function diff(payload,current={}){const defs=[['teams','team_code'],['matches','match_code'],['results','match_code'],['snapshots',x=>`${x.group}|${x.snapshot_date}|${x.team_code}`]];const out={};for(const [name,key] of defs){const fn=typeof key==='function'?key:x=>x[key];const old=new Map((current[name]||[]).map(x=>[fn(x),x]));let added=0,updated=0;for(const row of payload[name])old.has(fn(row))?updated++:added++;out[name]={total:payload[name].length,added,updated}}return out}
  function clean(payload){return Object.fromEntries(Object.entries(payload).map(([k,rows])=>[k,rows.map(({_row,...r})=>r)]))}
  function merge(current,payload){const defs=[['teams','team_code'],['matches','match_code'],['results','match_code'],['snapshots',x=>`${x.group}|${x.snapshot_date}|${x.team_code}`]],out={...current};for(const [name,key] of defs){const fn=typeof key==='function'?key:x=>x[key],map=new Map((current[name]||[]).map(x=>[fn(x),x]));for(const row of clean(payload)[name])map.set(fn(row),{...(map.get(fn(row))||{}),...row});out[name]=[...map.values()]}return out}
  return {specs,officialTeams,workbookToPayload,normalize,validate,validScore,calculateStandings,diff,clean,merge};
});
