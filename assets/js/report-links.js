'use strict';
window.WuriReporting.createLinks=function({api,getData,isAdmin,dialog,openDialog,baseUrl}){
 const n=(tag,attrs={},...children)=>{const e=document.createElement(tag);for(const [key,value]of Object.entries(attrs)){if(key==='text')e.textContent=value;else if(key==='class')e.className=value;else e.setAttribute(key,value)}e.append(...children);return e};
 let day='',info=null,url='',busy=false,pendingAction='',unknown=false,ready=false,epoch=0,lastDay='';
 const title=n('h3',{id:`${dialog.id}Title`}),status=n('p',{role:'status','aria-live':'polite',class:'link-status'}),close=n('button',{type:'button',class:'close','data-link-close':'','aria-label':'關閉回報連結',text:'×'});
 const body=n('div',{class:'dialog-body link-body'}),active=n('section',{'data-link-active':''}),qr=n('canvas',{class:'daily-qr','aria-label':'當日回報 QR Code'}),link=n('input',{readonly:'','aria-label':'當日回報連結'}),primary=n('div',{class:'link-primary-actions'}),secondary=n('div',{class:'link-secondary-actions'}),advanced=n('details',{class:'link-advanced'});
 const exportQr=document.createElement('canvas');exportQr.width=400;exportQr.height=410;
 const details=n('details',{class:'link-info'});details.append(n('summary',{text:'更多資訊'}),n('p',{class:'field-hint',text:'A、B 組共用此連結；重複分享或列印不會換發。'}),link);details.open=false;
 const buttons={};
 function button(key,text,kind='ghost'){const b=n('button',{type:'button',class:kind,'data-link-action':key,text});buttons[key]=b;return b}
 const create=button('create','產生回報連結','primary'),retry=button('retry','重試');
 const preview=n('a',{'data-link-preview':'',target:'_blank',rel:'noopener noreferrer',class:'mini-link',text:'預覽回報頁'});
 primary.append(button('copy','複製連結','primary'),button('download','下載 QR'));
 secondary.append(preview,button('print','列印','mini-link'),details);
 advanced.append(n('summary',{text:'進階管理'}),n('p',{class:'field-hint',text:'停用會關閉當日回報入口；換發會使所有舊網址與已印出的 QR 失效。兩者均不刪除既有回報或正式比分。'}),n('div',{class:'link-danger-actions'},button('revoke','停用'),button('rotate','換發（舊 QR 全失效）')));advanced.open=false;
 active.append(qr,primary,secondary,advanced);
 body.append(status,create,retry,active);
 dialog.classList.add('report-link-dialog');dialog.setAttribute('aria-labelledby',title.id);dialog.replaceChildren(n('div',{class:'dialog-head'},title,close),body);
 function feedback(text){status.textContent=text;status.hidden=!text}
 function frozen(){return unknown||(busy&&pendingAction!=='get')}
 function clearShare(){url='';link.value='';preview.removeAttribute('href');active.hidden=true;qr.width=320;qr.height=320}
 function controls(){close.disabled=frozen();for(const [key,b]of Object.entries(buttons))b.disabled=busy||(unknown||!ready)&&key!=='retry';preview.hidden=busy||unknown||!url}
 function closePopup(force=false){if(!force&&frozen())return;const closingDay=day;epoch++;busy=false;pendingAction='';day='';clearShare();if(dialog.open)dialog.close();lastDay=closingDay||lastDay}
 close.onclick=()=>closePopup();
 dialog.addEventListener('cancel',event=>{event.preventDefault();closePopup()});
 dialog.addEventListener('close',()=>{if(dialog.open)return;[...document.querySelectorAll('[data-report-date]')].find(b=>b.dataset.reportDate===lastDay)?.focus()});
 let outside=false;const isOutside=e=>{const b=dialog.getBoundingClientRect();return e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom};
 dialog.addEventListener('pointerdown',e=>{outside=e.target===dialog&&isOutside(e)});
 dialog.addEventListener('pointerup',e=>{if(outside&&e.target===dialog&&isOutside(e))closePopup();outside=false});
 function valid(value,date){const season=getData().season?.code;if(!value||value.date!==date||typeof value.active!=='boolean'||season&&value.season_code!==season||value.active&&!/^[a-f0-9]{64}$/.test(value.token||''))throw Error('link scope mismatch');return value}
 async function display(value,ticket){
  info=value;create.hidden=value.active;retry.hidden=true;clearShare();
  if(!value.active){feedback('尚無回報連結');ready=true;return}
  const target=`${baseUrl}#token=${value.token}`,raw=document.createElement('canvas');
  await window.WuriQR.toCanvas(raw,target,{errorCorrectionLevel:'M',width:320,margin:4});
  if(ticket!==epoch||!isAdmin())return;
  qr.width=320;qr.height=320;qr.getContext('2d').drawImage(raw,0,0);
  const c=exportQr.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,400,410);c.fillStyle='#222';c.font='16px sans-serif';c.textAlign='center';c.fillText('烏日桌球聯賽｜裁判賽後回報',200,25);c.fillText(`${value.season_code}｜${value.date}`,200,52);c.drawImage(raw,40,65);c.fillText('尚非正式結果，需賽務核對',200,402);
  ready=true;url=target;link.value=url;preview.href=url;active.hidden=false;feedback('');
 }
 async function run(action){
  if(!isAdmin()||!day||busy||unknown&&action!=='get'||!['get','create','rotate','revoke'].includes(action))return;
  if(action!=='get'&&!ready)return;
  if(action==='create'&&info?.active)return;
  if((action==='rotate'||action==='revoke')&&!info?.active)return;
  if(action==='rotate'&&!confirm('換發會使當日全部舊連結與已印製 QR 失效，確認換發？'))return;
  if(action==='revoke'&&!confirm('停用會使當日所有回報連結／QR 失效，不影響正式結果，確認停用？'))return;
  const date=day,ticket=++epoch;busy=true;ready=false;pendingAction=action;create.hidden=true;retry.hidden=true;active.hidden=true;feedback(action==='get'?'正在查核…':'正在處理並查核結果…');controls();let verified=false;
  try{
   const result=valid(await api.link(date,action),date);
   if(ticket!==epoch||!isAdmin())return;
   const read=action==='get'?result:valid(await api.link(date,'get'),date);
   if(ticket!==epoch||!isAdmin())return;
   if(result.active!==read.active||result.active&&result.token!==read.token)throw Error('link readback mismatch');
   verified=true;unknown=false;
   await display(read,ticket);
  }catch(error){
   if(ticket!==epoch||!isAdmin())return;
   unknown=unknown||action!=='get'&&!verified&&error.mutationState!=='rejected';clearShare();create.hidden=true;retry.hidden=false;
   feedback(verified?'連結狀態已確認，但 QR 顯示失敗；請重試。':unknown?'操作結果尚未確認；請按重試查核原日期，暫不可關閉、換日或再次產生／換發。':'無法查核當日回報連結；請重試。');
  }finally{if(ticket===epoch){busy=false;pendingAction='';controls()}}
 }
 async function open(date){
  if(!isAdmin()||frozen()||!getData().matches.some(m=>m.date===date))return;
  epoch++;day=date;lastDay=date;info=null;ready=false;busy=false;clearShare();create.hidden=true;retry.hidden=true;advanced.open=false;details.open=false;
  title.textContent=`${date} 回報連結`;dialog.dataset.reportDate=date;controls();if(!dialog.open)openDialog(dialog);await run('get');
 }
 function canShare(){return isAdmin()&&Boolean(url)&&!busy&&!unknown&&dialog.open}
 buttons.create.onclick=()=>run('create');buttons.retry.onclick=()=>run('get');buttons.rotate.onclick=()=>run('rotate');buttons.revoke.onclick=()=>run('revoke');
 buttons.copy.onclick=async()=>{if(!canShare())return;try{await navigator.clipboard.writeText(url);feedback('已複製連結')}catch{details.open=true;feedback('複製失敗；可展開更多資訊手動複製。')}};
 buttons.download.onclick=()=>{if(!canShare())return;const a=n('a',{download:`wuri-report-${day}.png`,href:exportQr.toDataURL('image/png')});a.click()};
 buttons.print.onclick=()=>{if(!canShare())return;const frame=n('iframe',{title:'當日 QR 列印'});frame.style.cssText='position:fixed;width:1px;height:1px;left:-9999px';document.body.append(frame);const image=n('img',{src:exportQr.toDataURL('image/png'),alt:`當日回報 QR ${day}`});image.onload=()=>{frame.contentWindow.focus();frame.contentWindow.print()};frame.contentWindow.onafterprint=()=>frame.remove();frame.contentDocument.body.append(image)};
 create.hidden=retry.hidden=active.hidden=true;controls();
 return {open,close:closePopup,run,render(){if(!isAdmin()){unknown=false;closePopup(true)}}};
};
