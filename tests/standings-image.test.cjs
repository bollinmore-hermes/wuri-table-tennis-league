const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../assets/js/standings-image.js'),'utf8');
function load(extra={}){const sandbox={...extra};sandbox.window=sandbox;vm.runInNewContext(source,sandbox);return sandbox.WuriStandingsImage}
test('#54 dimensions include full horizontal and vertical scroll content',()=>{
 const api=load();assert.deepEqual(JSON.parse(JSON.stringify(api.dimensions({getBoundingClientRect:()=>({width:390,height:100}),scrollWidth:720,scrollHeight:500}))),{width:720,height:500});
 assert.throws(()=>api.dimensions({getBoundingClientRect:()=>({width:0,height:0}),scrollWidth:0,scrollHeight:0}));
 assert.throws(()=>api.dimensions({getBoundingClientRect:()=>({width:10000,height:10000}),scrollWidth:10000,scrollHeight:10000}));
});
test('#54 unsupported contexts fail clearly in both locales without mutating table',async()=>{
 const api=load({isSecureContext:false}),button={disabled:false},table={};
 for(const locale of ['zh','en']){const status={textContent:''};assert.equal(await api.copyTable({table,button,status,locale}),false);assert.match(status.textContent,locale==='en'?/No download or text fallback/:/不會改成下載或文字/);assert.equal(button.disabled,false)}
});
test('#54 repeat click while busy does not write again',async()=>{
 const api=load({isSecureContext:true,navigator:{clipboard:{write(){throw Error('must not call')}}}});
 assert.equal(await api.copyTable({button:{disabled:true},status:{}}),false);
});
test('#54 contains only PNG clipboard path, no popup/download or text copy',()=>{
 assert.match(source,/new root\.ClipboardItem\(\{'image\/png':png\}\)/);assert.doesNotMatch(source,/writeText|showModal|\.download\s*=|window\.open/);
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');assert.equal((html.match(/data-copy-standings=/g)||[]).length,2);
 assert.match(html,/role="status" aria-live="polite"/);
 for(const builder of ['build-pages.cjs','build-test.cjs','build-supabase-pages.cjs'])assert.match(fs.readFileSync(path.join(__dirname,'../scripts',builder),'utf8'),/assets\/js\/standings-image\.js/);
});
