'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
const root=path.join(__dirname,'..');
function load({environment='production',pathname='/wuri-table-tennis-league/',hostname='bollinmore-hermes.github.io',measurementId='G-TQEJNT378W',before=null}={}){
  const {window:domWindow}=parseHTML('<html><head></head><body><section class="page active" id="home"><button data-jump="schedule"><span id="nested">Go</span></button><button data-info-dialog="overviewDialog">Overview</button><a class="venue-map" href="https://maps.example/?secret=hidden">Map</a><button data-locale="en">EN</button><input id="email" value="private@example.com"></section><footer><p id="analyticsNotice" hidden></p></footer></body></html>');
  const window={document:domWindow.document,Event:domWindow.Event};
  const ctx={window,document:window.document,URL,Date,console};
  window.location={hostname,pathname,origin:`https://${hostname}`,href:`https://${hostname}${pathname}?token=secret#private`};
  window.LEAGUE_CONFIG={environment,analyticsMeasurementId:measurementId};
  Object.defineProperty(window.document,'referrer',{value:'https://example.com/private?email=private@example.com'});
  const context=vm.createContext(ctx);if(before)before(window);
  const source=fs.readFileSync(path.join(root,'assets/js/public-analytics.js'),'utf8');
  const run=()=>vm.runInContext(source,context);run();
  const click=s=>window.document.querySelector(s).dispatchEvent(new window.Event('click',{bubbles:true}));
  const commands=()=>Array.from(window.dataLayer||[],a=>Array.from(a));
  return {window,run,click,commands,events:()=>commands().filter(c=>c[0]==='event')};
}
test('GA only initializes on the exact Production public index route',()=>{
  for(const options of [{environment:'test'},{environment:undefined,measurementId:''},{pathname:'/wuri-table-tennis-league/admin/'},{pathname:'/wuri-table-tennis-league/referee/'},{pathname:'/wuri-table-tennis-league/event-rules.html'},{pathname:'/wuri-table-tennis-league-test/'},{hostname:'localhost'},{hostname:'evil.example'},{measurementId:'bad-id'}]){
    const b=load(options);assert.equal(b.commands().length,0);assert.equal(b.window.document.querySelector('script'),null);
  }
  assert.equal(load({pathname:'/wuri-table-tennis-league/index.html'}).events().length,1);
});
test('GA sends one sanitized pageview, disables ad features, and is idempotent',()=>{
  const b=load();b.run();
  assert.equal(b.window.document.querySelectorAll('script').length,1);
  assert.equal(b.window.document.querySelector('script').src,'https://www.googletagmanager.com/gtag/js?id=G-TQEJNT378W');
  const config=b.commands().find(c=>c[0]==='config')[2];
  assert.equal(config.send_page_view,false);assert.equal(config.allow_google_signals,false);assert.equal(config.allow_ad_personalization_signals,false);
  assert.equal(b.events().filter(c=>c[1]==='page_view').length,1);
  const payload=JSON.stringify(b.commands());assert.doesNotMatch(payload,/token=|secret|private@example|#private|\/private/);
  assert.equal(b.events()[0][2].page_referrer,'https://example.com/');
});
test('GA nested click produces one allowlisted navigation event without DOM text',()=>{
  const b=load();b.click('#nested');
  const e=b.events().filter(c=>c[1]==='public_navigation');assert.equal(e.length,1);assert.equal(e[0][2].destination,'schedule');assert.equal(e[0][2].section,'home');
  b.click('#email');assert.equal(b.events().length,2);
});
test('GA public dialogs, map and language interactions have bounded parameters',()=>{
  const b=load();b.click('[data-info-dialog]');b.click('.venue-map');b.click('[data-locale]');
  assert.deepEqual(b.events().map(c=>c[1]),['page_view','public_info_open','public_map_open','public_language_change']);
  assert.doesNotMatch(JSON.stringify(b.events()),/maps.example|hidden|private@example/);
  b.window.document.querySelector('[data-locale]').dataset.locale='private@example.com';b.click('[data-locale]');assert.equal(b.events().length,4);
});
test('GA load failure does not throw or prevent public interaction',()=>{
  const b=load();assert.doesNotThrow(()=>{b.window.document.querySelector('script').dispatchEvent(new b.window.Event('error'));b.click('#nested')});
});
test('GA disclosure appears only when Production analytics initializes',()=>{
  assert.equal(load().window.document.getElementById('analyticsNotice').hidden,false);
  assert.equal(load({environment:'test'}).window.document.getElementById('analyticsNotice').hidden,true);
});
test('GA dynamic filters and team/follow controls never include names or saved preferences',()=>{
  const b=load(),doc=b.window.document;
  doc.getElementById('home').id='schedule';
  doc.body.insertAdjacentHTML('beforeend','<button id="homeVenueButton">Venue</button><button data-team-link="private@example.com">Private Name</button><button data-follow-team-code="A01" aria-pressed="true">Unfollow</button><button data-group="A">A</button><button data-schedule-date="2026-11-01">Date</button><button data-copy-standings="B">Copy</button><button data-sort-group="A" data-sort-key="pts">Sort</button><input id="teamFilter" value="Private Name"><input id="dateFilter" value="2026-11-01">');
  for(const s of ['#homeVenueButton','[data-team-link]','[data-follow-team-code]','[data-group]','[data-schedule-date]','[data-copy-standings]','[data-sort-group]'])b.click(s);
  for(const s of ['#teamFilter','#dateFilter'])doc.querySelector(s).dispatchEvent(new b.window.Event('change',{bubbles:true}));
  assert.equal(b.events().length,10);
  for(const c of b.events().slice(1))assert.equal(c[2].section,'schedule');
  assert.equal(b.events().find(c=>c[1]==='public_follow_toggle')[2].action,'unfollow');
  assert.doesNotMatch(JSON.stringify(b.events()),/private@example|Private Name|A01/);
});
test('GA invalid custom values and disabled controls are ignored',()=>{
  const b=load();b.window.document.body.insertAdjacentHTML('beforeend','<button data-group="private@example.com">Bad</button><button disabled data-jump="teams">Disabled</button><button data-schedule-date="private@example.com">Bad date</button>');
  for(const s of ['[data-group]','[disabled]','[data-schedule-date]'])b.click(s);
  assert.equal(b.events().length,1);
});
test('GA build only injects measurement ID into Production public config',()=>{
  const source=fs.readFileSync(path.join(root,'scripts/build-supabase-pages.cjs'),'utf8');
  assert.match(source,/if\(environment==='production'\)publicConfig\.analyticsMeasurementId='G-TQEJNT378W'/);
  assert.match(source,/assets\/js\/public-analytics\.js/);
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');assert.match(html,/<script src="assets\/js\/public-analytics.js"><\/script>/);
  for(const p of ['admin.html','referee.html','event-rules.html'])assert.doesNotMatch(fs.readFileSync(path.join(root,p),'utf8'),/public-analytics|googletagmanager|G-TQEJNT378W/);
});
