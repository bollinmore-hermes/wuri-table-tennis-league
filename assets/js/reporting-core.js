(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.WuriReporting=api})(globalThis,function(){
'use strict';
const valid=(a,b)=>a!==''&&b!==''&&a!=null&&b!=null&&((Number(a)===3&&Number(b)===0)||(Number(a)===0&&Number(b)===3)||(Number(a)===2&&Number(b)===1)||(Number(a)===1&&Number(b)===2));
const reviewLabels=Object.freeze({reported:'核對',missing:'補登',final:'完成'});
const reviewState=(result,hasReports)=>result?'final':hasReports?'reported':'missing';
function draft(result,reports){if(result)return {home:String(result.home_score),away:String(result.away_score),source:'custom',note:result.note||'',version:result.version||0};const r=reports.length===1&&valid(reports[0].home_score,reports[0].away_score)?reports[0]:null;return {home:r?String(r.home_score):'',away:r?String(r.away_score):'',source:r?.id||'',note:'',version:0}}
class RequestState{
 constructor(uuid=()=>crypto.randomUUID()){this.uuid=uuid;this.phase='idle';this.payload=null;this.requestId=null;this.receipt=null}
 get blocked(){return this.phase==='sending'||this.phase==='unknown'}
 check(receipt){if(!receipt||receipt.match_code!==this.payload.match_code||receipt.request_id!==this.requestId)throw Error('回應與原場次／請求不符，請查證')}
 async send(payload,write){if(this.blocked)throw Error('前次寫入待查證，不可重送');this.payload=Object.freeze({...payload});this.requestId=this.uuid();this.phase='sending';try{const receipt=await write({...payload,request_id:this.requestId});this.check(receipt);this.receipt=receipt;this.phase='saved';return receipt}catch(error){this.phase=error.mutationState==='rejected'?'rejected':'unknown';throw error}}
 resolve(result){if(this.phase!=='unknown')throw Error('沒有待查證請求');const receipt=result.receipt||result;this.check(receipt);if(result.status==='received'||result.status==='saved'){this.receipt=receipt;this.phase='saved'}else if(result.status==='not_received'||result.status==='not_saved'){this.phase='rejected'}else throw Error('查證尚未完成');return this.phase}
}
function adapter(client,seasonCode){
 async function call(name,args,write=false){try{const {data,error,status}=await client.rpc(name,args);if(error){const e=Error(error.message||'操作失敗');e.mutationState=(status>=400&&status<500&&status!==408)||/^(42501|P0001|40001|23[A-Z0-9]{3})$/.test(error.code||'')?'rejected':'unknown';throw e}return data}catch(e){if(write&&!e.mutationState)e.mutationState='unknown';throw e}}
 return {
 schedule:token=>call('get_daily_report_schedule',{p_token:token}),
 submit:(token,p)=>call('submit_referee_report',{p_token:token,p_match_code:p.match_code,p_request_id:p.request_id,p_home_score:Number(p.home_score),p_away_score:Number(p.away_score)},true),
 reportStatus:(token,s)=>call('get_referee_report_status',{p_token:token,p_match_code:s.payload.match_code,p_request_id:s.requestId}),
 queue:()=>call('get_result_review_queue',{p_season_code:seasonCode}),
 confirm:p=>call('confirm_reported_result',{p_season_code:seasonCode,p_match_code:p.match_code,p_request_id:p.request_id,p_report_id:p.report_id||null,p_home_score:Number(p.home_score),p_away_score:Number(p.away_score),p_note:p.note||'',p_expected_version:p.expected_version},true),
 reviewStatus:async s=>{const r=await call('get_result_review_status',{p_season_code:seasonCode,p_match_code:s.payload.match_code,p_request_id:s.requestId});return {...r,match_code:s.payload.match_code,request_id:s.requestId}},
 link:(date,action)=>call('manage_daily_report_link',{p_season_code:seasonCode,p_date:date,p_action:action},true),
 lock:(code,version)=>call('lock_match_result',{p_match_code:code,p_expected_version:version,p_published:true},true)
 }
}
return {valid,draft,reviewState,reviewLabels,RequestState,adapter};
});
