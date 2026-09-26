(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.WuriLeagueRepository=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
  const GROUP=/^[AB]$/;
  const DATE=/^\d{4}-\d{2}-\d{2}$/;
  const TIME=/^\d{2}:\d{2}(?::\d{2})?$/;
  const STATUS=new Set(['scheduled','postponed','cancelled','final']);
  const dateIsValid=value=>{if(!DATE.test(value))return false;const date=new Date(`${value}T00:00:00Z`);return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value};
  const timeIsValid=value=>TIME.test(value)&&value.split(':').every((part,index)=>Number(part)<(index?60:24));
  const scoreIsValid=(home,away)=>Number.isSafeInteger(home)&&Number.isSafeInteger(away)&&((home===3&&away===0)||(home===0&&away===3)||(home===2&&away===1)||(home===1&&away===2));
  const integerInRange=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
  const text=(value,max,label)=>{if(typeof value!=='string'||value.length>max||/[\u0000-\u001f\u007f]/.test(value))throw new Error(`Invalid ${label}`);return value};
  const requiredText=(value,max,label)=>{const out=text(value,max,label);if(!out.trim())throw new Error(`Invalid ${label}`);return out};
  const freezeRows=rows=>Object.freeze(rows.map(row=>Object.freeze(row)));
  function normalizeDataset(payload){
    if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('Invalid public league response');
    for(const key of ['teams','matches','results'])if(!Array.isArray(payload[key]))throw new Error(`Invalid public league ${key}`);
    if(payload.teams.length>100||payload.matches.length>500||payload.results.length>500)throw new Error('Public league response exceeds limits');
    const teamCodes=new Set();
    const teams=payload.teams.map(row=>{
      if(!row||!IDENTIFIER.test(row.team_code||'')||!GROUP.test(row.group||'')||!integerInRange(row.display_order,0,100))throw new Error('Invalid public team');
      if(teamCodes.has(row.team_code))throw new Error(`Duplicate public team_code: ${row.team_code}`);
      teamCodes.add(row.team_code);
      return {team_code:row.team_code,name:requiredText(row.name,100,'team name'),short_name:requiredText(row.short_name||row.name,30,'team short name'),group:row.group,display_order:row.display_order,description:text(row.description||'',1000,'team description'),logo_path:text(row.logo_path||'',300,'logo path'),active:row.active!==false};
    });
    const names=new Map(teams.map(team=>[team.team_code,team.name]));
    const groups=new Map(teams.map(team=>[team.team_code,team.group]));
    const matchCodes=new Set();
    const matches=payload.matches.map(row=>{
      if(!row||!IDENTIFIER.test(row.match_code||'')||!GROUP.test(row.group||'')||!dateIsValid(row.date||'')||!timeIsValid(row.time||'')||!STATUS.has(row.status||'scheduled'))throw new Error('Invalid public match');
      if(matchCodes.has(row.match_code))throw new Error(`Duplicate public match_code: ${row.match_code}`);
      if(!names.has(row.home_team_code)||!names.has(row.away_team_code))throw new Error(`Invalid public match team reference: ${row.match_code}`);
      if(row.home_team_code===row.away_team_code)throw new Error(`Public match teams must differ: ${row.match_code}`);
      if(groups.get(row.home_team_code)!==row.group||groups.get(row.away_team_code)!==row.group)throw new Error(`Public match group mismatch: ${row.match_code}`);
      matchCodes.add(row.match_code);
      return {match_code:row.match_code,id:row.match_code,group:row.group,date:row.date,time:row.time.slice(0,5),home_team_code:row.home_team_code,away_team_code:row.away_team_code,home:names.get(row.home_team_code),away:names.get(row.away_team_code),venue:text(row.venue||'',200,'venue'),status:text(row.status||'scheduled',20,'match status'),published:true};
    });
    const resultCodes=new Set();
    const results=payload.results.map(row=>{
      if(!row||!matchCodes.has(row.match_code)||!scoreIsValid(row.home_score,row.away_score))throw new Error('Invalid public result');
      if(resultCodes.has(row.match_code))throw new Error(`Duplicate public result match_code: ${row.match_code}`);
      resultCodes.add(row.match_code);
      return {match_code:row.match_code,home_score:row.home_score,away_score:row.away_score,status:'final',published:true};
    });
    for(const match of matches)if(resultCodes.has(match.match_code)!==(match.status==='final'))throw new Error(`Public match/result status mismatch: ${match.match_code}`);
    if(payload.snapshots!==undefined&&!Array.isArray(payload.snapshots))throw new Error('Invalid public league snapshots');
    if((payload.snapshots||[]).length>500)throw new Error('Public league response exceeds limits');
    const snapshotKeys=new Set();
    const snapshots=(payload.snapshots||[]).map(row=>{
      if(!row||!GROUP.test(row.group||'')||!dateIsValid(row.snapshot_date||'')||!names.has(row.team_code)||!integerInRange(row.points,0,10000)||!integerInRange(row.wins,0,1000)||!integerInRange(row.losses,0,1000)||!integerInRange(row.rank,1,100)||!integerInRange(row.rank_change,-100,100))throw new Error('Invalid public snapshot');
      if(groups.get(row.team_code)!==row.group)throw new Error(`Public snapshot group mismatch: ${row.team_code}`);
      const key=`${row.group}\u0000${row.snapshot_date}\u0000${row.team_code}`;
      if(snapshotKeys.has(key))throw new Error(`Duplicate public snapshot: ${row.group}/${row.snapshot_date}/${row.team_code}`);
      snapshotKeys.add(key);
      return Object.freeze({group:row.group,snapshot_date:row.snapshot_date,team_code:row.team_code,points:row.points,wins:row.wins,losses:row.losses,rank:row.rank,rank_change:row.rank_change});
    });
    return Object.freeze({season:payload.season?Object.freeze({...payload.season}):null,teams:freezeRows(teams),matches:freezeRows(matches),results:freezeRows(results),snapshots:Object.freeze(snapshots)});
  }
  class StaticLeagueRepository{
    constructor(dataset){this.dataset=normalizeDataset(dataset)}
    async getPublicLeague(){return this.dataset}
    getPublicLeagueSync(){return this.dataset}
  }
  class SupabaseLeagueRepository{
    constructor({url,publishableKey,seasonCode,client,createClient}={}){
      if(typeof seasonCode!=='string'||!seasonCode.trim())throw new Error('Missing season code');
      if(!client){
        if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url||''))throw new Error('Invalid Supabase URL');
        if(typeof publishableKey!=='string'||publishableKey.length<20)throw new Error('Invalid Supabase publishable key');
        if(typeof createClient!=='function')throw new Error('Supabase client unavailable');
        client=createClient(url,publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
      }
      if(!client||typeof client.rpc!=='function')throw new Error('Invalid Supabase client');
      this.client=client;this.seasonCode=seasonCode;
    }
    async getPublicLeague(){
      const {data,error}=await this.client.rpc('get_public_league',{p_season_code:this.seasonCode});
      if(error)throw new Error('Public league data unavailable');
      return normalizeDataset(data);
    }
  }
  function createConfiguredRepository(config,officialData,supabaseGlobal){
    if(config&&config.mode==='supabase')return new SupabaseLeagueRepository({url:config.supabaseUrl,publishableKey:config.supabasePublishableKey||config.supabaseAnonKey,seasonCode:config.seasonCode,createClient:supabaseGlobal&&supabaseGlobal.createClient});
    if(config&&config.mode!=='static')throw new Error('League data source is disabled');
    return new StaticLeagueRepository(officialData);
  }
  return Object.freeze({StaticLeagueRepository,SupabaseLeagueRepository,createConfiguredRepository,normalizeDataset,scoreIsValid});
});
