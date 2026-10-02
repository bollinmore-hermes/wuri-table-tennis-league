'use strict';
const fs=require('node:fs');
const path=require('node:path');
const official=require('../assets/js/official-data.js');
function prepare(source){
  if(!source||source.season_code!==official.season.code||!Array.isArray(source.teams)||source.teams.length!==official.teams.length)throw new Error('Expected the complete current-season roster');
  const seen=new Set(),known=new Set(official.teams.map(team=>team.team_code));
  const name=value=>{if(typeof value!=='string'||value!==value.trim()||Array.from(value).length<3||Array.from(value).length>100||/[\u0000-\u001f\u007f＊]/u.test(value))throw new Error('Invalid name or short-name privacy policy required');return value};
  return source.teams.map(team=>{
    if(!known.has(team.team_code)||seen.has(team.team_code)||!Array.isArray(team.players)||team.players.length>100)throw new Error('Invalid or duplicate team roster');
    seen.add(team.team_code);
    return {team_code:team.team_code,members:[{name:name(team.leader),roster_role:'leader',display_order:0},...team.players.map((value,index)=>({name:name(value),roster_role:'player',display_order:index}))]};
  });
}
function mask(value){const chars=Array.from(value.trim());return chars.length<3?'＊':chars[0]+'＊'.repeat(chars.length-2)+chars.at(-1)}
function publicProjection(payload){return payload.flatMap(team=>team.members.map(member=>({team_code:team.team_code,display_name:mask(member.name),roster_role:member.roster_role,display_order:member.display_order})));}
if(require.main===module){
  const input=process.argv[2];if(!input)throw new Error('Usage: node scripts/prepare-private-rosters.cjs <private-json> [private-output-json]');
  const source=JSON.parse(fs.readFileSync(input,'utf8')),payload=prepare(source),output=process.argv[3];
  if(output){const resolved=path.resolve(output),privateRoot=path.resolve(__dirname,'../.private')+path.sep;if(!resolved.startsWith(privateRoot))throw new Error('Output must remain in .private/');fs.writeFileSync(resolved,JSON.stringify({p_season_code:source.season_code,p_rosters:payload}),{mode:0o600});}
  console.log(JSON.stringify({ok:true,teams:payload.length,leaders:payload.length,players:payload.reduce((n,team)=>n+team.members.length-1,0),remoteWrites:false}));
}
module.exports={prepare,mask,publicProjection};
