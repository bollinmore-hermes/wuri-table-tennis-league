const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const XLSX=require('xlsx');
const E=require('../assets/js/excel-import.js');
let passed=0;function test(name,fn){try{fn();passed++;console.log(`✓ ${name}`)}catch(e){console.error(`✗ ${name}\n  ${e.message}`);process.exitCode=1}}
const base={
 teams:[{_row:2,team_code:'A01',name:'甲隊',short_name:'甲',group:'A',active:true},{_row:3,team_code:'A02',name:'乙隊',short_name:'乙',group:'A',active:true}],
 matches:[{_row:2,match_code:'M1',group:'A',date:'2026-10-01',time:'15:30',home_team_code:'A01',away_team_code:'A02',venue:'',status:'scheduled'}],
 results:[{_row:2,match_code:'M1',home_score:2,away_score:1,status:'final',note:''}],snapshots:[]
};
test('合法比分只接受 3–0 與 2–1 及主客對調',()=>{for(const [h,a] of [[3,0],[0,3],[2,1],[1,2]])assert.equal(E.validScore(h,a),true);for(const [h,a] of [[3,1],[3,2],[2,0],[1,1]])assert.equal(E.validScore(h,a),false)});
test('正確資料通過驗證',()=>assert.equal(E.validate(base).valid,true));
test('未知球隊會阻止匯入',()=>{const bad=structuredClone(base);bad.matches[0].away_team_code='A99';assert.match(E.validate(bad).errors[0].message,/找不到客隊/)});
test('非法比分會阻止匯入',()=>{const bad=structuredClone(base);bad.results[0].home_score=3;bad.results[0].away_score=2;assert.match(E.validate(bad).errors.find(x=>x.sheet==='Results').message,/3–0/)});
test('merge 採 upsert 且不刪除舊資料',()=>{const current={teams:[{team_code:'A01',name:'舊名'}],matches:[{match_code:'OLD'}],results:[],snapshots:[]};const incoming={teams:[{team_code:'A01',name:'新名'}],matches:[],results:[],snapshots:[]};const merged=E.merge(current,incoming);assert.equal(merged.teams[0].name,'新名');assert.equal(merged.matches[0].match_code,'OLD')});
test('排名計算套用 3–0 與 2–1 積分',()=>{const p=structuredClone(base);p.matches.push({_row:3,match_code:'M2',group:'A',date:'2026-10-02',time:'15:30',home_team_code:'A02',away_team_code:'A01',venue:'',status:'scheduled'});p.results.push({_row:3,match_code:'M2',home_score:3,away_score:0,status:'final',note:''});const rows=E.calculateStandings(p).A;assert.deepEqual(rows.map(x=>[x.team_code,x.points,x.wins,x.losses]),[['A02',4,1,1],['A01',2,1,1]])});
test('標準 5-sheet 範本仍可解析與驗證',()=>{const file=path.resolve(__dirname,'../templates/wuri-league-demo-import.xlsx'),wb=XLSX.readFile(file,{cellDates:true}),p=E.workbookToPayload(XLSX,wb),check=E.validate(p);assert.deepEqual(wb.SheetNames,['README','Teams','Schedule','Results','StandingsSnapshot']);assert.deepEqual([p.teams.length,p.matches.length,p.results.length,p.snapshots.length],[12,60,2,12]);assert.equal(check.valid,true,JSON.stringify(check.errors))});
const officialPath=process.env.OFFICIAL_XLSX;
if(!officialPath)console.log('↷ OFFICIAL_XLSX 未設定；略過私人正式工作簿整合測試');
else if(!fs.existsSync(officialPath))console.log(`↷ OFFICIAL_XLSX 指定檔案不存在；略過私人正式工作簿整合測試：${officialPath}`);
else test('正式 3-sheet 成績表解析為 12 隊、60 場、26 筆賽果並核對排名',()=>{const wb=XLSX.readFile(officialPath,{cellDates:true}),p=E.workbookToPayload(XLSX,wb),check=E.validate(p);assert.deepEqual(wb.SheetNames,['A組成績','B組成績','即時排名']);assert.deepEqual([p.teams.length,p.matches.length,p.results.length,p.snapshots.length],[12,60,26,12]);assert.equal(check.valid,true,JSON.stringify(check.errors));const s=E.calculateStandings(p);assert.deepEqual(s.A.map(x=>x.points),[15,11,8,6,4,1]);assert.deepEqual(s.B.map(x=>x.points),[9,8,7,4,4,1])});
if(!process.exitCode)console.log(`\n${passed} tests passed`);
