const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const XLSX=require('xlsx');
const E=require('../assets/js/excel-import.js');
const file=path.resolve(__dirname,'../templates/wuri-league-demo-import.xlsx');

test('demo workbook parses expected sheets and counts',()=>{
  const wb=XLSX.readFile(file,{cellDates:true});
  const payload=E.workbookToPayload(XLSX,wb);
  assert.equal(payload.teams.length,12);
  assert.equal(payload.matches.length,60);
  assert.equal(payload.results.length,2);
  assert.equal(payload.snapshots.length,12);
  assert.deepEqual(wb.SheetNames,['README','Teams','Schedule','Results','StandingsSnapshot']);
});

test('demo workbook validates and flags demo warning',()=>{
  const wb=XLSX.readFile(file,{cellDates:true});
  const payload=E.workbookToPayload(XLSX,wb);
  const result=E.validate(payload);
  assert.equal(result.valid,true);
  assert.equal(result.errors.length,0);
  assert.equal(result.warnings.length,1);
});

test('score validation accepts only legal best-of-five team results',()=>{
  for(const pair of [[3,0],[3,1],[3,2],[0,3],[1,3],[2,3]])assert.equal(E.validScore(...pair),true);
  for(const pair of [[2,2],[4,1],[3,3],[-1,3],[0,0]])assert.equal(E.validScore(...pair),false);
});

test('merge upserts matching IDs without deleting old data',()=>{
  const current={teams:[{team_code:'A01',name:'舊名稱'}],matches:[],results:[],snapshots:[]};
  const incoming={teams:[{team_code:'A01',name:'新名稱'},{team_code:'A02',name:'第二隊'}],matches:[],results:[],snapshots:[]};
  const merged=E.merge(current,incoming);
  assert.equal(merged.teams.length,2);
  assert.equal(merged.teams.find(x=>x.team_code==='A01').name,'新名稱');
});

test('invalid workbook data is rejected with row location',()=>{
  const payload={teams:[{_row:2,team_code:'X',name:'錯誤隊',short_name:'錯誤',group:'C',active:true}],matches:[],results:[],snapshots:[]};
  const result=E.validate(payload);
  assert.equal(result.valid,false);
  assert.ok(result.errors.some(x=>x.sheet==='Teams'&&x.row===2));
});
