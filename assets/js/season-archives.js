(()=>{'use strict';
const cfg=window.LEAGUE_CONFIG||{},D=window.WuriSeasonArchive,V=window.WuriArchiveView,app=document.getElementById('archiveApp'),message=document.getElementById('archiveMessage');let generation=0;
const base=/^[a-z]{20}$/.test(cfg.projectRef||'')?`https://${cfg.projectRef}.supabase.co`:'',endpoint=base+'/functions/v1/season-archives';
const notify=(text,error=false)=>{message.textContent=text;message.hidden=!text;message.className='notice'+(error?' error':'')};
async function read(url,limit=2000000){const r=await fetch(url,{cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok||r.redirected)throw Error('暫時無法讀取歷屆賽季，請稍後再試。');const text=await r.text();if(new TextEncoder().encode(text).length>limit)throw Error('封存內容超過大小限制');return JSON.parse(text)}
async function load(){const g=++generation;app.setAttribute('aria-busy','true');notify('正在載入賽季紀錄…');app.replaceChildren();
 try{
  if(!base||!['test','production'].includes(cfg.environment)||cfg.archivesEndpoint!==endpoint)throw Error('歷屆賽季資料來源尚未設定。');
  const season=new URLSearchParams(location.search).get('season');if(season&&!D.CODE.test(season))throw Error('賽季連結格式不正確');
  const catalog=await read(endpoint+(season?'?season='+encodeURIComponent(season):''));if(g!==generation)return;
  if(catalog.schemaVersion!==1||catalog.environment!==cfg.environment||catalog.projectRef!==cfg.projectRef||!Array.isArray(catalog.archives)||catalog.archives.length>200)throw Error('封存目錄環境不一致');
  if(season){const item=catalog.archives.find(a=>a.seasonCode===season);if(!item)throw Error('找不到已公開的賽季封存。');
   if(!D.UUID.test(item.archiveId)||!D.HASH.test(item.contentHash)||item.objectPath!==`${season}/${item.archiveId}-${item.contentHash}.json`)throw Error('封存連結驗證失敗');
   const raw=await read(`${base}/storage/v1/object/public/wuri-season-archives/${item.objectPath}`);const archive=await D.normalizeArchive(raw,cfg);if(g!==generation)return;
   if(archive.seasonCode!==season||archive.archiveId!==item.archiveId||archive.contentHash!==item.contentHash)throw Error('目錄與封存內容不一致');
   const back=V.node('a','← 歷屆賽季','back');back.href='archives.html';app.append(back);const content=V.node('div');app.append(content);V.renderContent(content,archive.content);document.title=archive.content.league.season.name+'｜歷屆賽季';
  }else if(!catalog.archives.length){const empty=V.node('div',null,'card empty');empty.append(V.node('h2','聯賽歷史，從這一季開始。'),V.node('p','目前沒有已發布的歷史賽季。本季結束並經主辦確認封存後，完整紀錄會出現在這裡。','muted'));app.append(empty)}
  else{for(const a of catalog.archives){if(!D.CODE.test(a.seasonCode)||typeof a.name!=='string'||!Number.isFinite(Date.parse(a.archivedAt)))throw Error('封存目錄格式不正確');const card=V.node('article',null,'card season-card'),year=V.node('div',(a.name.match(/20\d{2}/)||[new Date(a.archivedAt).getFullYear()])[0],'year'),body=V.node('div');body.append(V.node('span','已封存 · 唯讀','badge'),V.node('h2',a.name));const row=V.node('div',null,'spread');row.append(V.node('p',`${a.teamCount} 支隊伍 · ${a.matchCount} 場賽程`));const link=V.node('a','查看賽季 →','btn dark');link.href='archives.html?season='+encodeURIComponent(a.seasonCode);row.append(link);body.append(row);card.append(year,body);app.append(card)}}
  notify('');
 }catch(error){if(g!==generation)return;app.replaceChildren();notify(error.message||'封存內容無法驗證，已停止顯示。',true)}finally{if(g===generation)app.removeAttribute('aria-busy')}
}
if(cfg.environment==='test'){const notice=document.getElementById('environmentNotice');notice.hidden=false;notice.textContent='測試環境：驗收用合成賽季不是正式聯賽成績。'}
window.addEventListener('popstate',load);load();
})();
