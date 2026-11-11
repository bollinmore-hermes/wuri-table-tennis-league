(function(root){'use strict';
const D=root.WuriSeasonArchive;
function node(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(cls)n.className=cls;return n}
function table(headers,rows){const box=node('div',null,'table-wrap'),t=node('table'),head=node('thead'),tr=node('tr');for(const h of headers){const th=node('th',h);th.scope='col';tr.append(th)}head.append(tr);const body=node('tbody');for(const row of rows){const r=node('tr');for(const value of row)r.append(node('td',value));body.append(r)}t.append(head,body);box.append(t);return box}
function renderContent(container,content,{preview=false}={}){
 const data=content.league,names=new Map(data.teams.map(t=>[t.team_code,t.name]));container.replaceChildren();
 const banner=node('div',null,'banner');banner.append(node('p',preview?'ARCHIVE PREVIEW':'SEASON RECORD','eyebrow'),node('h1',data.season.name),node('p',preview?'封存預覽 · 尚未建立封存紀錄':'已封存 · 當季紀錄唯讀'));container.append(banner);
 const tabs=node('div',null,'tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','賽季內容');const panels=[];const prefix='archive-'+Math.random().toString(36).slice(2,8);
 const choose=index=>{[...tabs.children].forEach((b,i)=>{b.setAttribute('aria-selected',String(i===index));b.tabIndex=i===index?0:-1});panels.forEach((p,i)=>p.hidden=i!==index)};
 for(const [index,title] of ['賽季總覽','排名','賽程與賽果','當季規則'].entries()){
  const button=node('button',title);button.type='button';button.id=prefix+'-tab-'+index;button.setAttribute('role','tab');button.setAttribute('aria-controls',prefix+'-panel-'+index);button.onclick=()=>choose(index);button.onkeydown=e=>{let next;if(e.key==='ArrowRight')next=(index+1)%4;else if(e.key==='ArrowLeft')next=(index+3)%4;else if(e.key==='Home')next=0;else if(e.key==='End')next=3;else return;e.preventDefault();choose(next);tabs.children[next].focus()};tabs.append(button);
  const panel=node('section');panel.id=prefix+'-panel-'+index;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);panels.push(panel);
 }
 container.append(tabs,...panels);
 const finals=[...content.final_rankings].sort((a,b)=>a.rank-b.rank||a.team_code.localeCompare(b.team_code));
 if(finals.length){const winners=node('div',null,'podium');for(const row of finals.filter(r=>r.rank<=3)){const card=node('div',null,'card'+(row.rank===1?' first':''));card.append(node('span',row.rank===1?'最終冠軍':`最終第 ${row.rank} 名`,'eyebrow'),node('strong',names.get(row.team_code)));winners.append(card)}panels[0].append(winners)}else panels[0].append(node('p','最終名次未提供：'+content.final_rankings_note,'notice'));
 const intro=node('div',null,'card section-space');intro.append(node('h2','這一季，完整留下'),node('p',`${data.teams.length} 支隊伍 · ${data.matches.length} 場賽程 · ${data.results.length} 筆正式賽果`),node('p','隊名、賽果與規則以封存當時版本保存。例行賽統計不代替主辦核定的最終名次。','muted small'));panels[0].append(intro);
 if(finals.length){panels[1].append(node('h2','主辦核定最終名次','panel-title'),table(['名次','球隊'],finals.map(r=>[r.rank,names.get(r.team_code)])))}else panels[1].append(node('p','最終名次未提供；不由例行賽排名推算冠軍。','notice'));
 for(const group of ['A','B']){const rows=D.standings(data,group);if(!rows.length)continue;panels[1].append(node('h2',group+' 組例行賽統計','panel-title'),table(['球隊','積分','勝','敗','出賽','勝率'],rows.map(r=>[r.name,r.points,r.wins,r.losses,r.played,r.played?Math.round(r.wins/r.played*100)+'%':'—'])))}panels[1].append(node('p','統計沿用封存版本 points-v1：3–0 為 3／0 分、2–1 為 2／1 分；同分顯示次序不代表季後賽最終名次。','small muted'));
 const matches=node('div',null,'match-grid');for(const m of [...data.matches].sort((a,b)=>`${a.date}${a.time}${a.match_code}`.localeCompare(`${b.date}${b.time}${b.match_code}`))){const card=node('article',null,'card match'),r=data.results.find(x=>x.match_code===m.match_code);card.append(node('p',`${m.date} ${m.time} · ${m.group} 組 · ${m.match_code}`,'small muted'));const line=node('h3');line.append(node('span',names.get(m.home_team_code)),node('b',r?`${r.home_score} : ${r.away_score}`:'取消'),node('span',names.get(m.away_team_code)));card.append(line);if(m.venue)card.append(node('p',m.venue,'small muted'));const exception=content.exceptions.find(x=>x.match_code===m.match_code);if(exception)card.append(node('p',exception.reason,'small muted'));matches.append(card)}panels[2].append(matches);
 const rules=node('article',null,'card');rules.append(node('h2','當季核定規則'),node('p',content.rules.text,'rules-text'));if(content.rules.source)rules.append(node('p','來源：'+content.rules.source,'small muted source-note'));panels[3].append(rules);choose(0);return {choose};
}
root.WuriArchiveView=Object.freeze({node,renderContent});
})(typeof globalThis!=='undefined'?globalThis:this);
