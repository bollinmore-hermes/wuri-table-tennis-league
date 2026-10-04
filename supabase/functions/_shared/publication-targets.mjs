export const TARGETS=Object.freeze({
 test:{projectRef:'vppjcjfbcoxzofcuxmzz',repo:'bollinmore-hermes/wuri-table-tennis-league-test',site:'https://bollinmore-hermes.github.io/wuri-table-tennis-league-test/'},
 production:{projectRef:'zofiiibgnjuodgrzhkpn',repo:'bollinmore-hermes/wuri-table-tennis-league',site:'https://bollinmore-hermes.github.io/wuri-table-tennis-league/'}
});
export function verifyManifest(value,environment){
 const target=TARGETS[environment];
 if(!target||value?.schemaVersion!==1||value.environment!==environment||value.projectRef!==target.projectRef||!/^[a-f0-9]{40}$/.test(value.sourceCommit||''))throw new Error('release_unavailable');
 if(environment==='production'&&!/^v\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(value.sourceTag||''))throw new Error('release_unavailable');
 return {sourceCommit:value.sourceCommit,sourceTag:value.sourceTag||null};
}
