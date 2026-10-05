/* Full-table PNG clipboard export. Never changes the live table or its scroll position. */
(function(root){
  'use strict';
  const messages={
    zh:{label:g=>`複製 ${g} 組完整表格圖片`,busy:'正在複製完整表格圖片…',done:'已複製完整表格圖片，可直接貼上。',unsupported:'此瀏覽器或開啟方式不支援圖片剪貼簿，請使用支援的 HTTPS 瀏覽器。不會改成下載或文字。',failed:'圖片複製失敗，請確認瀏覽器權限後重試。沒有存檔。'},
    en:{label:g=>`Copy Group ${g} full table image`,busy:'Copying the full table image…',done:'Full table image copied. You can paste it now.',unsupported:'Image clipboard is unavailable. Use a supported HTTPS browser. No download or text fallback.',failed:'Image copy failed. Check browser permissions and retry. No file was saved.'}
  };
  const words=locale=>messages[locale==='en'?'en':'zh'];
  function dimensions(table){
    const rect=table.getBoundingClientRect();
    const width=Math.ceil(Math.max(rect.width,table.scrollWidth)),height=Math.ceil(Math.max(rect.height,table.scrollHeight));
    if(!width||!height||width*height>16000000)throw new Error('Invalid or oversized table');
    return {width,height};
  }
  function loadImage(src){return new Promise((resolve,reject)=>{
    const image=new root.Image(),timer=root.setTimeout(()=>{image.onload=image.onerror=null;reject(new Error('Image load timed out'));},15000);
    image.onload=()=>{root.clearTimeout(timer);resolve(image)};
    image.onerror=()=>{root.clearTimeout(timer);reject(new Error('Image load failed'))};image.src=src;
  })}
  function freezeTable(table){
    const {width,height}=dimensions(table),clone=table.cloneNode(true);
    const originals=[table,...table.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')],images=[];
    originals.forEach((node,index)=>{
      const style=root.getComputedStyle(node);let css='';
      for(let i=0;i<style.length;i++){const key=style[i];css+=`${key}:${style.getPropertyValue(key)};`}
      copies[index].setAttribute('style',css);copies[index].removeAttribute('id');
      if(node.tagName==='IMG'){
        const rect=node.getBoundingClientRect();
        images.push({copy:copies[index],src:node.currentSrc||node.src,width:rect.width,height:rect.height});
        copies[index].removeAttribute('loading');copies[index].removeAttribute('srcset');
      }
    });
    clone.style.width=`${width}px`;clone.style.height=`${height}px`;clone.style.margin='0';
    let background='';
    for(let node=table;node;node=node.parentElement){
      const color=root.getComputedStyle(node).backgroundColor;
      if(color&&color!=='transparent'&&!/^rgba\([^)]*,\s*0\)$/.test(color)){background=color;break}
    }
    if(!background)background='#ffffff';
    // Freeze sorting, text and theme at click time, before any asynchronous asset loads.
    return {clone,width,height,images,background};
  }
  async function renderPNG(frozen){
    const {clone,width,height,images}=frozen;
    await root.document.fonts?.ready;
    await Promise.all(images.map(async item=>{
      if(!item.width||!item.height){item.copy.remove();return}
      const url=new URL(item.src,root.location.href);
      if(url.origin!==root.location.origin)throw new Error('Only same-origin team logos may be exported');
      const image=await loadImage(url.href),canvas=root.document.createElement('canvas');
      canvas.width=Math.ceil(item.width*2);canvas.height=Math.ceil(item.height*2);
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
      // Respect object-fit:contain for non-square SVG badges.
      const scale=Math.min(canvas.width/image.naturalWidth,canvas.height/image.naturalHeight);
      const w=image.naturalWidth*scale,h=image.naturalHeight*scale;
      ctx.drawImage(image,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
      item.copy.src=canvas.toDataURL('image/png');
    }));
    const host=root.document.createElement('div');
    host.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
    host.style.cssText=`width:${width}px;height:${height}px;overflow:hidden;background:${frozen.background};`;
    host.append(clone);
    const markup=new root.XMLSerializer().serializeToString(host);
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${markup}</foreignObject></svg>`;
    const image=await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    const canvas=root.document.createElement('canvas');canvas.width=width*2;canvas.height=height*2;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
    ctx.scale(2,2);ctx.drawImage(image,0,0,width,height);
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG generation failed')),'image/png'));
  }
  async function copyTable({table,button,status,locale='zh'}){
    if(button.disabled)return false;
    const text=words(locale);
    if(!root.isSecureContext||!root.navigator.clipboard?.write||!root.ClipboardItem){status.textContent=text.unsupported;return false}
    button.disabled=true;button.setAttribute('aria-busy','true');status.textContent=text.busy;
    try{
      const frozen=freezeTable(table);
      // Start write synchronously in the click handler: WebKit must retain user activation.
      const png=renderPNG(frozen);
      png.catch(()=>{}); // Avoid unhandled rejection if clipboard permission fails first.
      await root.navigator.clipboard.write([new root.ClipboardItem({'image/png':png})]);
      status.textContent=text.done;root.setTimeout(()=>{if(status.textContent===text.done)status.textContent=''},6000);return true;
    }catch{status.textContent=text.failed;return false}
    finally{button.disabled=false;button.removeAttribute('aria-busy')}
  }
  function bind({locale='zh'}={}){
    root.document.querySelectorAll('[data-copy-standings]').forEach(button=>{
      const group=button.dataset.copyStandings,label=words(locale).label(group);
      button.setAttribute('aria-label',label);button.setAttribute('title',label);
      button.onclick=()=>{root.document.querySelectorAll('.standings-copy-status').forEach(node=>{node.textContent=''});return copyTable({table:root.document.getElementById(`standings${group}`),button,status:root.document.getElementById(`standingsCopyStatus${group}`),locale})};
    });
  }
  root.WuriStandingsImage=Object.freeze({bind,copyTable,freezeTable,renderPNG,dimensions});
})(typeof window==='undefined'?globalThis:window);
