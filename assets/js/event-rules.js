"use strict";
(()=>{
  const data=window.WuriEventRulesData;
  if(!data)throw new Error('Event rules data is required');
  let locale='zh';
  try{locale=localStorage.getItem('wuriLeagueLocale')==='en'?'en':'zh'}catch{}
  const text=key=>data.copy[locale][key]||data.copy.zh[key]||'';
  const node=(tag,value,className)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=String(value);if(className)n.className=className;return n};
  function renderSeats(){
    document.querySelectorAll('[data-seats]').forEach(container=>{
      container.replaceChildren();
      for(const group of ['A','B']){
        const card=node('article',undefined,'group-card'+(group==='B'?' b':'')),heading=node('h3'),label=node('span',locale==='zh'?'前三名晉級':'TOP THREE QUALIFY','group-label');
        heading.append(node('span',locale==='zh'?`${group} 組`:`Group ${group}`),label);card.append(heading);
        for(let rank=1;rank<=data.postseason.placesPerGroup;rank++){
          const row=node('div',undefined,'seat');row.append(node('span',rank,'seat-no'),node('strong',locale==='zh'?`${group} 組第 ${rank} 名`:`${group} · Place ${rank}`),node('span',text('notPublished')));card.append(row);
        }
        container.append(card);
      }
    });
  }
  function renderFormat(){
    const f=data.format,order=document.querySelector('.order');order.replaceChildren();
    f.order.forEach((role,index)=>{const point=node('div',undefined,'point');point.append(node('small',locale==='zh'?`第 ${index+1} 點`:`Point ${index+1}`),node('strong',text(role)));order.append(point)});
    const values=document.querySelectorAll('.rule-list dd');
    values[0].textContent=locale==='zh'?`${f.bestOf} 戰 ${f.gamesToWin} 勝，先贏 ${f.gamesToWin} 局獲勝`:`Best of ${f.bestOf} games; first to win ${f.gamesToWin}`;
    values[1].textContent=locale==='zh'?`${f.gamePoints} 分制`:`${f.gamePoints}-point games`;
    values[2].textContent=locale==='zh'?`須領先對手 ${f.winMargin} 分才獲勝`:`A ${f.winMargin}-point lead is required to win`;
    const time=document.querySelector('#postseason-rules time');time.setAttribute('datetime',data.postseason.date);time.textContent=data.postseason.date.replaceAll('-','.');
  }
  function updateTheme(){
    const dark=window.WuriLeagueTheme.current()==='dark',button=document.getElementById('theme');button.textContent=dark?'☀':'☾';button.setAttribute('aria-pressed',String(dark));button.setAttribute('aria-label',locale==='zh'?(dark?'切換淺色模式':'切換深色模式'):(dark?'Switch to light theme':'Switch to dark theme'));
  }
  function setLocale(next){
    locale=next==='en'?'en':'zh';try{localStorage.setItem('wuriLeagueLocale',locale)}catch{}
    document.documentElement.lang=locale==='zh'?'zh-Hant':'en';document.title=locale==='zh'?'賽事規則｜烏日桌球聯賽':'Event rules | Wuri Table Tennis League';
    document.querySelectorAll('[data-t]').forEach(n=>{n.textContent=text(n.dataset.t)});
    document.querySelectorAll('[data-lang]').forEach(n=>{const selected=n.dataset.lang===locale;n.classList.toggle('active',selected);n.setAttribute('aria-pressed',String(selected))});
    document.querySelector('header nav').setAttribute('aria-label',locale==='zh'?'主要導覽':'Main navigation');document.querySelector('.rule-tabs').setAttribute('aria-label',locale==='zh'?'頁內章節':'Page sections');
    document.querySelectorAll('.q').forEach(n=>n.setAttribute('aria-label',locale==='zh'?'Q 標記意義說明，非已晉級隊伍':'Q badge explanation, not a qualified team'));
    renderFormat();renderSeats();updateTheme();
  }
  document.querySelectorAll('[data-lang]').forEach(n=>n.addEventListener('click',()=>setLocale(n.dataset.lang)));
  document.getElementById('theme').addEventListener('click',()=>{window.WuriLeagueTheme.set(window.WuriLeagueTheme.current()==='dark'?'light':'dark')});window.addEventListener('wuri-theme-change',updateTheme);
  window.WuriEventRulesPage=Object.freeze({setLocale});setLocale(locale);
})();
