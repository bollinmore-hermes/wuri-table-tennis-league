(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.WuriPublicationUI=factory()})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const ACTIVE=new Set(['queued','running','dispatch_unknown','verifying']);
const labels={checking:'正在確認公開資料狀態…',synced:'公開資料已同步，沒有待發布修改。',dirty:'有已儲存的公開內容修改，尚未發布。',queued:'發布排程中，公開頁尚未更新。',running:'發布處理中，公開頁仍可能顯示舊資料。',dispatch_unknown:'觸發結果待確認；不可重送，請重新查核。',verifying:'部署已完成，正在確認線上快照。',cooldown:'剛有發布任務，請稍候再重新查核。',not_configured:'發布憑證尚未設定；後台資料仍可儲存。',unknown:'暫時無法確認公開狀態；請重新查核。'};
function summaryView(state){return {enabled:state?.status==='dirty'&&state.can_publish===true,text:labels[state?.status]||labels.unknown}}
function create({document,authorized,call,openDialog=d=>d.showModal(),setTimer=setTimeout,clearTimer=clearTimeout}){
 const el=id=>document.getElementById(id),dialog=el('publicationDialog');
 let state=null,requestId=null,finished=false,uncertain=false,busy=false,generation=0,timer=null,polls=0;
 const stop=()=>{if(timer!==null)clearTimer(timer);timer=null};
 const task=text=>{el('publicationTask').textContent=text};
 const formatDate=value=>Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):'尚無已確認紀錄';
 function render(){const v=summaryView(state);el('publicationStatus').textContent=v.text;el('publishSnapshot').disabled=busy||uncertain||Boolean(requestId&&!finished)||!authorized()||!v.enabled;el('checkPublication').disabled=busy||!authorized();el('openPublication').textContent=state?.status==='synced'?'公開發布・已同步':state?.status==='dirty'?'公開發布・待發布':ACTIVE.has(state?.status)?'公開發布・處理中':'公開發布';el('publicationHistory').textContent=`上次已確認上線：${formatDate(state?.last_published_at)}`;const seconds=state?.automatic_interval_seconds;el('publicationAutomation').textContent=state?.automatic_enabled?(seconds?`自動檢查每 ${seconds/60} 分鐘一次；仍需等待建置、部署與上線確認。`:'自動檢查已啟用；仍需等待建置、部署與上線確認。'):'自動檢查暫停或狀態尚未確認。';}
 function schedule(){stop();if(!dialog.open||document.visibilityState==='hidden'||!requestId||finished||uncertain)return;if(polls>=60){task('尚未確認完成，已停止自動追蹤；不可重送，請按重新查核。');return}timer=setTimer(()=>{timer=null;polls++;check()},5000)}
 async function readState(g){const result=await call('state');if(g!==generation||!authorized())return false;state=result;if(result.pending_request_id&&!requestId){requestId=result.pending_request_id;finished=false;uncertain=false;task(labels[result.status]||labels.dispatch_unknown)}if(uncertain)task('送出結果待確認；不可重送，請重新查核。');render();return true}
 async function refresh(){if(!authorized())return;stop();const g=++generation;state={status:'checking'};render();try{if(await readState(g))schedule()}catch{if(g!==generation)return;state=null;render();if(requestId&&!finished)task('目前發布結果待確認；不可重送，請重新查核。')}}
 async function open(){if(!authorized())return;if(finished){requestId=null;finished=false;task('尚未啟動新的發布任務。')}openDialog(dialog);polls=0;await refresh()}
 async function check(){if(!authorized()||busy)return;stop();busy=true;render();const g=++generation;try{if(requestId&&!finished){const expected=requestId,result=await call('status',expected);if(g!==generation||!authorized())return;if(result.request_id!==expected)throw new Error('unexpected publication receipt');if(result.status==='published'){finished=true;uncertain=false;task(`本次快照已確認上線：${formatDate(result.published_at)}。已開啟的公開頁請重新整理；後續修改須另外發布。`)}else if(result.status==='failed'){finished=true;uncertain=false;task('本次發布未完成；已儲存資料仍在後台。重新查核後可再啟動發布。')}else if(ACTIVE.has(result.status)){task(labels[result.status])}else throw new Error('unknown publication status');}
  await readState(g);
 }catch{if(g===generation){state=null;render();if(requestId||uncertain)task('目前發布結果待確認；不可重送，請重新查核。');stop();return}}finally{busy=false;render()}
 schedule();}
 async function publish(){if(!authorized()||busy||el('publishSnapshot').disabled)return;stop();busy=true;render();const g=++generation;try{if(!await readState(g)||!summaryView(state).enabled)return;
  // A fresh server check and the database lock both guard stale buttons.
  requestId=null;finished=false;task('正在送出發布要求；公開頁尚未更新。');
  let result;try{result=await call('publish')}catch(error){uncertain=!error.publicationRejected;state=null;task(uncertain?'送出結果待確認；不可重送，請重新查核。':'此次未啟動發布，請重新查核目前狀態。');return}
  if(result.status==='unchanged'){state={status:'synced',can_publish:false,...state};state.status='synced';state.can_publish=false;task('送出前已同步，沒有新增發布任務。');return}
  if(!result.request_id||!ACTIVE.has(result.status)){uncertain=true;state=null;task('送出結果待確認；不可重送，請重新查核。');return}
  requestId=result.request_id;finished=false;uncertain=false;polls=0;state={...state,status:result.status,can_publish:false};task(labels[result.status]);
 }catch{state=null;task('狀態查核未完成，尚未送出發布要求；請重新查核。')}finally{busy=false;render();schedule()}}
 function invalidate(){stop();generation++;state={status:'checking'};render();if(dialog.open&&!busy)timer=setTimer(()=>{timer=null;refresh()},0)}
 function reset(){stop();generation++;state=null;requestId=null;finished=false;uncertain=false;busy=false;if(dialog.open)dialog.close();task('尚未啟動發布任務。');render()}
 el('openPublication').onclick=open;el('publishSnapshot').onclick=publish;el('checkPublication').onclick=check;
 dialog.addEventListener('close',()=>{stop();generation++;el('publishSnapshot').disabled=true;el('openPublication').focus()});
 let outside=false;const isOutside=event=>{const r=dialog.getBoundingClientRect();return event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom};dialog.addEventListener('pointerdown',e=>{outside=e.target===dialog&&isOutside(e)});dialog.addEventListener('pointerup',e=>{if(outside&&e.target===dialog&&isOutside(e))dialog.close();outside=false});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')stop();else if(dialog.open&&requestId&&!finished&&!uncertain)check()});
 render();return {open,refresh,check,publish,invalidate,reset};
}
return {create,summaryView};
});
