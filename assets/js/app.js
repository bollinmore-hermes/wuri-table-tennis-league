"use strict";
const teams = {
  A:["快樂Da桌球","夢幻羽翼","好球隊","小三美日","叔叔沒練球","陽光男孩"],
  B:["我們這一隊","劉家昌","烏日少年","海納百川","南門金龍","富士山"]
};
const officialStandings = {
  A:{cutoff:"2026-09-20",rows:{
    "叔叔沒練球":{pts:15,w:5,l:0,trend:1},"好球隊":{pts:11,w:4,l:1,trend:-1},
    "小三美日":{pts:8,w:3,l:2,trend:0},"陽光男孩":{pts:6,w:2,l:3,trend:2},
    "快樂Da桌球":{pts:4,w:1,l:4,trend:-1},"夢幻羽翼":{pts:1,w:0,l:5,trend:-1}
  }},
  B:{cutoff:"2026-09-13",rows:{
    "劉家昌":{pts:9,w:3,l:0,trend:0},"富士山":{pts:8,w:3,l:0,trend:0},
    "烏日少年":{pts:7,w:2,l:3,trend:0},"海納百川":{pts:4,w:2,l:3,trend:0},
    "我們這一隊":{pts:4,w:1,l:2,trend:-3},"南門金龍":{pts:1,w:0,l:3,trend:0}
  }}
};
const officialScores={"A-2026-08-23-1":{"home":3,"away":0},"A-2026-08-23-2":{"home":2,"away":1},"A-2026-08-23-3":{"home":0,"away":3},"A-2026-08-23-4":{"home":1,"away":2},"A-2026-08-23-5":{"home":1,"away":2},"A-2026-08-23-6":{"home":0,"away":3},"A-2026-09-06-1":{"home":0,"away":3},"A-2026-09-06-2":{"home":3,"away":0},"A-2026-09-06-3":{"home":3,"away":0},"A-2026-09-06-4":{"home":0,"away":3},"A-2026-09-06-5":{"home":3,"away":0},"A-2026-09-20-1":{"home":0,"away":3},"A-2026-09-20-2":{"home":0,"away":3},"A-2026-09-20-3":{"home":0,"away":3},"A-2026-09-20-4":{"home":0,"away":3},"B-2026-08-30-1":{"home":0,"away":3},"B-2026-08-30-2":{"home":3,"away":0},"B-2026-08-30-3":{"home":3,"away":0},"B-2026-08-30-4":{"home":3,"away":0},"B-2026-08-30-5":{"home":1,"away":2},"B-2026-08-30-6":{"home":3,"away":0},"B-2026-09-13-1":{"home":3,"away":0},"B-2026-09-13-2":{"home":0,"away":3},"B-2026-09-13-3":{"home":1,"away":2},"B-2026-09-13-4":{"home":2,"away":1},"B-2026-09-13-5":{"home":0,"away":3}};
const rawRounds = [
  ["A","2026-08-23",[["15:30","快樂Da桌球","夢幻羽翼"],["15:30","好球隊","小三美日"],["16:00","快樂Da桌球","好球隊"],["16:00","夢幻羽翼","小三美日"],["16:30","快樂Da桌球","小三美日"],["16:30","夢幻羽翼","好球隊"]]],
  ["A","2026-09-06",[["15:30","好球隊","叔叔沒練球"],["15:30","小三美日","陽光男孩"],["16:00","好球隊","陽光男孩"],["16:00","小三美日","叔叔沒練球"],["16:30","叔叔沒練球","陽光男孩"]]],
  ["A","2026-09-20",[["15:30","快樂Da桌球","叔叔沒練球"],["15:30","夢幻羽翼","陽光男孩"],["16:00","快樂Da桌球","陽光男孩"],["16:00","夢幻羽翼","叔叔沒練球"]]],
  ["A","2026-10-18",[["15:30","快樂Da桌球","夢幻羽翼"],["15:30","好球隊","小三美日"],["16:00","快樂Da桌球","好球隊"],["16:00","夢幻羽翼","小三美日"],["16:30","快樂Da桌球","小三美日"],["16:30","夢幻羽翼","好球隊"]]],
  ["A","2026-11-08",[["15:30","好球隊","叔叔沒練球"],["15:30","小三美日","陽光男孩"],["16:00","好球隊","陽光男孩"],["16:00","小三美日","叔叔沒練球"],["16:30","叔叔沒練球","陽光男孩"]]],
  ["A","2026-11-22",[["15:30","快樂Da桌球","叔叔沒練球"],["15:30","夢幻羽翼","陽光男孩"],["16:00","快樂Da桌球","陽光男孩"],["16:00","夢幻羽翼","叔叔沒練球"]]],
  ["B","2026-08-30",[["15:30","我們這一隊","劉家昌"],["15:30","烏日少年","海納百川"],["16:00","我們這一隊","烏日少年"],["16:00","劉家昌","海納百川"],["16:30","我們這一隊","海納百川"],["16:30","劉家昌","烏日少年"]]],
  ["B","2026-09-13",[["15:30","烏日少年","南門金龍"],["15:30","海納百川","富士山"],["16:00","烏日少年","富士山"],["16:00","海納百川","南門金龍"],["16:30","南門金龍","富士山"]]],
  ["B","2026-10-04",[["15:30","我們這一隊","南門金龍"],["15:30","劉家昌","富士山"],["16:00","我們這一隊","富士山"],["16:00","劉家昌","南門金龍"]]],
  ["B","2026-11-01",[["15:30","我們這一隊","劉家昌"],["15:30","烏日少年","海納百川"],["16:00","我們這一隊","烏日少年"],["16:00","劉家昌","海納百川"],["16:30","我們這一隊","海納百川"],["16:30","劉家昌","烏日少年"]]],
  ["B","2026-11-15",[["15:30","烏日少年","南門金龍"],["15:30","海納百川","富士山"],["16:00","烏日少年","富士山"],["16:00","海納百川","南門金龍"],["16:30","南門金龍","富士山"]]],
  ["B","2026-11-29",[["15:30","我們這一隊","南門金龍"],["15:30","劉家昌","富士山"],["16:00","我們這一隊","富士山"],["16:00","劉家昌","南門金龍"]]]
];
const games = rawRounds.flatMap(([group,date,list]) => list.map(([time,home,away],i)=>({id:`${group}-${date}-${i+1}`,group,date,time,home,away})));
const validScore=(h,a)=>Number.isInteger(h)&&Number.isInteger(a)&&((h===3&&a===0)||(h===0&&a===3)||(h===2&&a===1)||(h===1&&a===2));
const scores=Object.freeze({...officialScores});
let groupFilter="ALL", selectedDate="ALL", teamGroup="ALL", activeTeamDetail=null;
const standingsSort={A:{key:"pts",dir:"desc"},B:{key:"pts",dir:"desc"}};
const el=id=>document.getElementById(id);
const copy={
  zh:{brand:"烏日桌球聯賽",season:"2026 秋季聯賽・下半季",navHome:"首頁",navSchedule:"賽程",navStandings:"戰績",navTeams:"球隊",heroTitle:"每一球，<br>都是關鍵一擊。",heroCopy:"烏日桌球聯賽下半季，A、B 兩組共 12 支球隊，從例行賽一路競逐至季後賽。",viewSchedule:"查看完整賽程",liveStandings:"即時戰績",postseasonTitle:"季後賽・拚獎金",postseasonCopy:"例行賽排名將決定最終季後賽席次。",postseasonDate:"12 月 6 日",overview:"聯賽概況",nextMatchday:"下一比賽日",allSchedule:"所有賽程 →",groupStandings:"分組戰績",standingsHint:"首頁顯示精簡排名，完整資訊請前往戰績頁。",fullStandings:"完整戰績 →",group:"組",scheduleCopy:"依日期與分組瀏覽完整賽程與正式比分。",scheduleNotice:"原始圖片僅含對戰安排，未提供場地、球員與實際賽果；本頁不虛構相關資訊。",all:"全部",standingsTitle:"戰績排名",standingsCopy:"A、B 組依正式逐場賽果計算的即時排名。",rankingGuide:"排名與積分說明",rankingGuideText:"依聯賽積分排序；同分時依勝場數與勝率排序。3–0 的積分為 3–0，2–1 的積分為 2–1。",standingsNotice:"排名由正式成績表的逐場比分計算；A 組截至 2026/9/20，B 組截至 2026/9/13。",aCutoff:"正式賽果截至 2026/9/20",bCutoff:"正式賽果截至 2026/9/13",teamsCopy:"A、B 兩組參賽隊伍與各隊賽程。",footer:"2026 秋季聯賽・賽程、戰績與球隊資訊",teamsCount:"參賽球隊",matchesCount:"例行賽場次",completedCount:"已完成賽事",twoGroups:"A、B 兩組",matchdays:"個比賽日",officialBase:"正式賽果",matchesUnit:"場",overviewLine:(teams,matches,done)=>`${teams} 支球隊・${matches} 場例行賽・${done} 場已完成`,allMatchdays:"所有比賽日",noMatches:"沒有符合條件的賽事。",official:"正式賽果",scheduled:"尚未開賽",team:"球隊",points:"積分",record:"勝–敗",rankTeam:"排名／球隊",trend:"升降",wins:"勝",losses:"敗",played:"已賽",winPct:"勝率",teamMeta:(group,w,l)=>`${group} 組・${w} 勝 ${l} 敗`,teamSchedule:"賽程",close:"關閉",teamDetail:(w,l,p,m)=>`${w} 勝 ${l} 敗・${p} 積分・共安排 ${m} 場例行賽`},
  en:{brand:"Wuri Table Tennis League",season:"2026 Autumn League · Second Half",navHome:"Home",navSchedule:"Schedule",navStandings:"Standings",navTeams:"Teams",heroTitle:"Every point.<br>Every moment matters.",heroCopy:"Twelve teams across Groups A and B compete through the regular season for a place in the postseason.",viewSchedule:"View Schedule",liveStandings:"Live Standings",postseasonTitle:"Postseason · Prize Round",postseasonCopy:"Regular-season standings determine the postseason field.",postseasonDate:"December 6",overview:"League Overview",nextMatchday:"Next Matchday",allSchedule:"Full Schedule →",groupStandings:"Group Standings",standingsHint:"A compact ranking is shown here. Open Standings for full details.",fullStandings:"Full Standings →",group:"Group",scheduleCopy:"Browse the full schedule and official results by date and group.",scheduleNotice:"The source only contains match pairings. Venue, player and unreported result data are not fabricated.",all:"All",standingsTitle:"Standings",standingsCopy:"Current rankings calculated from official match results.",rankingGuide:"Ranking and points guide",rankingGuideText:"Teams are ranked by league points, then wins and winning percentage. A 3–0 result awards 3–0 points; 2–1 awards 2–1 points.",standingsNotice:"Rankings are calculated from official match results: Group A through Sep 20 and Group B through Sep 13, 2026.",aCutoff:"Official results through Sep 20, 2026",bCutoff:"Official results through Sep 13, 2026",teamsCopy:"Teams and schedules across Groups A and B.",footer:"2026 Autumn League · Schedule, standings and teams",teamsCount:"Teams",matchesCount:"Regular-season Matches",completedCount:"Completed",twoGroups:"Groups A and B",matchdays:"matchdays",officialBase:"Official results",matchesUnit:"matches",overviewLine:(teams,matches,done)=>`${teams} teams · ${matches} matches · ${done} completed`,allMatchdays:"All matchdays",noMatches:"No matches found.",official:"Official result",scheduled:"Scheduled",team:"Team",points:"Pts",record:"W–L",rankTeam:"Rank / Team",trend:"Move",wins:"W",losses:"L",played:"GP",winPct:"Win%",teamMeta:(group,w,l)=>`Group ${group} · ${w} W ${l} L`,teamSchedule:"Schedule",close:"Close",teamDetail:(w,l,p,m)=>`${w} W ${l} L · ${p} pts · ${m} regular-season matches`}
};
const uiText={
  zh:{finished:"完賽",win:"勝利",loss:"敗北",opponentStats:"對戰勝率",opponentStatsHint:"依目前已完成賽事，統計對戰各隊的勝敗與勝率。",noGames:"尚未交手",gamesPlayed:n=>`${n} 場・`,scheduleByDate:"球隊賽程（依日期）"},
  en:{finished:"Final",win:"Win",loss:"Loss",opponentStats:"Head-to-head win rate",opponentStatsHint:"Win-loss record and win rate against each opponent, based on completed matches.",noGames:"No meetings",gamesPlayed:n=>`${n} game${n===1?'':'s'} · `,scheduleByDate:"Team schedule by date"}
};

let locale="zh";
try { locale=localStorage.getItem("wuriLeagueLocale")==="en"?"en":"zh"; } catch {}
const t=key=>copy[locale][key];
const u=key=>uiText[locale][key];
const initials=name=>String(name).replace(/[a-z]/gi,"").slice(0,2);
const teamLogoFiles={
  "快樂Da桌球":"A01-happy-da.svg","夢幻羽翼":"A02-dream-wings.svg","好球隊":"A03-good-ball.svg",
  "小三美日":"A04-sanmei.svg","叔叔沒練球":"A05-uncles.svg","陽光男孩":"A06-sunshine-boys.svg",
  "我們這一隊":"B01-our-team.svg","劉家昌":"B02-liu-jia-chang.svg","烏日少年":"B03-wuri-youth.svg",
  "海納百川":"B04-all-rivers.svg","南門金龍":"B05-south-gate-dragon.svg","富士山":"B06-fuji.svg"
};

function dom(tag,{className,text,attrs,dataset}={},...children){
  const element=document.createElement(tag);
  if(className) element.className=className;
  if(text!==undefined) element.textContent=String(text);
  if(attrs) for(const [name,value] of Object.entries(attrs)) element.setAttribute(name,String(value));
  if(dataset) for(const [name,value] of Object.entries(dataset)) element.dataset[name]=String(value);
  for(const child of children.flat(Infinity)) if(child!==null&&child!==undefined) element.append(child instanceof Node?child:document.createTextNode(String(child)));
  return element;
}
function replace(target,...children){target.replaceChildren(...children.flat(Infinity).filter(x=>x!==null&&x!==undefined));return target}
function setLineText(target,value){
  const parts=String(value).split("<br>");
  target.replaceChildren();
  parts.forEach((part,index)=>{if(index)target.append(document.createElement("br"));target.append(document.createTextNode(part))});
}
function teamLogoHTML(name,sizeClass){
  const file=teamLogoFiles[name];
  const fallback=dom("span",{className:"logo-fallback",text:initials(name)});
  const frame=dom("span",{className:`logo-frame ${sizeClass}${file?"":" no-logo"}`,attrs:{"aria-hidden":"true"}});
  if(file){
    const image=dom("img",{attrs:{src:`assets/team-logos/${file}`,alt:"",loading:"lazy"}});
    image.addEventListener("error",()=>{image.hidden=true;fallback.style.display="grid"},{once:true});
    frame.append(image);
  }
  frame.append(fallback);
  return frame;
}
const fmtDate=date=>new Intl.DateTimeFormat(locale==="zh"?"zh-TW":"en-US",{month:"long",day:"numeric",weekday:"short"}).format(new Date(`${date}T12:00:00`));
function switchPage(page){document.querySelectorAll(".page").forEach(node=>node.classList.toggle("active",node.id===page));document.querySelectorAll(".nav-btn").forEach(node=>node.classList.toggle("active",node.dataset.page===page));scrollTo({top:0,behavior:"smooth"})}
document.querySelectorAll("[data-page]").forEach(button=>button.addEventListener("click",()=>switchPage(button.dataset.page)));
document.querySelectorAll("[data-jump]").forEach(button=>button.addEventListener("click",()=>switchPage(button.dataset.jump)));
const isOfficialGame=game=>Object.prototype.hasOwnProperty.call(officialScores,game.id);

function gameCardHTML(game,{perspective=null}={}){
  const score=scores[game.id],done=score&&validScore(score.home,score.away);
  const card=dom("article",{className:`game${done?" done":""}${perspective?" team-perspective":""}`,attrs:{"aria-label":`${game.home} vs ${game.away}`}});
  if(done) card.append(dom("span",{className:"completion-mark",text:"✓",attrs:{"aria-label":u("finished"),title:u("finished")}}));
  const groupText=locale==="zh"?`${game.group} ${t("group")}`:`${t("group")} ${game.group}`;
  card.append(dom("div",{className:"game-top"},dom("span",{className:`group-tag group-${game.group.toLowerCase()}`,text:groupText})));
  const home=dom("div",{className:"team"},teamLogoHTML(game.home,"game-team-logo"),dom("span",{text:game.home}));
  const away=dom("div",{className:"team"},teamLogoHTML(game.away,"game-team-logo"),dom("span",{text:game.away}));
  card.append(dom("div",{className:"teams"},home,dom("div",{className:`versus${done?" score":""}`,text:done?`${score.home}：${score.away}`:"VS"}),away));
  if(done&&perspective){
    const won=game.home===perspective?score.home>score.away:score.away>score.home;
    const result=won?u("win"):u("loss");
    card.append(dom("span",{className:`result-mark ${won?"win":"loss"}`,text:`${won?"🏆":"✕"} ${result}`,attrs:{"aria-label":result}}));
  }
  return card;
}
const gameHTML=game=>gameCardHTML(game);
const homeGameHTML=game=>gameCardHTML(game);
const dates=[...new Set(games.map(game=>game.date))].sort();
function renderSchedule(){
  const list=games.filter(game=>(groupFilter==="ALL"||game.group===groupFilter)&&(selectedDate==="ALL"||game.date===selectedDate)).sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)||a.group.localeCompare(b.group));
  replace(el("dateFilter"),dom("option",{text:t("allMatchdays"),attrs:{value:"ALL"}}),dates.map(date=>dom("option",{text:fmtDate(date),attrs:{value:date}})));
  el("dateFilter").value=selectedDate;
  const grouped=list.reduce((result,game)=>{(result[game.date]??=[]).push(game);return result},{});
  const sections=Object.entries(grouped).map(([date,daily])=>dom("section",{className:`date-section group-${daily[0].group.toLowerCase()}`},
    dom("h2",{className:"date-heading"},dom("time",{text:fmtDate(date),attrs:{datetime:date}}),dom("span",{text:`${daily.length} ${t("matchesUnit")}`})),
    dom("div",{className:"games"},daily.map(gameHTML))));
  replace(el("allGames"),sections.length?sections:dom("p",{text:t("noMatches")}));
}
el("dateFilter").addEventListener("change",event=>{selectedDate=event.target.value;renderSchedule()});
document.querySelectorAll("[data-group]").forEach(button=>button.addEventListener("click",()=>{groupFilter=button.dataset.group;document.querySelectorAll("[data-group]").forEach(node=>node.classList.toggle("active",node===button));renderSchedule()}));

function leaguePoints(winnerScore){return winnerScore===3?[3,0]:[2,1]}
function standings(group,sort=standingsSort[group]){
  const stats=Object.fromEntries(teams[group].map(name=>[name,{name,pts:0,w:0,l:0,trend:officialStandings[group]?.rows?.[name]?.trend||0}]));
  games.filter(game=>game.group===group).forEach(game=>{const score=scores[game.id];if(!score||!validScore(score.home,score.away))return;const home=stats[game.home],away=stats[game.away],homeWon=score.home>score.away,[winnerPoints,loserPoints]=leaguePoints(Math.max(score.home,score.away));if(homeWon){home.w++;away.l++;home.pts+=winnerPoints;away.pts+=loserPoints}else{away.w++;home.l++;away.pts+=winnerPoints;home.pts+=loserPoints}});
  const value=(row,key)=>key==="pct"?row.w/(row.w+row.l||1):row[key],direction=sort.dir==="asc"?1:-1;
  return Object.values(stats).sort((a,b)=>direction*(value(a,sort.key)-value(b,sort.key))||b.pts-a.pts||b.w-a.w||((b.w/(b.w+b.l||1))-(a.w/(a.w+a.l||1)))||a.name.localeCompare(b.name,"zh-Hant"));
}
function trendHTML(value){return dom("span",{text:value>0?`▲ ${value}`:value<0?`▼ ${Math.abs(value)}`:"—",attrs:{style:value>0?"color:#12b76a;font-weight:900":value<0?"color:#e21d2e;font-weight:900":"color:var(--muted)"}})}
function sortHeader(group,key,label){const active=standingsSort[group].key===key,arrow=active?(standingsSort[group].dir==="desc"?"↓":"↑"):"";return dom("button",{className:`sort-button${active?" active":""}`,text:`${label} ${arrow}`,attrs:{type:"button"},dataset:{sortGroup:group,sortKey:key}})}
function teamCell(row,index,group){return dom("span",{className:"team-cell"},dom("span",{className:"rank",text:index+1}),dom("button",{className:"team-link",attrs:{type:"button"},dataset:{teamLink:row.name,linkGroup:group}},teamLogoHTML(row.name,"table-team-logo"),dom("span",{className:"record-team",text:row.name})))}
function tableHTML(group,compact=false){
  const rows=compact?standings(group,{key:"pts",dir:"desc"}):standings(group),table=document.createDocumentFragment();
  const header=dom("tr");
  if(compact){[t("team"),t("wins"),t("losses")].forEach(label=>header.append(dom("th",{text:label})));}
  else {header.append(dom("th",{text:t("rankTeam")}),dom("th",{text:t("trend")}),dom("th",{},sortHeader(group,"pts",t("points"))),dom("th",{},sortHeader(group,"w",t("wins"))),dom("th",{},sortHeader(group,"l",t("losses"))),dom("th",{text:t("played")}),dom("th",{},sortHeader(group,"pct",t("winPct"))));}
  table.append(dom("thead",{},header));
  const body=dom("tbody");
  (compact?rows.slice(0,4):rows).forEach((row,index)=>{const played=row.w+row.l,tr=dom("tr");tr.append(dom("td",{},teamCell(row,index,group)));if(compact)tr.append(dom("td",{className:"pct",text:row.w}),dom("td",{text:row.l}));else tr.append(dom("td",{},trendHTML(row.trend)),dom("td",{className:"pct",text:row.pts}),dom("td",{text:row.w}),dom("td",{text:row.l}),dom("td",{text:played}),dom("td",{text:played?(row.w/played).toFixed(3).replace(/^0/,""):"—"}));body.append(tr)});
  table.append(body);return table;
}
function bindStandings(){document.querySelectorAll("[data-sort-group]").forEach(button=>button.addEventListener("click",()=>{const state=standingsSort[button.dataset.sortGroup],key=button.dataset.sortKey;if(state.key===key)state.dir=state.dir==="desc"?"asc":"desc";else{state.key=key;state.dir="desc"}renderStandings()}));document.querySelectorAll("[data-team-link]").forEach(button=>button.addEventListener("click",()=>goToTeam(button.dataset.teamLink,button.dataset.linkGroup)))}
function renderStandings(){replace(el("standingsA"),tableHTML("A"));replace(el("standingsB"),tableHTML("B"));replace(el("homeA"),tableHTML("A",true));replace(el("homeB"),tableHTML("B",true));bindStandings()}
function statCard(label,value,detail){return dom("div",{className:"card stat-card"},dom("span",{text:label}),dom("strong",{text:value}),dom("small",{text:detail}))}
function renderHome(){const officialCount=games.filter(isOfficialGame).length,completed=games.filter(game=>scores[game.id]&&validScore(scores[game.id].home,scores[game.id].away)).length,totalTeams=teams.A.length+teams.B.length;el("overviewSummary").textContent=t("overviewLine")(totalTeams,games.length,completed);replace(el("homeStats"),statCard(t("teamsCount"),totalTeams,t("twoGroups")),statCard(t("matchesCount"),games.length,`${dates.length} ${t("matchdays")}`),statCard(t("completedCount"),completed,`${t("officialBase")} ${officialCount} ${t("matchesUnit")}`));const today=new Date().toISOString().slice(0,10),next=dates.find(date=>date>=today)||dates[dates.length-1];el("nextDateText").textContent=fmtDate(next);replace(el("nextGames"),games.filter(game=>game.date===next).map(homeGameHTML))}
function renderTeams(){const visibleGroups=teamGroup==="ALL"?["A","B"]:[teamGroup],sections=visibleGroups.map(group=>{const grid=dom("div",{className:"team-grid"});teams[group].forEach(name=>{const stats=standings(group).find(row=>row.name===name),card=dom("article",{className:`card team-card group-${group.toLowerCase()}`,attrs:{tabindex:"0",role:"button"},dataset:{team:name,tgroup:group}},teamLogoHTML(name,"team-card-logo"),dom("div",{className:"team-meta"},dom("h3",{text:name}),dom("span",{},dom("b",{text:t("teamMeta")(group,stats.w,stats.l)}))));const open=()=>showTeam(name,group);card.addEventListener("click",open);card.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();open()}});grid.append(card)});return dom("section",{className:`team-group-section group-${group.toLowerCase()}`,dataset:{teamSection:group}},dom("div",{className:"team-group-heading"},dom("span",{text:group}),dom("h2",{text:locale==="zh"?`${group} ${t("group")}`:`${t("group")} ${group}`})),grid)});replace(el("teamGrid"),sections)}
function opponentStats(name,group){return teams[group].filter(opponent=>opponent!==name).map(opponent=>{const meetings=games.filter(game=>(game.home===name&&game.away===opponent)||(game.away===name&&game.home===opponent)).filter(game=>{const score=scores[game.id];return score&&validScore(score.home,score.away)}),wins=meetings.filter(game=>{const score=scores[game.id];return game.home===name?score.home>score.away:score.away>score.home}).length;return {opponent,played:meetings.length,wins,losses:meetings.length-wins,pct:meetings.length?Math.round(wins/meetings.length*100):null}})}
function goToTeam(name,group){teamGroup=group;document.querySelectorAll("[data-team-group]").forEach(node=>node.classList.toggle("active",node.dataset.teamGroup===group));switchPage("teams");renderTeams();showTeam(name,group)}
function showTeam(name,group,shouldScroll=true){
  const stats=standings(group).find(row=>row.name===name);if(!stats)return;
  activeTeamDetail={name,group};const list=games.filter(game=>game.home===name||game.away===name).sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)),grouped=list.reduce((out,game)=>{(out[game.date]??=[]).push(game);return out},{});
  const headRow=dom("tr");[t("team"),t("played"),t("wins"),t("losses"),t("winPct")].forEach(label=>headRow.append(dom("th",{text:label})));
  const body=dom("tbody");opponentStats(name,group).forEach(row=>body.append(dom("tr",{},dom("td",{},dom("span",{className:"opponent-team"},teamLogoHTML(row.opponent,"opponent-logo"),dom("span",{text:row.opponent}))),dom("td",{text:row.played}),dom("td",{text:row.wins}),dom("td",{text:row.losses}),dom("td",{className:"opponent-pct",text:row.pct===null?"—":`${row.pct}%`}))));
  const opponentSection=dom("section",{className:"opponent-section"},dom("h2",{text:u("opponentStats")}),dom("p",{text:u("opponentStatsHint")}),dom("div",{className:"table-wrap"},dom("table",{className:"opponent-table"},dom("thead",{},headRow),body)));
  const schedule=Object.entries(grouped).map(([date,daily])=>dom("section",{className:`date-section group-${group.toLowerCase()}`},dom("h3",{className:"date-heading"},dom("time",{text:fmtDate(date),attrs:{datetime:date}}),dom("span",{text:`${daily.length} ${t("matchesUnit")}`})),dom("div",{className:"games"},daily.map(game=>gameCardHTML(game,{perspective:name})))));
  const close=dom("button",{className:"btn btn-ghost",text:t("close"),attrs:{type:"button"}});close.addEventListener("click",()=>{activeTeamDetail=null;replace(el("teamDetail"))});
  replace(el("teamDetail"),dom("div",{className:"card team-detail"},teamLogoHTML(name,"team-detail-logo"),dom("div",{},dom("div",{className:"eyebrow",text:`${group} GROUP TEAM`}),dom("h2",{text:name}),dom("p",{text:t("teamDetail")(stats.w,stats.l,stats.pts,list.length)}))),opponentSection,dom("div",{className:"section-head"},dom("div",{},dom("h2",{text:`${name}・${u("scheduleByDate")}`})),close),schedule);
  if(shouldScroll)scrollTo({top:180,behavior:"smooth"});
}
document.querySelectorAll("[data-team-group]").forEach(button=>button.addEventListener("click",()=>{teamGroup=button.dataset.teamGroup;document.querySelectorAll("[data-team-group]").forEach(node=>node.classList.toggle("active",node===button));renderTeams()}));
function applyLocale(next){locale=next==="en"?"en":"zh";try{localStorage.setItem("wuriLeagueLocale",locale)}catch{}document.documentElement.lang=locale==="zh"?"zh-Hant":"en";document.title=locale==="zh"?"烏日桌球聯賽｜2026":"Wuri Table Tennis League | 2026";document.querySelectorAll("[data-i18n]").forEach(node=>{node.textContent=t(node.dataset.i18n)});document.querySelectorAll("[data-i18n-lines]").forEach(node=>setLineText(node,t(node.dataset.i18nLines)));document.querySelectorAll("[data-locale]").forEach(button=>button.classList.toggle("active",button.dataset.locale===locale));renderSchedule();renderStandings();renderHome();renderTeams();if(activeTeamDetail)showTeam(activeTeamDetail.name,activeTeamDetail.group,false)}
document.querySelectorAll("[data-locale]").forEach(button=>button.addEventListener("click",()=>applyLocale(button.dataset.locale)));
window.WuriLeagueApp=Object.freeze({gameCardHTML,teamLogoHTML,renderSchedule,renderTeams,showTeam,getSummary:()=>Object.freeze({teams:teams.A.length+teams.B.length,matches:games.length,results:Object.keys(officialScores).length})});
applyLocale(locale);
