const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const Auth=require('../assets/js/admin-auth.js'),Repositories=require('../assets/js/admin-repository.js');
const source=fs.readFileSync(path.join(__dirname,'../assets/js/admin.js'),'utf8');
async function run({href='https://example.test/admin/',profile=null,user=null,initError=null,google=false,recoveryEvent=false}={}){
 const elements=new Map(),calls=[],shown=[];
 function element(id){if(!elements.has(id)){const classes=new Set(['hidden']);elements.set(id,{id,value:'',disabled:false,textContent:'',dataset:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)},addEventListener(){},setAttribute(){},replaceChildren(...children){this.children=children},append(){},focus(){}})}return elements.get(id)}
 let authListener;const client={auth:{initialize:async()=>{calls.push('initialize');if(recoveryEvent)setTimeout(()=>authListener('PASSWORD_RECOVERY'),0);return {error:initError}},onAuthStateChange(listener){authListener=listener},getSession:async()=>{calls.push('session');return {data:{session:user?{user}:null},error:null}},signOut:async()=>{calls.push('signOut');return {error:null}}},rpc:async()=>{calls.push('profile');return profile?{data:profile,error:null}:{data:null,error:{code:'42501'}}}};
 const url=new URL(href),history={replaceState(_,__,next){calls.push('cleanup');this.next=next}};
 const sandbox={URL,URLSearchParams,Node:class{},location:{href,hash:url.hash,search:url.search,origin:url.origin,pathname:url.pathname},history,document:{title:'管理後台',getElementById:element,querySelectorAll:()=>[],createElement:()=>element('notice-'+Math.random())},window:{LEAGUE_CONFIG:{mode:'supabase',supabaseUrl:'https://test-project.supabase.co',supabasePublishableKey:'public-browser-key-000000000'},LeagueAdminRepository:Repositories,LeagueAdminAuth:{...Auth,googleAvailable:async()=>google},LeagueExcel:{},WuriPublicationUI:{create:()=>({})},supabase:{createClient:(url,key,options)=>{calls.push(options);return client}},addEventListener(){}},setTimeout,clearTimeout,console,innerWidth:1000};
 vm.runInNewContext(source.replace('init();\n})();','showApp=async auth=>{globalThis.shown.push(auth)};globalThis.initPromise=init();\n})();'),Object.assign(sandbox,{shown}));
 await sandbox.initPromise;await Promise.resolve();
 return {elements,calls,shown,history};
}
test('runtime: provider missing disables Google but leaves password login available',async()=>{
 const r=await run();assert.equal(r.elements.get('googleLogin').disabled,true);assert.equal(r.elements.get('remoteLogin').classList.contains('hidden'),false);assert.match(r.elements.get('googleStatus').textContent,/尚未啟用/);assert.equal(r.shown.length,0);
});
test('runtime: valid invited Google session enters with database role only after initialization/profile RPC',async()=>{
 const r=await run({href:'https://example.test/admin/?oauth=google&code=private',user:{id:'invited',user_metadata:{role:'admin'}},profile:{role:'scorer',active:true},google:true});
 assert.equal(r.shown.length,1);assert.equal(r.shown[0].role,'scorer');assert.ok(r.calls.indexOf('initialize')<r.calls.indexOf('profile'));assert.equal(r.history.next,'/admin/');
});
test('runtime: unprofiled OAuth session is signed out and never opens management UI',async()=>{
 const r=await run({href:'https://example.test/admin/?oauth=google&code=private',user:{id:'uninvited'}});assert.equal(r.shown.length,0);assert.ok(r.calls.includes('signOut'));assert.equal(r.history.next,'/admin/');
});
test('runtime: cancellation ignores raw provider detail and clears callback material',async()=>{
 const r=await run({href:'https://example.test/admin/?oauth=google#error=access_denied&error_description=private'});assert.equal(r.shown.length,0);assert.equal(r.history.next,'/admin/');const text=r.elements.get('loginMessage').children[0].textContent;assert.match(text,/取消/);assert.doesNotMatch(text,/private/);
});
test('runtime: valid invitation/recovery links retain password-setting UI and hide Google',async()=>{
 for(const type of ['invite','recovery']){const r=await run({href:`https://example.test/admin/#type=${type}&access_token=private`});assert.equal(r.elements.get('passwordRecovery').classList.contains('hidden'),false);assert.equal(r.elements.get('oauthLogin').classList.contains('hidden'),true);assert.equal(r.shown.length,0);assert.equal(r.history.next,'/admin/');}
});
test('runtime: queued PKCE recovery event wins over automatic session resume',async()=>{
 const r=await run({href:'https://example.test/admin/?code=private',recoveryEvent:true,user:{id:'invited'},profile:{role:'admin',active:true}});assert.equal(r.elements.get('passwordRecovery').classList.contains('hidden'),false);assert.equal(r.shown.length,0);assert.equal(r.calls.includes('profile'),false);
});
test('runtime: failed SDK callback does not report a verified invitation',async()=>{
 const r=await run({href:'https://example.test/admin/#type=invite&access_token=private',initError:{message:'private'}});assert.equal(r.elements.get('passwordRecovery').classList.contains('hidden'),true);assert.equal(r.shown.length,0);
});
