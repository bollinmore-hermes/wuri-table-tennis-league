/* Production public index only. No consent UI, as approved by the site owner. */
(function(){
  'use strict';
  const config=window.LEAGUE_CONFIG||{},location=window.location;
  if(config.environment!=='production'||location.hostname!=='bollinmore-hermes.github.io'||!/^\/wuri-table-tennis-league\/(?:index\.html)?$/.test(location.pathname)||!/^G-[A-Z0-9]{6,}$/.test(config.analyticsMeasurementId||'')||window.__wuriPublicAnalytics)return;
  window.__wuriPublicAnalytics=true;
  const notice=document.getElementById('analyticsNotice');if(notice)notice.hidden=false;
  const id=config.analyticsMeasurementId,pageLocation=location.origin+'/wuri-table-tennis-league/';
  let referrer='';
  try{const url=new URL(document.referrer);if(/^https?:$/.test(url.protocol))referrer=url.origin+'/'}catch{}
  window.dataLayer=window.dataLayer||[];
  function gtag(){window.dataLayer.push(arguments)}
  const safePage={page_location:pageLocation,page_referrer:referrer,page_title:'Wuri Table Tennis League | 2026'};
  gtag('js',new Date());
  gtag('set',safePage);
  gtag('config',id,{...safePage,send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false});
  // One initial pageview; SPA section changes are custom events, not extra pageviews.
  gtag('event','page_view',{...safePage,send_to:id});
  const script=document.createElement('script');script.async=true;script.src='https://www.googletagmanager.com/gtag/js?id='+id;
  document.head.appendChild(script);
  const sections=['home','schedule','standings','teams'];
  const section=()=>{const value=document.querySelector('.page.active')?.id;return sections.includes(value)?value:'home'};
  const send=(name,params={})=>gtag('event',name,{...safePage,send_to:id,section:section(),...params});
  const group=value=>['ALL','A','B'].includes(value)?value:null;
  const date=value=>value==='ALL'||/^2026-\d{2}-\d{2}$/.test(value||'')?value:null;
  // Capture before application handlers replace DOM or switch sections. Never read
  // textContent, input text, team/player names, link URLs, or browser storage.
  document.addEventListener('click',event=>{
    const node=event.target.closest?.('button,a,[data-team][data-tgroup]');if(!node||node.disabled)return;
    const d=node.dataset;
    if(sections.includes(d.page||d.jump))send('public_navigation',{destination:d.page||d.jump});
    else if(['overviewDialog','venueDialog'].includes(d.infoDialog)||node.id==='homeVenueButton')send('public_info_open',{info_type:d.infoDialog==='overviewDialog'?'overview':'venue'});
    else if(node.classList.contains('venue-map'))send('public_map_open');
    else if(['eventRulesEntry','rankingRulesLink'].includes(node.id))send('public_rules_open');
    else if(['zh','en'].includes(d.locale))send('public_language_change',{language:d.locale});
    else if(d.group&&group(d.group))send('public_filter_change',{filter_type:'group',selection:group(d.group)});
    else if(d.teamGroup&&group(d.teamGroup))send('public_filter_change',{filter_type:'team_group',selection:group(d.teamGroup)});
    else if(d.scheduleDate&&date(d.scheduleDate))send('public_filter_change',{filter_type:'date',selection:date(d.scheduleDate)});
    else if(node.id==='clearScheduleFilters')send('public_filter_reset');
    else if(node.id==='themeToggle')send('public_theme_toggle');
    else if(d.teamLink!==undefined||d.team!==undefined)send('public_team_open');
    else if(d.followTeamCode!==undefined)send('public_follow_toggle',{action:node.getAttribute('aria-pressed')==='true'?'unfollow':'follow'});
    else if(d.copyStandings&&group(d.copyStandings))send('public_standings_copy',{group:group(d.copyStandings)});
    else if(d.sortGroup&&group(d.sortGroup)&&['pts','w','l','pct','trend','name'].includes(d.sortKey))send('public_standings_sort',{group:group(d.sortGroup),sort_key:d.sortKey});
  },true);
  document.addEventListener('change',event=>{
    const node=event.target;
    if(node.id==='dateFilter'&&date(node.value))send('public_filter_change',{filter_type:'date',selection:date(node.value)});
    // Team filter values are human-readable names; send only all vs specific.
    else if(node.id==='teamFilter')send('public_filter_change',{filter_type:'team',selection:node.value==='ALL'?'all':'specific'});
  },true);
})();
